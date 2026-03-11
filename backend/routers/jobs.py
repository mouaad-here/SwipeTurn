from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List, Optional

from dependencies import get_supabase, get_current_user
from services.matching import calculate_match_score, calculate_hybrid_score, get_skill_breakdown, cosine_similarity
from services.embeddings import build_user_profile_text_from_user, get_embedding_model
from constants import (
    get_seniority_filter,
    build_eligibility_filter,
    MIN_FEED_SCORE,
    DOMAIN_KEYWORDS,
)

router = APIRouter(prefix="/jobs", tags=["Jobs"])


def _safe_posted_at_ts(job: dict) -> float:
    raw = job.get("posted_at")
    if not raw:
        return 0.0
    try:
        s = str(raw).replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0.0


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
    user_id = user["id"]
    prefs = user.get("preferences") or {}
    user_skills = user.get("extracted_skills") or []
    if not user_skills and prefs:
        user_skills = list(prefs.get("keywords") or []) + list(prefs.get("domains") or [])

    # 1. Exclude swiped jobs
    swipes_res = get_supabase().table("swipes").select("job_id").eq("user_id", user_id).execute()
    swiped_ids = set(s["job_id"] for s in swipes_res.data)

    # 2. Build query with filters
    query = (
        get_supabase()
        .table("jobs")
        .select("*")
        .eq("is_active", True)
        .not_.is_("apply_url", "null")
    )

    # Geography + eligibility filter
    user_geography = (prefs.get("geography") or "").lower()
    eligibility = build_eligibility_filter(user)

    if "or" in eligibility:
        # "both" geography: Morocco OR global accessible
        query = query.or_(
            f"job_region.eq.MA,"
            f"and(globally_accessible.eq.true,open_to_intl.eq.true)"
        )
    elif "job_region" in eligibility:
        query = query.eq("job_region", eligibility["job_region"])
    else:
        # Global: only show jobs user can apply for (no visa/local-only)
        if eligibility.get("globally_accessible"):
            query = query.eq("globally_accessible", True)
        if eligibility.get("open_to_intl"):
            query = query.eq("open_to_intl", True)
        if eligibility.get("remote_type"):
            query = query.eq("remote_type", eligibility["remote_type"])

    # Seniority: strict hard filter
    user_seniority = (user.get("experience_level") or prefs.get("seniority") or "mid").lower().strip()
    allowed_levels = get_seniority_filter(user_seniority)
    levels_csv = ",".join(allowed_levels)
    query = query.or_(f"experience_level.in.({levels_csv}),experience_level.is.null")

    # Job type filter
    user_job_types = prefs.get("job_type") or []
    if user_job_types:
        types_csv = ",".join(t.lower() for t in user_job_types)
        query = query.or_(f"job_type.in.({types_csv}),job_type.is.null")

    FEED_FETCH_LIMIT = 1000
    query = query.limit(FEED_FETCH_LIMIT).order("posted_at", desc=True)
    jobs_res = query.execute()
    raw_jobs = jobs_res.data or []

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

    # 4. Domain filter when user selects specific domains
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

    # 5. Resolve user embedding for semantic matching
    user_embedding = None
    try:
        if user.get("cv_embedding"):
            user_embedding = user["cv_embedding"]
        else:
            profile_text = build_user_profile_text_from_user(user)
            if profile_text:
                model = get_embedding_model()
                user_embedding = model.encode(profile_text).tolist()
    except Exception:
        # Fall back to keyword-only matching if embedding fails for any reason
        user_embedding = None

    # 6. Score with keyword + semantic components
    scored_jobs = []
    for job in candidate_jobs:
        keyword_score = calculate_match_score(job, user)
        breakdown = get_skill_breakdown(user_skills, job.get("required_skills", []))

        # Semantic similarity: only when both embeddings are present
        if user_embedding is not None and job.get("description_embedding") is not None:
            semantic_sim = cosine_similarity(user_embedding, job.get("description_embedding"))
        else:
            # Neutral: treat as 0 similarity, which maps to 50/100 after scaling
            semantic_sim = 0.0

        final_score = calculate_hybrid_score(keyword_score, semantic_sim)
        job["match_score"] = final_score
        job["matched_skills"] = breakdown["matched"]
        job["missing_skills"] = breakdown["missing"]
        scored_jobs.append(job)

    # 7. Filter by minimum score, then sort by score + recency
    strict_jobs = [j for j in scored_jobs if float(j.get("match_score") or 0) >= MIN_FEED_SCORE]
    strict_jobs.sort(
        key=lambda x: (float(x.get("match_score") or 0.0), _safe_posted_at_ts(x)),
        reverse=True,
    )

    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_jobs = strict_jobs[start_idx:end_idx]

    has_cv = bool(user.get("cv_storage_path"))
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
    query_db = (
        get_supabase()
        .table("jobs")
        .select("*")
        .eq("is_active", True)
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

    EXACT_BONUS = 18.0

    def _exact_bonus(job: dict) -> float:
        if not exact_priority:
            return 0.0
        title = (job.get("title") or "").lower()
        skills = [s.lower() for s in (job.get("required_skills") or [])]
        desc = (job.get("description_text") or "")[:1000].lower()
        bonus = 0.0
        for token in query_tokens:
            if token in title or any(token in s for s in skills):
                bonus += EXACT_BONUS
            elif token in desc:
                bonus += EXACT_BONUS * 0.4
        return min(bonus, EXACT_BONUS * len(query_tokens))

    scored = []
    for job in candidates:
        base_score = calculate_match_score(job, user)
        job["match_score"] = round(min(100.0, base_score + _exact_bonus(job)), 1)
        breakdown = get_skill_breakdown(user_skills, job.get("required_skills", []))
        job["matched_skills"] = breakdown["matched"]
        job["missing_skills"] = breakdown["missing"]
        scored.append(job)

    scored.sort(key=lambda x: float(x.get("match_score") or 0), reverse=True)
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

    job["match_score"] = calculate_match_score(job, user)
    breakdown = get_skill_breakdown(user_skills, job.get("required_skills", []))
    job["matched_skills"] = breakdown["matched"]
    job["missing_skills"] = breakdown["missing"]

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
