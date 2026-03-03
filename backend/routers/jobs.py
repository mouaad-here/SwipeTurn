from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List, Optional

from dependencies import get_supabase, get_current_user
from services.matching import calculate_match_score, get_skill_breakdown, cosine_similarity
from services.embeddings import build_user_profile_text_from_user
from services.reranker import rerank_pairs

router = APIRouter(prefix="/jobs", tags=["Jobs"])

@router.get("/feed")
async def get_job_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user: dict = Depends(get_current_user)
):
    """
    Returns jobs scored and sorted by CV match, excluding jobs already swiped.
    Uses DB-side filtering (job_region, experience_level) so we only fetch what the user wants.
    """
    user_id = user["id"]
    user_skills = user.get("extracted_skills", []) or []
    prefs = user.get("preferences", {}) or {}
    RESIDENCY_RESTRICTED_PHRASES = [
        "must be authorized to work in", "must be eligible to work in",
        "legally authorized to work in", "right to work in",
        "work permit required in",
        "must reside in", "must be located in", "must be based in",
        "residents of", "only open to residents", "applicants must be in",
        "us only", "usa only", "uk only", "canada only",
        "eu only", "australia only",
        "we can only hire in", "we are only able to hire in",
        "we currently hire in", "cannot hire outside of",
    ]
    MOROCCO_POSITIVE_PHRASES = [
        "morocco", "maroc", "moroccan",
        "mena", "maghreb", "north africa", "afrique du nord",
        "worldwide", "anywhere in the world", "globally",
        "all countries", "any country", "any location",
        "no location restrictions",
    ]
    if not user_skills and prefs:
        user_skills = list(prefs.get("keywords") or []) + list(prefs.get("domains") or [])

    # 1. Swiped job ids (to exclude from feed)
    swipes_res = get_supabase().table("swipes").select("job_id").eq("user_id", user_id).execute()
    swiped_ids = [s["job_id"] for s in swipes_res.data]

    # 2. Build query with filters so DB returns only relevant jobs (better search, less data)
    query = (
        get_supabase()
        .table("jobs")
        .select("*")
        .eq("is_active", True)
        .not_.is_("apply_url", "null")
    )
    # Geography: filter by job_region when user chose Morocco or Global (requires job_region column + migration)
    user_geography = (prefs.get("geography") or "").lower()
    if user_geography == "morocco":
        query = query.eq("job_region", "morocco")
    elif user_geography == "global":
        query = query.eq("job_region", "global")
    # else "both" or empty: no job_region filter

    # Experience level: two matrices by geography (see plan: geography-specific_feed_filters_and_audit)
    user_seniority = (user.get("experience_level") or prefs.get("seniority") or "mid").lower().strip()
    # Global: stretch-down (junior sees student+junior, mid sees junior+mid)
    ALLOWED_EXPERIENCE_GLOBAL = {
        "student": ["student"],
        "junior": ["student", "junior"],
        "mid": ["junior", "mid"],
        "senior": ["mid", "senior", "senior_lead"],
    }
    # Morocco: Stage/PFE distinct; junior rare → junior sees student+mid; mid strict
    ALLOWED_EXPERIENCE_MOROCCO = {
        "student": ["student"],
        "junior": ["student", "mid"],
        "mid": ["mid"],
        "senior": ["mid", "senior", "senior_lead"],
    }
    if user_geography == "morocco":
        allowed_levels = ALLOWED_EXPERIENCE_MOROCCO.get(user_seniority)
    else:
        # "global", "both", or empty → use Global matrix
        allowed_levels = ALLOWED_EXPERIENCE_GLOBAL.get(user_seniority)
    if allowed_levels:
        levels_csv = ",".join(allowed_levels)
        query = query.or_(f"experience_level.in.({levels_csv}),experience_level.is.null")

    # Cap fetch size so we don't pull entire table; then filter apply_url and swiped in memory
    FEED_FETCH_LIMIT = 1000
    query = query.limit(FEED_FETCH_LIMIT).order("posted_at", desc=True)
    try:
        jobs_res = query.execute()
    except Exception as err:
        # If job_region column missing (migration not run), fetch without it and filter geography in memory
        if "job_region" in str(err) or "column" in str(err).lower():
            fallback = get_supabase().table("jobs").select("*").eq("is_active", True).not_.is_("apply_url", "null").limit(FEED_FETCH_LIMIT).order("posted_at", desc=True)
            if allowed_levels:
                levels_csv = ",".join(allowed_levels)
                fallback = fallback.or_(f"experience_level.in.({levels_csv}),experience_level.is.null")
            jobs_res = fallback.execute()
            raw_jobs = jobs_res.data or []
            def _is_morocco(j):
                loc, src = (j.get("location") or "").lower(), (j.get("source") or "").lower()
                return "morocco" in loc or "maroc" in loc or src in ("rekrute", "stagiaires")
            if user_geography == "morocco":
                raw_jobs = [j for j in raw_jobs if _is_morocco(j)]
            elif user_geography == "global":
                raw_jobs = [j for j in raw_jobs if not _is_morocco(j)]
            # Apply Morocco-applicable filter for fallback too (USA-only exclusion applied below)
            def _morocco_applicable_fb(j):
                if _is_morocco(j):
                    return True
                if j.get("visa_sponsorship") or j.get("open_to_intl"):
                    return True
                if j.get("is_remote"):
                    text = " ".join([
                        (j.get("location") or "").lower(),
                        (j.get("description_text") or "")[:2000].lower(),
                    ])
                    if any(pp in text for pp in MOROCCO_POSITIVE_PHRASES):
                        return True
                    if any(rp in text for rp in RESIDENCY_RESTRICTED_PHRASES):
                        return False
                    return True
                return False
            if user_geography in ("global", "both"):
                raw_jobs = [j for j in raw_jobs if _morocco_applicable_fb(j)]
        else:
            raise
    else:
        raw_jobs = jobs_res.data or []

    # 2b. Morocco-applicable filter: for global/both, only include global jobs where Moroccans can apply
    # (is_remote, visa_sponsorship, or open_to_intl). Morocco jobs always valid.
    # Exclude residency-restricted remote jobs (US/UK/EU-only, must reside in X, etc.)
    def _is_residency_restricted(job: dict) -> bool:
        """True if job explicitly restricts to specific countries (excludes Morocco)."""
        text = " ".join([
            (job.get("location") or "").lower(),
            (job.get("description_text") or "")[:2000].lower(),
        ])
        if any(pp in text for pp in MOROCCO_POSITIVE_PHRASES):
            return False  # Morocco/worldwide mentioned → not restricted for our users
        return any(rp in text for rp in RESIDENCY_RESTRICTED_PHRASES)

    def _morocco_applicable(j):
        if (j.get("job_region") or "").lower() == "morocco":
            return True
        if j.get("visa_sponsorship") or j.get("open_to_intl"):
            return True
        if j.get("is_remote"):
            if _is_residency_restricted(j):
                return False  # residency-restricted remote, exclude
            return True
        return False

    if user_geography in ("global", "both"):
        raw_jobs = [j for j in raw_jobs if _morocco_applicable(j)]

    # 3. Exclude swiped and jobs without valid apply_url
    candidate_jobs = [
        j for j in raw_jobs
        if j["id"] not in swiped_ids
        and (j.get("apply_url") or "").strip().startswith(("http://", "https://"))
    ]

    # 4. Score, retrieve topK by vector similarity, rerank top50, then final recency-first ordering.
    scored_jobs = []
    user_embedding = user.get("cv_embedding")
    SENIORITY_INCOMPATIBLE = {
        "student": {"mid", "senior", "senior_lead"},
        "junior": {"senior", "senior_lead"},
    }
    STAGE1_TOP_K = 200
    STAGE2_TOP_K = 50

    def job_seniority_incompatible(job_exp: str) -> bool:
        if not user_seniority or user_seniority not in SENIORITY_INCOMPATIBLE:
            return False
        j = (job_exp or "mid").lower().strip()
        return j in SENIORITY_INCOMPATIBLE.get(user_seniority, set())

    INTL_PREF_TYPES = ["Full-time Remote Job", "Remote Internship", "Part-time", "Freelance", "Contract"]
    user_wants_intl = any(t in INTL_PREF_TYPES for t in prefs.get("types", []))

    def _safe_posted_at_ts(job: dict) -> float:
        raw = job.get("posted_at")
        if not raw:
            return 0.0
        try:
            s = str(raw).replace("Z", "+00:00")
            return datetime.fromisoformat(s).timestamp()
        except Exception:
            return 0.0

    def _build_job_profile_text(job: dict) -> str:
        return (
            f"Role: {job.get('title') or ''}. "
            f"Required skills: {', '.join(job.get('required_skills') or [])}. "
            f"Experience: {job.get('experience_level') or 'unspecified'}. "
            f"Description: {(job.get('description_text') or '')[:1600]}"
        ).strip()

    for job in candidate_jobs:
        job_skills = job.get("required_skills", [])
        job_seniority = job.get("experience_level", "mid")
        if job_seniority_incompatible(job_seniority):
            continue
        job_embedding = job.get("description_embedding")
        base_score = calculate_match_score(
            user_skills,
            job_skills,
            user_seniority=user_seniority,
            job_seniority=job_seniority,
            user_embedding=user_embedding,
            job_embedding=job_embedding,
            user_preferences=prefs,
            job_location=job.get("location", ""),
            job_city=job.get("city"),
        )
        breakdown = get_skill_breakdown(user_skills, job_skills)
        stage1_score = cosine_similarity(user_embedding, job_embedding) * 100 if user_embedding and job_embedding else 0.0
        job["base_match_score"] = base_score
        job["stage1_score"] = stage1_score
        job["match_score"] = base_score
        job["matched_skills"] = breakdown["matched"]
        job["missing_skills"] = breakdown["missing"]
        if user_wants_intl:
            if job.get("visa_sponsorship"):
                job["visa_badge"] = "sponsored"
            elif job.get("open_to_intl"):
                job["visa_badge"] = "open_to_intl"
            elif job.get("location") not in ["Remote", "Morocco"] and "morocco" not in (job.get("location") or "").lower():
                job["visa_badge"] = "visa_required"
            else:
                job["visa_badge"] = None
        scored_jobs.append(job)

    # Stage 1 retrieval over DB-scoped candidates.
    if user_embedding:
        scored_jobs.sort(key=lambda x: x.get("stage1_score", 0.0), reverse=True)
    else:
        scored_jobs.sort(key=lambda x: _safe_posted_at_ts(x), reverse=True)
    stage1_candidates = scored_jobs[:STAGE1_TOP_K]

    # Stage 2 rerank only top 50 (graceful fallback on timeout/failure).
    rerank_candidates = stage1_candidates[:STAGE2_TOP_K]
    if user_embedding:
        user_profile_text = build_user_profile_text_from_user(user)
        rerank_pairs_input = [(user_profile_text, _build_job_profile_text(job)) for job in rerank_candidates]
        rerank_scores = rerank_pairs(rerank_pairs_input, timeout_seconds=1.0)
        if rerank_scores is not None and len(rerank_scores) == len(rerank_candidates):
            # Convert typical cross-encoder range to a 0-100-ish scale with clamping.
            for job, raw_score in zip(rerank_candidates, rerank_scores):
                normalized = max(0.0, min(100.0, (raw_score + 2.0) * 25.0))
                job["match_score"] = round(normalized, 1)

    # Final contract: newest first, score as tie-break.
    scored_jobs = stage1_candidates
    scored_jobs.sort(
        key=lambda x: (_safe_posted_at_ts(x), float(x.get("match_score") or 0.0)),
        reverse=True,
    )

    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_jobs = scored_jobs[start_idx:end_idx]

    return {
        "page": page,
        "limit": limit,
        "total_available": len(scored_jobs),
        "total_returned": len(paginated_jobs),
        "geography_mode": user_geography or "both",
        "jobs": paginated_jobs,
    }

@router.get("/{job_id}")
async def get_single_job(job_id: str, user: dict = Depends(get_current_user)):
    """Fetches a single job detail view and calculates dynamic match for the current user."""
    res = get_supabase().table("jobs").select("*").eq("id", job_id).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = res.data[0]
    
    # Dynamically score it 
    user_skills = user.get("extracted_skills", [])
    job_skills = job.get("required_skills", [])
    
    job["match_score"] = calculate_match_score(
        user_skills, 
        job_skills, 
        user_embedding=user.get("cv_embedding"),
        job_embedding=job.get("description_embedding")
    )
    
    breakdown = get_skill_breakdown(user_skills, job_skills)
    job["matched_skills"] = breakdown["matched"]
    job["missing_skills"] = breakdown["missing"]
    
    return job
