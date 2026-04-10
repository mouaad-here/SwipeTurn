from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json

from dependencies import get_supabase, get_current_user
from services.cv_parser import extract_text_from_pdf, extract_text_from_docx, parse_cv
from services.embeddings import generate_cv_embedding

router = APIRouter(prefix="/users", tags=["Users"])

class PreferencesUpdate(BaseModel):
    preferences: Optional[Dict[str, Any]] = None
    target_locations: Optional[List[str]] = None
    parsed_experience_level: Optional[str] = None
    fields: Optional[List[str]] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    name: Optional[str] = None


class OnboardingComplete(BaseModel):
    geography: str
    relocation_preference: Optional[str] = None
    seniority: str
    job_type: List[str]
    domains: List[str] = []
    subcategories: List[str] = []
    keywords: List[str] = []
    name: Optional[str] = None
    device_id: Optional[str] = None


class MergeGuestRequest(BaseModel):
    guest_id: str
    auth_type: str

# Fields safe to return to the mobile client from /users/me.
# cv_embedding is EXCLUDED — it is retained internally for feed matching only.
_PUBLIC_USER_FIELDS = {
    "id", "clerk_user_id", "email", "name",
    "parsed_experience_level", "preferences",
    "extracted_skills", "target_locations", "fields",
    "desired_job_type", "relocation_preference",
    "linkedin_url", "portfolio_url",
    "onboarding_completed_at", "languages",
    "is_guest", "created_at", "device_id",
    "subscription", "subscription_expires_at",
}


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Returns the public-safe user profile with a computed completion score.

    Internal fields (cv_embedding, cv_text, cv_storage_path, metadata) are
    intentionally stripped before the response leaves the server.
    """
    try:
        # Strip internal-only fields — never expose embedding vectors or raw CV data
        public_user = {k: v for k, v in user.items() if k in _PUBLIC_USER_FIELDS}

        # Compute dynamic profile score (CV upload replaced by cv_embedding presence)
        score = 0
        has_cv = bool(user.get("cv_embedding"))  # embedding = processed CV, not raw file
        if has_cv:
            score += 40

        extracted_skills = public_user.get("extracted_skills") or []
        if len(extracted_skills) >= 3:
            score += 25

        if public_user.get("linkedin_url"):
            score += 10

        if (public_user.get("preferences") or {}).get("geography"):
            score += 10

        if len(public_user.get("target_locations") or []) > 0:
            score += 5

        if len(public_user.get("languages") or []) > 0:
            score += 5

        if not has_cv:
            score = min(50, score)

        public_user["profile_score"] = min(100, score)
        public_user["has_cv"] = has_cv

        return public_user
    except Exception as e:
        print(f"[get_me] INTERNAL ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Internal User Error: {str(e)}")

@router.patch("/preferences")
async def update_preferences(prefs: PreferencesUpdate, user: dict = Depends(get_current_user)):
    """Updates user profile and dynamic preference objects."""
    update_data = {k: v for k, v in prefs.model_dump().items() if v is not None}

    if not update_data:
        return {"success": True, "message": "No fields to update"}

    update_payload = {}
    if "target_locations" in update_data:
        update_payload["target_locations"] = update_data["target_locations"]
    if "parsed_experience_level" in update_data:
        update_payload["parsed_experience_level"] = update_data["parsed_experience_level"]
    if "preferences" in update_data:
        update_payload["preferences"] = update_data["preferences"]
    for k in ("linkedin_url", "portfolio_url", "name"):
        if k in update_data:
            update_payload[k] = update_data[k]

    if not update_payload:
        return {"success": True, "message": "No fields to update"}

    try:
        response = get_supabase().table("users").update(update_payload).eq("id", user["id"]).execute()
        return {"success": True, "data": response.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/onboarding/complete")
async def complete_onboarding(data: OnboardingComplete, user: dict = Depends(get_current_user)):
    """Single-commit onboarding. All steps saved at once -- no partial DB states."""
    update_payload = {
        "preferences": data.model_dump(),
        "parsed_experience_level": data.seniority,
        "target_locations": [data.geography],
        "fields": data.domains + data.subcategories,
        "desired_job_type": data.job_type,
        "relocation_preference": data.relocation_preference,
        "onboarding_completed_at": datetime.utcnow().isoformat(),
    }
    if data.name:
        update_payload["name"] = data.name
    if data.device_id:
        update_payload["device_id"] = data.device_id

    try:
        get_supabase().table("users").update(update_payload).eq("id", user["id"]).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-cv")
async def upload_cv(
    file: UploadFile = File(...),
    preferences: Optional[str] = Form(None),
    user: dict = Depends(get_current_user)
):
    """Parses a PDF/DOCX CV in-memory, extracts structured data via LLM, and generates
    a semantic embedding for job matching. Raw CV bytes and extracted text are NEVER
    persisted — only the derived structured fields and embedding vector are stored.
    Returns { success: true, data: {...} } on success."""
    print(f"Upload CV received: filename={file.filename}, user_id={user.get('id')}")
    try:
        if not file.filename or not file.filename.lower().endswith(('.pdf', '.docx')):
            raise HTTPException(status_code=400, detail="Only PDF or DOCX files are supported")

        file_bytes = await file.read()
        if len(file_bytes) > 2.5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 2.5MB)")

        # Extract text in-memory — text never leaves this request scope
        if file.filename.lower().endswith('.pdf'):
            cv_text = await extract_text_from_pdf(file_bytes)
        else:
            cv_text = await extract_text_from_docx(file_bytes)

        file_bytes = b""  # release raw bytes as early as possible

        if not cv_text or not cv_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the document. Try a different file.")

        # LLM parse (in-memory only — cv_text is the input, never the output written to DB)
        parsed_data = await parse_cv(cv_text)

        # Decode incoming preferences from React Native
        prefs_dict = {}
        if preferences:
            try:
                prefs_dict = json.loads(preferences)
            except Exception:
                pass

        # seniority: prefer user's explicit onboarding choice; fall back to CV-parsed
        experience_level_chosen = prefs_dict.get("seniority") or parsed_data.get("experience_level", "mid")
        prefs_dict["education"] = parsed_data.get("education", [])
        prefs_dict["projects"] = parsed_data.get("projects", [])
        prefs_dict["languages"] = parsed_data.get("languages", [])

        # Generate 384-dim semantic embedding from structured fields (not raw cv_text)
        cv_vector = None
        try:
            cv_vector = generate_cv_embedding(parsed_data, cv_text)
        except Exception as e:
            print(f"Failed to generate CV embedding: {e}")

        cv_text = ""  # release extracted text — no longer needed

        # Write ONLY derived/structured fields. Raw text and file path are intentionally
        # excluded. The embedding vector encodes CV signal without persisting raw PII.
        update_data = {
            "extracted_skills": parsed_data.get("skills", [])[:30],
            "cv_embedding": cv_vector,
            "parsed_experience_level": experience_level_chosen,
            "target_locations": [prefs_dict.get("geography")] if prefs_dict.get("geography") else [],
            "fields": prefs_dict.get("domains") or parsed_data.get("fields", []),
            "preferences": prefs_dict,
        }

        get_supabase().table("users").update(update_data).eq("id", user["id"]).execute()

        return {
            "success": True,
            "data": {
                "skills": update_data["extracted_skills"],
                "parsed_experience_level": update_data["parsed_experience_level"],
                "message": "CV processed and profile updated."
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        print(f"Upload CV error: {e}")
        if "Abort" in err_msg or "aborted" in err_msg.lower():
            err_msg = "Request was cancelled or timed out. Please try again."
        raise HTTPException(status_code=500, detail=err_msg)

@router.post("/merge-guest")
async def merge_guest(data: MergeGuestRequest, current_user: dict = Depends(get_current_user)):
    """Merges a guest account into the currently authenticated user explicitly handling auth_type."""
    if data.auth_type not in ("signup", "login"):
        raise HTTPException(status_code=400, detail="Invalid auth_type")
        
    db = get_supabase()
    guest_clerk_id = f"guest_{data.guest_id}"
    guest_resp = db.table("users").select("*").eq("clerk_id", guest_clerk_id).execute()
    
    if not guest_resp.data:
        return {"success": True, "message": "No guest record found", "merged": False}
        
    guest_user = guest_resp.data[0]
    guest_db_id = guest_user["id"]
    user_db_id = current_user["id"]
    
    try:
        db.table("swipes").update({"user_id": user_db_id}).eq("user_id", guest_db_id).execute()
    except Exception as e:
        print(f"Failed to merge swipes: {e}")
        return {"success": False, "message": f"Failed to transfer swipes: {e}"}
        
    update_payload = {}
    fields_to_copy = ["preferences", "parsed_experience_level", "target_locations", "fields", "desired_job_type", "onboarding_completed_at"]
    
    # Precise empty account detection
    has_onboarding = current_user.get("onboarding_completed_at") is not None
    has_prefs = bool(current_user.get("preferences"))
    is_empty_account = not has_onboarding and not has_prefs
    
    if data.auth_type == "signup" or (data.auth_type == "login" and is_empty_account):
        for field in fields_to_copy:
            if guest_user.get(field) is not None:
                update_payload[field] = guest_user[field]
                
    if update_payload:
        try:
            db.table("users").update(update_payload).eq("id", user_db_id).execute()
        except Exception as e:
            print(f"Failed to update user payload: {e}")
            return {"success": False, "message": f"Failed to transfer preferences: {e}"}
        
    try:
        db.table("users").delete().eq("id", guest_db_id).execute()
    except Exception as e:
        print(f"Failed to delete guest: {e}")
        
    return {"success": True, "merged": True}


@router.delete("/me")
async def delete_account(user: dict = Depends(get_current_user)):
    """Hard-deletes the authenticated user account (Apple-compliant, in-app initiated).

    Idempotent: calling this endpoint on an already-deleted account returns 200 success
    rather than 404, so retry-safe client flows don't surface false errors.

    Cascade behaviour (set up in Component 4 SQL):
      - swipes rows are deleted via ON DELETE CASCADE on swipes.user_id
      - applications rows are deleted via ON DELETE CASCADE on applications.user_id

    Clerk identity is revoked last so the account cannot be re-authenticated mid-deletion.
    """
    import httpx as _httpx
    import config as _config

    db = get_supabase()
    user_db_id = user["id"]
    clerk_id = user.get("clerk_user_id")

    # 1. Delete the user row — CASCADE handles swipes + applications automatically.
    #    If the row is already gone (retry / race), treat as success (idempotent).
    try:
        result = db.table("users").delete().eq("id", user_db_id).execute()
        if not result.data:
            # Row was already deleted — still a success for the caller
            print(f"[delete_account] Row already absent for user_db_id={user_db_id} — idempotent OK")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {e}")

    # 2. Revoke Clerk identity (non-blocking — failure does NOT roll back the DB delete).
    #    Without this step the Clerk token remains valid, but the Supabase row is gone
    #    so any subsequent API call will get a 401/404 on user lookup.
    clerk_secret = getattr(_config, "CLERK_SECRET_KEY", None)
    if clerk_id and clerk_secret:
        try:
            async with _httpx.AsyncClient() as client:
                resp = await client.delete(
                    f"https://api.clerk.com/v1/users/{clerk_id}",
                    headers={"Authorization": f"Bearer {clerk_secret}"},
                    timeout=8.0,
                )
                if resp.status_code not in (200, 404):
                    print(f"[delete_account] Clerk revocation returned {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[delete_account] Clerk revocation failed (non-blocking): {e}")
    else:
        print(f"[delete_account] Skipping Clerk revocation: CLERK_SECRET_KEY not configured.")

    return {"success": True, "message": "Account deleted."}
