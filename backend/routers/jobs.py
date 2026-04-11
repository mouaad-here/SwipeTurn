import os
from datetime import datetime, timedelta
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


@router.get("/feed")
def get_job_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user: dict = Depends(get_current_user)
):
    """
    Returns jobs scored and sorted by match, excluding jobs already swiped.
    Seniority = hard filter. Scoring = skill overlap + domain + job type.
    Sorted by posted_at DESC after scoring (recency = sort, not score).
    """
    try:
        user_id = user["id"]
        prefs = user.get("preferences") or {}
        user_skills = user.get("extracted_skills") or []
        if not user_skills and prefs:
            user_skills = list(prefs.get("keywords") or []) + list(prefs.get("domains") or [])

        # 1. Exclude swiped jobs
        swipes_res = get_supabase().table("swipes").select("job_id").eq("user_id", user_id).execute()
        swiped_ids = set(s["job_id"] for s in swipes_res.data)

        # 2. Build query with filters
        min_posted_at = (datetime.utcnow() - timedelta(days=JOB_MAX_AGE_DAYS)).isoformat()
        query = (
            get_supabase()
            .table("jobs")
            .select("*")
            .eq("is_active", True)
            .gte("posted_at", min_posted_at)
            .not_.is_("apply_url", "null")
        )

        # Geography + eligibility filter
        user_geography = (prefs.get("geography") or "").lower()
        eligibility = build_eligibility_filter(user)

        if "or" in eligibility:
            # DISCOVERY MODE: Allow NULL for globally_accessible because most job postings 
            # do not explicitly confirm international eligibility. We only exclude 
            # if excludes_morocco was explicitly set to True by the LLM.
            query = query.or_("job_region.eq.MA,globally_accessible.eq.true,globally_accessible.is.null")
        elif "job_region" in eligibility:
            query = query.eq("job_region", eligibility["job_region"])
        else:
            # International candidates: Allow NULL for both fields to avoid an empty feed.
            if eligibility.get("globally_accessible"):
                query = query.or_("globally_accessible.eq.true,globally_accessible.is.null")
            if eligibility.get("open_to_intl"):
                query = query.or_("open_to_intl.eq.true,open_to_intl.is.null")
            if eligibility.get("remote_type"):
                query = query.eq("remote_type", eligibility["remote_type"])

        # Seniority: strict hard filter.
        # Source of truth = preferences.seniority (user's explicit onboarding choice).
        # user.experience_level is CV-parsed metadata only — never used for feed filtering.
        # Default = 'mid' (product default, not derived from CV).
        onboarding_seniority = (prefs.get("seniority") or "").lower().strip()
        user_seniority = onboarding_seniority if onboarding_seniority else "mid"
        
        cv_parsed_seniority = (user.get("parsed_experience_level") or "").lower().strip()
        allowed_levels = get_seniority_filter(user_seniority)
        if allowed_levels:
            query = query.or_(
                "experience_level.is.null," +
                ",".join(f"experience_level.eq.{lvl}" for lvl in allowed_levels)
            )

        # Job type filter
        user_job_types = prefs.get("job_type") or []
        if user_job_types:
            job_type_filter = "job_type.is.null," + ",".join(
                f"job_type.eq.{t.lower()}" for t in user_job_types
            )
            query = query.or_(job_type_filter)

        FEED_FETCH_LIMIT = 1000
        query = query.limit(FEED_FETCH_LIMIT).order("posted_at", desc=True)
        
        jobs_res = query.execute()
        raw_jobs = jobs_res.data or []
        print(f"[feed] raw_jobs={len(raw_jobs)} for user_id={user_id}, page={page}, limit={limit}")

        # 3. Exclude swiped, deduplicate
        seen_title_company: set = set()
        candidate_jobs = []
        for j in raw_jobs:
            if j["id"] in swiped_ids:
                continue
            if not (j.get("apply_url") or "").strip().startswith(("http://", "https://")):
                continue
            dedup_key = (
                (j.get("title") or "").strip().lower(),
                (j.get("company") or "").strip().lower(),
            )
            if dedup_key in seen_title_company:
                continue
            seen_title_company.add(dedup_key)
            candidate_jobs.append(j)

        print(f"[feed] candidate_jobs_after_exclusions={len(candidate_jobs)} (before domain filter)")

        # 4. Domain filter
        user_domains = prefs.get("domains") or []
        if user_domains:
            domain_kws: set[str] = set()
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

            candidate_jobs = [j for j in candidate_jobs if _matches_user_domain(j)]
            print(f"[feed] candidate_jobs_after_domain_filter={len(candidate_jobs)}")

        # 5. Resolve user embedding
        user_embedding = None
        try:
            if user.get("cv_embedding"):
                user_embedding = user["cv_embedding"]
            else:
                profile_text = build_user_profile_text_from_user(user)
                if profile_text:
                    model = get_embedding_model()
                    user_embedding = model.encode(profile_text).tolist()
