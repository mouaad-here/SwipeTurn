import os
from datetime import datetime, timedelta
import pytz
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List, Optional

from dependencies import get_supabase, get_current_user
from services.matching import score_job_for_user, get_dedup_key, assess_profile_quality
from services.embeddings import build_user_profile_text_from_user, get_embedding_model
from constants import (
    get_seniority_filter,
    build_eligibility_filter,
    MIN_FEED_SCORE,
    DOMAIN_KEYWORDS,
)

router = APIRouter(prefix="/jobs", tags=["Jobs"])
JOB_MAX_AGE_DAYS = int(os.getenv("JOB_MAX_AGE_DAYS", "14"))
DAILY_BATCH_SIZE = int(os.getenv("DAILY_BATCH_SIZE", "25"))
BATCH_RESET_HOUR = 8   # 8:00 AM Africa/Casablanca
BATCH_TZ = pytz.timezone("Africa/Casablanca")


def get_batch_window() -> tuple[datetime, datetime]:
    """
    Returns (window_start_utc, next_reset_utc) for the current daily batch window.

    The window starts at 08:00 Africa/Casablanca each day.
    If the current time is before 08:00, the active window started yesterday.
    Both datetimes are returned as UTC-aware objects for DB storage.
    """
    now_local = datetime.now(BATCH_TZ)
    today_reset = now_local.replace(hour=BATCH_RESET_HOUR, minute=0, second=0, microsecond=0)

    if now_local < today_reset:
        # Before today's 8 AM — active window started yesterday at 8 AM
        window_start_local = today_reset - timedelta(days=1)
        next_reset_local = today_reset
    else:
        # At or after today's 8 AM
        window_start_local = today_reset
        next_reset_local = today_reset + timedelta(days=1)

    return window_start_local.astimezone(pytz.utc), next_reset_local.astimezone(pytz.utc)


