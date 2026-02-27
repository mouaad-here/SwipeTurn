from fastapi import APIRouter, Depends, Query, HTTPException
from typing import List, Optional

from dependencies import supabase, get_current_user
from services.matching import calculate_match_score, get_skill_breakdown

router = APIRouter(prefix="/jobs", tags=["Jobs"])

@router.get("/feed")
async def get_job_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    user: dict = Depends(get_current_user)
):
    """
    Returns jobs scored and sorted by CV match, excluding jobs already swiped.
    Applies visa logic if the user targets international/remote locations.
    """
    user_id = user["id"]
    user_skills = user.get("extracted_skills", [])
    prefs = user.get("preferences", {})
    
    # 1. Get already swiped jobs so they don't reappear
    swipes_res = supabase.table("swipes").select("job_id").eq("user_id", user_id).execute()
    swiped_ids = [s["job_id"] for s in swipes_res.data]
    
    # 2. Fetch active valid jobs
    query = supabase.table("jobs").select("*").eq("is_active", True)
    
    # Simple pagination query
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit - 1
    query = query.range(start_idx, end_idx)
    
    jobs_res = query.execute()
    raw_jobs = jobs_res.data
    
    # 3. Filter out swiped jobs directly from the result set 
    # (Since Supabase postgrest doesn't easily do `NOT IN` with large arrays, we filter in memory for MVP)
    unswiped_jobs = [j for j in raw_jobs if j["id"] not in swiped_ids]
    
    # 4. Visa logic: Should we show badges?
    INTL_PREF_TYPES = ["Full-time Remote Job", "Remote Internship", "Part-time", "Freelance", "Contract"]
    user_wants_intl = any(t in INTL_PREF_TYPES for t in prefs.get("types", []))
    
    # 5. Score and map the jobs
    scored_jobs = []
    for job in unswiped_jobs:
        job_skills = job.get("required_skills", [])
        
        # Calculate dynamic match
        score = calculate_match_score(user_skills, job_skills)
        breakdown = get_skill_breakdown(user_skills, job_skills)
        
        job["match_score"] = score
        job["matched_skills"] = breakdown["matched"]
        job["missing_skills"] = breakdown["missing"]
        
        # Inject visa badge if necessary
        if user_wants_intl:
            if job.get("visa_sponsorship"):
                job["visa_badge"] = "sponsored"
            elif job.get("open_to_intl"):
                job["visa_badge"] = "open_to_intl"
            elif job.get("location") not in ["Remote", "Morocco"]:
                job["visa_badge"] = "visa_required"
            else:
                job["visa_badge"] = None
                
        scored_jobs.append(job)
        
    # 6. Sort by match score descending
    scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)
    
    return {
        "page": page,
        "limit": limit,
        "total_returned": len(scored_jobs),
        "jobs": scored_jobs
    }

@router.get("/{job_id}")
async def get_single_job(job_id: str, user: dict = Depends(get_current_user)):
    """Fetches a single job detail view and calculates dynamic match for the current user."""
    res = supabase.table("jobs").select("*").eq("id", job_id).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = res.data[0]
    
    # Dynamically score it 
    user_skills = user.get("extracted_skills", [])
    job_skills = job.get("required_skills", [])
    
    job["match_score"] = calculate_match_score(user_skills, job_skills)
    
    breakdown = get_skill_breakdown(user_skills, job_skills)
    job["matched_skills"] = breakdown["matched"]
    job["missing_skills"] = breakdown["missing"]
    
    return job