<<<<<<< HEAD
=======
                    try:
                        get_supabase().table("users").update({"cv_embedding": user_embedding}).eq("id", user_id).execute()
                    except Exception as e:
                        print(f"[feed] Error saving lazy CV embedding: {e}")
>>>>>>> b5ddbbc (feat(backend): matching engine improvements and guest user merge support)
        except Exception:
            user_embedding = None

        # 6. Score
        scored_jobs = []
        for job in candidate_jobs:
            scores = score_job_for_user(job, user, is_generic_feed=is_generic_feed)
            job.update(scores)
            job["match_score"] = scores["fit_score"]
            scored_jobs.append(job)

        # 7. Filter and sort
        if is_generic_feed:
            strict_jobs = scored_jobs
        else:
            strict_jobs = [j for j in scored_jobs if float(j.get("fit_score") or 0) >= MIN_FEED_SCORE]
            
        stats["scored"] = len(scored_jobs)
        stats["after_min_score"] = len(strict_jobs)
        
        for j in strict_jobs:
            j["final_sort_score"] = j["rank_score"]
        
        strict_jobs.sort(
            key=lambda x: (float(x.get("final_sort_score") or 0), x.get("posted_at") or ""),
            reverse=True,
        )

        # Apply Multilingual Top-K Reranking (Phase 9)
        from services.reranker import rerank_pairs, RERANK_TOP_K
        
        if not is_generic_feed and len(strict_jobs) > 0:
            user_text_for_rerank = build_user_profile_text_from_user(user)
            if user_text_for_rerank:
                user_snippet = user_text_for_rerank[:1000]  # truncate to stay < 512 tokens
                top_finalists = strict_jobs[:RERANK_TOP_K]
                pairs = []
                for j in top_finalists:
                    job_desc = (j.get("description_text") or "")[:800]
                    job_title = j.get("title") or ""
                    pairs.append((user_snippet, f"{job_title}. {job_desc}"))
                
                # 4s timeout; L6 model does 15 pairs in ~1-2s on CPU
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
                else:
                    stats["reranked"] = 0
                    stats["reranker_latency_ms"] = "timeout"
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_jobs = strict_jobs[start_idx:end_idx]

<<<<<<< HEAD
        has_cv = bool(user.get("cv_storage_path"))
=======
        has_cv = bool(user.get("cv_embedding"))
        
        print(f"[feed] user_id={user_id} profile_quality={profile_quality} mode={'generic' if is_generic_feed else 'personalized'} stats={stats}")
        
>>>>>>> b5ddbbc (feat(backend): matching engine improvements and guest user merge support)
        return {
            "page": page,
            "limit": limit,
            "total_available": len(strict_jobs),
            "total_returned": len(paginated_jobs),
            "geography_mode": user_geography or "both",
            "min_feed_score": MIN_FEED_SCORE,
            "has_cv": has_cv,
            "jobs": paginated_jobs,
        }
    except Exception as e:
        print(f"[feed] INTERNAL ERROR: {e}")
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
<<<<<<< HEAD
        base_score = calculate_match_score(job, user)
        job["match_score"] = round(min(100.0, base_score + _exact_bonus(job)), 1)
        breakdown = get_skill_breakdown(user_skills, job.get("required_skills", []))
        job["matched_skills"] = breakdown["matched"]
        job["missing_skills"] = breakdown["missing"]
        scored.append(job)

    scored.sort(key=lambda x: float(x.get("match_score") or 0), reverse=True)
=======
        scores = score_job_for_user(job, user, query_tokens=query_tokens, exact_priority=exact_priority)
        job.update(scores)
        job["match_score"] = scores["fit_score"]
        job["final_sort_score"] = float(scores["rank_score"]) + float(scores["search_boost"])
        scored.append(job)

    scored.sort(key=lambda x: (float(x.get("final_sort_score") or 0), x.get("posted_at") or ""), reverse=True)
>>>>>>> b5ddbbc (feat(backend): matching engine improvements and guest user merge support)
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