@router.get("/feed")
def get_job_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user: dict = Depends(get_current_user)
):
    """
    Returns jobs for today's personalized batch.

    First request after the daily reset (08:00 Africa/Casablanca) triggers
    batch generation: scores + ranks up to DAILY_BATCH_SIZE jobs and persists
    them to daily_feed_batch_items. Subsequent requests within the same window
    read the pre-ranked batch — no re-scoring until tomorrow.

    Response includes:
      remaining_today  — unswiped jobs left in today's batch
      next_reset_at    — ISO-8601 UTC timestamp of next 08:00 reset
      batch_exhausted  — true when remaining_today == 0
    """
    try:
        supabase = get_supabase()
        user_id = user["id"]
        prefs = user.get("preferences") or {}

        # --- Step 1: determine today's window ---
        window_start_utc, next_reset_utc = get_batch_window()
        window_start_iso = window_start_utc.isoformat()
        next_reset_iso = next_reset_utc.isoformat()

        # --- Step 2: always fetch today's swiped IDs (source of truth) ---
        swipes_res = supabase.table("swipes").select("job_id").eq("user_id", user_id).execute()
        swiped_ids = set(s["job_id"] for s in swipes_res.data)

        # --- Step 3: look up (or create) today's batch ---
        batch = None
        batch_res = (
            supabase.table("daily_feed_batches")
            .select("id, batch_size, is_exhausted")
            .eq("user_id", user_id)
            .eq("window_start", window_start_iso)
            .limit(1)
            .execute()
        )
        if batch_res.data:
            batch = batch_res.data[0]

        # --- Step 4: if no batch exists, generate one now (lazy) ---
        if batch is None:
            print(f"[feed] generating new batch for user_id={user_id}, window={window_start_iso}")

            user_skills = user.get("extracted_skills") or []
            if not user_skills and prefs:
                user_skills = list(prefs.get("keywords") or []) + list(prefs.get("domains") or [])

            profile_quality = assess_profile_quality(user)
            is_generic_feed = profile_quality in ["empty", "weak"]
            stats = {"scored": 0, "after_min_score": 0, "reranked": 0, "reranker_latency_ms": 0}

            # Fetch candidates
            min_posted_at = (datetime.utcnow() - timedelta(days=JOB_MAX_AGE_DAYS)).isoformat()
            query = (
                supabase.table("jobs")
                .select("*")
                .eq("is_active", True)
                .gte("posted_at", min_posted_at)
                .not_.is_("apply_url", "null")
            )

            user_geography = (prefs.get("geography") or "").lower()
            eligibility = build_eligibility_filter(user)

            if "or" in eligibility:
                query = query.or_("job_region.eq.MA,globally_accessible.eq.true,globally_accessible.is.null")
            elif "job_region" in eligibility:
                query = query.eq("job_region", eligibility["job_region"])
            else:
                if eligibility.get("globally_accessible"):
                    query = query.or_("globally_accessible.eq.true,globally_accessible.is.null")
                if eligibility.get("open_to_intl"):
                    query = query.or_("open_to_intl.eq.true,open_to_intl.is.null")
                if eligibility.get("remote_type"):
                    query = query.eq("remote_type", eligibility["remote_type"])

            onboarding_seniority = (prefs.get("seniority") or "").lower().strip()
            user_seniority = onboarding_seniority if onboarding_seniority else "mid"
            allowed_levels = get_seniority_filter(user_seniority)
            if allowed_levels:
                query = query.or_(
                    "experience_level.is.null," +
                    ",".join(f"experience_level.eq.{lvl}" for lvl in allowed_levels)
                )

            user_job_types = prefs.get("job_type") or []
            if user_job_types:
                job_type_filter = "job_type.is.null," + ",".join(
                    f"job_type.eq.{t.lower()}" for t in user_job_types
                )
                query = query.or_(job_type_filter)

            FEED_FETCH_LIMIT = 1000
            query = query.limit(FEED_FETCH_LIMIT).order("posted_at", desc=True)
            raw_jobs = query.execute().data or []
            print(f"[feed] raw_jobs={len(raw_jobs)} for batch generation")

            # Exclude swiped + deduplicate
            n_swiped_excluded = 0
            n_bad_url = 0
            n_deduped = 0
            seen_title_company: set = set()
            candidate_jobs = []
            for j in raw_jobs:
                if j["id"] in swiped_ids:
                    n_swiped_excluded += 1
                    continue
                apply_url = (j.get("apply_url") or "").strip()
                if not apply_url.startswith(("http://", "https://")):
                    n_bad_url += 1
                    continue
                dedup_key = (
                    (j.get("title") or "").strip().lower(),
                    (j.get("company") or "").strip().lower(),
                )
                if dedup_key in seen_title_company:
                    n_deduped += 1
                    continue
                seen_title_company.add(dedup_key)
                candidate_jobs.append(j)
            print(f"[feed] exclusion: swiped={n_swiped_excluded} bad_url={n_bad_url} deduped={n_deduped} remaining={len(candidate_jobs)} user_id={user_id}")

            # Domain filter
            user_domains = prefs.get("domains") or []
            if user_domains:
                domain_kws: set = set()
                for d in user_domains:
                    for kw in DOMAIN_KEYWORDS.get(d, [d.lower()]):
                        domain_kws.add(kw.lower())

                def _matches_user_domain(job: dict) -> bool:
                    text = " ".join([
                        (job.get("title") or "").lower(),
                        " ".join(job.get("required_skills") or []).lower(),
                        (job.get("category") or "").lower(),
                        (job.get("subcategory") or "").lower(),
                        (job.get("description_text") or "")[:1200].lower(),
                    ])
                    return any(kw in text for kw in domain_kws)

                domain_filtered = [j for j in candidate_jobs if _matches_user_domain(j)]
                print(f"[feed] domain filter: domains={user_domains} matched={len(domain_filtered)}/{len(candidate_jobs)} user_id={user_id}")
                if domain_filtered:
                    candidate_jobs = domain_filtered

            # Resolve embedding
            scoring_user = user
            try:
                if not user.get("cv_embedding"):
                    profile_text = build_user_profile_text_from_user(user)
                    if profile_text:
                        model = get_embedding_model()
                        user_embedding = model.encode(profile_text).tolist()
                        scoring_user = user.copy()
                        scoring_user["cv_embedding"] = user_embedding
                        try:
                            supabase.table("users").update({"cv_embedding": user_embedding}).eq("id", user_id).execute()
                        except Exception as e:
                            print(f"[feed] Error saving lazy CV embedding: {e}")
            except Exception:
                pass

            # Score
            scored_jobs = []
            for job in candidate_jobs:
                scores = score_job_for_user(job, scoring_user, is_generic_feed=is_generic_feed)
                job.update(scores)
                job["match_score"] = scores["fit_score"]
                scored_jobs.append(job)

            stats["scored"] = len(scored_jobs)

            if is_generic_feed:
                strict_jobs = scored_jobs
            else:
                strict_jobs = [j for j in scored_jobs if float(j.get("fit_score") or 0) >= MIN_FEED_SCORE]
                # Partial-profile fallback: strong-profile scoring eliminated every candidate.
                # Rather than issuing an empty batch, serve all scored jobs unfiltered so
                # the user sees something. Full-profile users still get the strict threshold.
                if not strict_jobs and profile_quality == "partial":
                    strict_jobs = scored_jobs
                    print(f"[feed] partial profile fallback: {len(strict_jobs)} jobs issued (MIN_FEED_SCORE bypassed for user_id={user_id})")

            stats["after_min_score"] = len(strict_jobs)

            for j in strict_jobs:
                j["final_sort_score"] = j["rank_score"]

            strict_jobs.sort(
                key=lambda x: (float(x.get("final_sort_score") or 0), x.get("posted_at") or ""),
                reverse=True,
            )

            # Reranker
            from services.reranker import rerank_pairs, RERANK_TOP_K
            if not is_generic_feed and len(strict_jobs) > 0:
                user_text_for_rerank = build_user_profile_text_from_user(user)
                if user_text_for_rerank:
                    user_snippet = user_text_for_rerank[:1000]
                    top_finalists = strict_jobs[:RERANK_TOP_K]
                    pairs = []
                    for j in top_finalists:
                        job_desc = (j.get("description_text") or "")[:800]
                        job_title = j.get("title") or ""
                        pairs.append((user_snippet, f"{job_title}. {job_desc}"))
                    result = rerank_pairs(pairs, timeout_seconds=4.0)
                    if result is not None:
                        rerank_scores, rerank_latency_ms = result
                        if len(rerank_scores) == len(top_finalists):
                            for j, score in zip(top_finalists, rerank_scores):
                                j["reranker_score"] = score
                                j["final_sort_score"] = float(j.get("rank_score", 0)) + float(score) * 2.5
                            top_finalists.sort(
                                key=lambda x: (float(x.get("final_sort_score") or 0), x.get("posted_at") or ""),
                                reverse=True
                            )
                            strict_jobs[:RERANK_TOP_K] = top_finalists
                            stats["reranked"] = len(top_finalists)
                            stats["reranker_latency_ms"] = round(rerank_latency_ms, 1)

            # Take top DAILY_BATCH_SIZE
            batch_candidates = strict_jobs[:DAILY_BATCH_SIZE]
            actual_batch_size = len(batch_candidates)

            # Persist batch header — UNIQUE constraint handles race conditions
            try:
                batch_insert = supabase.table("daily_feed_batches").insert({
                    "user_id": user_id,
                    "window_start": window_start_iso,
                    "next_reset_at": next_reset_iso,
                    "batch_size": actual_batch_size,
                    "timezone": "Africa/Casablanca",
                    "is_exhausted": False,
                }).execute()
                batch = batch_insert.data[0]
            except Exception as insert_err:
                # Race: another request already created the batch — fetch it
                if "23505" in str(insert_err) or "unique" in str(insert_err).lower():
                    print(f"[feed] race: batch already exists, fetching...")
                    batch_res2 = (
                        supabase.table("daily_feed_batches")
                        .select("id, batch_size, is_exhausted")
                        .eq("user_id", user_id)
                        .eq("window_start", window_start_iso)
                        .limit(1)
                        .execute()
                    )
                    batch = batch_res2.data[0] if batch_res2.data else None
                    batch_candidates = []  # Don't write items — other request already will
                else:
                    raise insert_err

            # Persist batch items (only when we created the batch)
            if batch and batch_candidates:
                items = [
                    {
                        "batch_id": batch["id"],
                        "job_id": j["id"],
                        "rank": idx + 1,
                        "fit_score": round(float(j.get("fit_score") or 0), 4),
                    }
                    for idx, j in enumerate(batch_candidates)
                ]
                try:
                    supabase.table("daily_feed_batch_items").insert(items).execute()
                except Exception as e:
                    print(f"[feed] ERROR: batch item insertion failed for batch_id={batch['id']} user_id={user_id}: {type(e).__name__}: {e}")

            print(f"[feed] batch generated: size={actual_batch_size} user_id={user_id} stats={stats}")

        # --- Step 5: read from the persisted batch ---
        if batch is None:
            # Fallback: empty state (should never happen in practice)
            return {
                "page": page, "limit": limit,
                "total_available": 0, "total_returned": 0,
                "remaining_today": 0,
                "next_reset_at": next_reset_iso,
                "batch_exhausted": True,
                "jobs": [],
            }

        # Fast-path: batch already exhausted
        if batch.get("is_exhausted"):
            return {
                "page": page, "limit": limit,
                "total_available": 0, "total_returned": 0,
                "remaining_today": 0,
                "next_reset_at": next_reset_iso,
                "batch_exhausted": True,
                "jobs": [],
            }

        # Fetch all batch items in rank order
        items_res = (
            supabase.table("daily_feed_batch_items")
            .select("job_id, rank, fit_score")
            .eq("batch_id", batch["id"])
            .order("rank", desc=False)
            .execute()
        )
        all_items = items_res.data or []

        # Remaining = batch items not yet swiped
        unswiped_items = [it for it in all_items if it["job_id"] not in swiped_ids]
        remaining_today = len(unswiped_items)

        # Lazily mark exhausted once all items consumed
        if remaining_today == 0 and not batch.get("is_exhausted"):
            try:
                supabase.table("daily_feed_batches").update({"is_exhausted": True}).eq("id", batch["id"]).execute()
            except Exception:
                pass
            return {
                "page": page, "limit": limit,
                "total_available": 0, "total_returned": 0,
                "remaining_today": 0,
                "next_reset_at": next_reset_iso,
                "batch_exhausted": True,
                "jobs": [],
            }

        # Page through unswiped items
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        page_items = unswiped_items[start_idx:end_idx]
        page_job_ids = [it["job_id"] for it in page_items]
        fit_score_map = {it["job_id"]: it["fit_score"] for it in page_items}

        # Fetch full job rows for this page
        if not page_job_ids:
            return {
                "page": page, "limit": limit,
                "total_available": remaining_today,
                "total_returned": 0,
                "remaining_today": remaining_today,
                "next_reset_at": next_reset_iso,
                "batch_exhausted": False,
                "jobs": [],
            }

        jobs_res = supabase.table("jobs").select("*").in_("id", page_job_ids).execute()
        jobs_by_id = {j["id"]: j for j in (jobs_res.data or [])}

        # Re-attach scoring context and preserve batch rank order
        ALLOWED_JOB_FIELDS = {
            "id", "title", "company", "company_logo_url", "location", "city",
            "country_code", "is_remote", "type", "job_type", "posted_at",
            "status", "is_active", "match_score", "matched_skills",
            "missing_skills", "description_text", "apply_url"
        }

        filtered_jobs = []
        for job_id in page_job_ids:
            job = jobs_by_id.get(job_id)
            if not job:
                continue
            # Attach snapshot score from batch so frontend sees a stable value
            job["match_score"] = round(fit_score_map.get(job_id, 0) * 100, 1)
            # Run scoring for matched_skills / missing_skills display only
            scores = score_job_for_user(job, user)
            job["matched_skills"] = scores.get("matched_skills", [])
            job["missing_skills"] = scores.get("missing_skills", [])
            filtered_jobs.append({k: v for k, v in job.items() if k in ALLOWED_JOB_FIELDS})

        has_cv = bool(user.get("cv_embedding"))
        print(f"[feed] served page={page} remaining={remaining_today} batch_id={batch['id']} user_id={user_id}")

        return {
            "page": page,
            "limit": limit,
            "total_available": remaining_today,
            "total_returned": len(filtered_jobs),
            "remaining_today": remaining_today,
            "next_reset_at": next_reset_iso,
            "batch_exhausted": False,
            "jobs": filtered_jobs,
        }

    except Exception as e:
        import traceback
        print(f"[feed] INTERNAL ERROR: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal Feed Error: {str(e)}")




