from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from dependencies import get_supabase, get_current_user
import os

router = APIRouter(prefix="/swipes", tags=["Swipes"])


class SwipeAction(BaseModel):
    job_id: str
    direction: str


class SwipeStatusUpdate(BaseModel):
    status: str

@router.post("")
def register_swipe(action: SwipeAction, user: dict = Depends(get_current_user)):
    """Registers a left or right swipe.

    NOTE (MVP): Daily limits are disabled in this branch so we don't depend
    on extra user columns like swipes_today / swipes_reset_at. This makes
    the endpoint robust even if the DB schema doesn't have those fields yet.
    """
    user_id = user["id"]

    # Register the swipe
    swipe_data = {
        "user_id": user_id,
        "job_id": action.job_id,
        "direction": action.direction,
        "status": "saved" if action.direction == "right" else "passed"
    }
    
    try:
        get_supabase().table("swipes").insert(swipe_data).execute()

        return {
            "success": True, 
            "message": "Swipe registered"
        }
    except Exception as e:
        # Check if it's a unique constraint violation
        error_str = str(e).lower()
        if "unique" in error_str or "already exists" in error_str:
             return {
                "success": True, 
                "message": "Already swiped"
            }
        print(f"[swipes] INTERNAL ERROR: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to register swipe: {str(e)}")

@router.get("/saved")
def get_saved_jobs(user: dict = Depends(get_current_user)):
    """Returns all jobs the user swiped right on, including full job objects."""
    user_id = user["id"]
    
    try:
        swipes_res = (
            get_supabase()
            .table("swipes")
            .select("job_id, created_at, status, applied_at")
            .eq("user_id", user_id)
            .eq("direction", "right")
            .neq("status", "archived")
            .order("created_at", desc=True)
            .execute()
        )
        rows = swipes_res.data or []
        if not rows:
            return {"data": []}

        job_ids = [r["job_id"] for r in rows if r.get("job_id")]
        if not job_ids:
            return {"data": []}

        jobs_res = get_supabase().table("jobs").select(
            "id, title, company, company_logo_url, city, country_code, apply_url, apply_email, posted_at, experience_level, job_region, is_remote, is_active"
        ).in_("id", job_ids).execute()
        jobs_by_id = {j["id"]: j for j in (jobs_res.data or []) if isinstance(j, dict) and j.get("id")}

        saved_jobs = []
        for row in rows:
            jid = row.get("job_id")
            job = jobs_by_id.get(jid) if jid else None
            if job is None:
                continue
            job = dict(job)
            job["saved_at"] = row.get("created_at")
            job["status"] = row.get("status") or "saved"
            job["applied_at"] = row.get("applied_at")
            saved_jobs.append(job)
        
        saved_jobs.sort(key=lambda x: (x.get("saved_at") or ""), reverse=True)
        return {"data": saved_jobs}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch saved jobs: {str(e)}")


@router.patch("/{job_id}")
def update_saved_status(job_id: str, body: SwipeStatusUpdate, user: dict = Depends(get_current_user)):
    """Update the status of a saved job (e.g. mark as applied / saved)."""
    user_id = user["id"]
    status = body.status.strip().lower()
    if status not in {"saved", "applied"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    update_data = {"status": status}
    if status == "applied":
        update_data["applied_at"] = datetime.now(timezone.utc).isoformat()
    else:
        update_data["applied_at"] = None
    try:
        res = (
            get_supabase()
            .table("swipes")
            .update(update_data)
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .eq("direction", "right")
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Saved swipe not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update status: {str(e)}")


@router.delete("/{job_id}")
def remove_saved_job(job_id: str, user: dict = Depends(get_current_user)):
    """Archive a saved job so it no longer appears in the user's list."""
    user_id = user["id"]
    try:
        res = (
            get_supabase()
            .table("swipes")
            .update({"status": "archived"})
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .eq("direction", "right")
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Saved swipe not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove saved job: {str(e)}")
