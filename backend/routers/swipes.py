from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
from dependencies import supabase, get_current_user

router = APIRouter(prefix="/swipes", tags=["Swipes"])

class SwipeAction(BaseModel):
    job_id: str
    direction: str

FREE_SWIPE_LIMIT = 10

@router.post("")
async def register_swipe(action: SwipeAction, user: dict = Depends(get_current_user)):
    """Registers a left or right swipe, enforcing the daily free swipe limit."""
    user_id = user["id"]
    
    # 1. Check daily limit cycle
    today_date = datetime.now(timezone.utc).date()
    reset_date = None
    
    # Handle potentially missing or differently formatted timestamp strings in MVP DB rows
    if user.get("swipes_reset_at"):
        try:
            reset_date = datetime.fromisoformat(user["swipes_reset_at"].replace("Z", "+00:00")).date()
        except Exception:
            pass
            
    updates = {}
    swipes_today = user.get("swipes_today", 0)
    
    if not reset_date or reset_date < today_date:
        # It's a new day, reset their counters
        swipes_today = 0
        updates["swipes_today"] = 0
        updates["swipes_reset_at"] = datetime.now(timezone.utc).isoformat()
        
    # 2. Enforce limits for free users
    if user.get("subscription", "free") == "free" and swipes_today >= FREE_SWIPE_LIMIT:
        raise HTTPException(
            status_code=403, 
            detail=f"You have reached your daily limit of {FREE_SWIPE_LIMIT} free swipes. Upgrade to premium for unlimited swipes!"
        )
        
    # 3. Register the swipe
    swipe_data = {
        "user_id": user_id,
        "job_id": action.job_id,
        "direction": action.direction
    }
    
    try:
        supabase.table("swipes").insert(swipe_data).execute()
        
        # Increment their swipe counter
        updates["swipes_today"] = swipes_today + 1
        supabase.table("users").update(updates).eq("id", user_id).execute()
        
        return {
            "success": True, 
            "message": "Swipe registered", 
            "swipes_remaining": FREE_SWIPE_LIMIT - (swipes_today + 1)
        }
    except Exception as e:
        # Usually means unique constraint violation (they already swiped it)
        raise HTTPException(status_code=400, detail="Failed to register swipe or already swiped")

@router.get("/saved")
async def get_saved_jobs(user: dict = Depends(get_current_user)):
    """Returns all jobs the user swiped right on, including full job objects."""
    user_id = user["id"]
    
    try:
        # Join query fetching the swipe metadata AND the full job details.
        # Order by newest saves first
        res = supabase.table("swipes").select("*, jobs(*)").eq("user_id", user_id).eq("direction", "right").order("created_at", desc=True).execute()
        
        # Flatten the object for the frontend client so they just get a clean "jobs" array 
        # with the "saved_at" datetime attached to it
        saved_jobs = []
        for row in res.data:
            job = row["jobs"]
            if job:
                job["saved_at"] = row["created_at"]
                saved_jobs.append(job)
                
        return {"data": saved_jobs}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch saved jobs: {e}")