@router.get("/search")
def search_jobs(
    q: str = Query(..., min_length=1),
    exact_priority: bool = Query(False),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Search jobs by free-text query with optional exact-match priority boost."""
    import re as re_mod
    query_tokens = [t.lower() for t in re_mod.split(r'\s+', q.strip()) if t]

    user_id = user["id"]
    user_skills = user.get("extracted_skills") or []
    prefs = user.get("preferences") or {}
    if not user_skills and prefs:
        user_skills = list(prefs.get("keywords") or []) + list(prefs.get("domains") or [])

    swipes_res = get_supabase().table("swipes").select("job_id").eq("user_id", user_id).execute()
    swiped_ids = {s["job_id"] for s in swipes_res.data}

    SEARCH_FETCH_LIMIT = 500
    min_posted_at = (datetime.utcnow() - timedelta(days=JOB_MAX_AGE_DAYS)).isoformat()
    query_db = (
        get_supabase()
        .table("jobs")
        .select("*")
        .eq("is_active", True)
        .gte("posted_at", min_posted_at)
        .not_.is_("apply_url", "null")
        .limit(SEARCH_FETCH_LIMIT)
        .order("posted_at", desc=True)
    )
    try:
        raw_jobs = query_db.execute().data or []
    except Exception:
        raw_jobs = []

    seen: set = set()
    candidates = []
    for j in raw_jobs:
        if j["id"] in swiped_ids:
            continue
        if not (j.get("apply_url") or "").strip().startswith(("http://", "https://")):
            continue
        key = ((j.get("title") or "").strip().lower(), (j.get("company") or "").strip().lower())
        if key in seen:
            continue
        seen.add(key)
        candidates.append(j)

    def _is_relevant(job: dict) -> bool:
        text = " ".join([
            (job.get("title") or "").lower(),
            " ".join(job.get("required_skills") or []).lower(),
            (job.get("description_text") or "")[:2000].lower(),
        ])
        return any(t in text for t in query_tokens)

    candidates = [j for j in candidates if _is_relevant(j)]

    scored = []
    for job in candidates:
        scores = score_job_for_user(job, user, query_tokens=query_tokens, exact_priority=exact_priority)
        job.update(scores)
        job["match_score"] = scores["fit_score"]
        job["final_sort_score"] = float(scores["rank_score"]) + float(scores["search_boost"])
        scored.append(job)

    scored.sort(key=lambda x: (float(x.get("final_sort_score") or 0), x.get("posted_at") or ""), reverse=True)
    start = (page - 1) * limit
    paginated = scored[start:start + limit]

    return {
        "page": page,
        "limit": limit,
        "total_available": len(scored),
        "total_returned": len(paginated),
        "query": q,
        "jobs": paginated,
    }


@router.get("/{job_id}")
def get_single_job(job_id: str, user: dict = Depends(get_current_user)):
    """Fetches a single job detail view and calculates dynamic match for the current user."""
    res = get_supabase().table("jobs").select("*").eq("id", job_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")

    job = res.data[0]
    user_skills = user.get("extracted_skills") or []

    scores = score_job_for_user(job, user)
    job.update(scores)
    job["match_score"] = scores["fit_score"]

    return job


@router.post("/{job_id}/apply")
def mark_applied(job_id: str, user: dict = Depends(get_current_user)):
    """Mark job as applied (intent = action) and return apply_url."""
    user_id = user["id"]

    job_res = get_supabase().table("jobs").select("apply_url").eq("id", job_id).execute()
    if not job_res.data:
        raise HTTPException(status_code=404, detail="Job not found")

    apply_url = job_res.data[0].get("apply_url")

    get_supabase().table("swipes").upsert({
        "user_id": user_id,
        "job_id": job_id,
        "direction": "right",
        "status": "applied",
        "applied_at": datetime.utcnow().isoformat(),
    }).execute()

    return {"apply_url": apply_url}
