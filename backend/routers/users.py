import asyncio
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
    experience_level: Optional[str] = None
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

@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Fetches the current user profile, computing the completion score and signed CV URL."""
    
    # Generate 1-hour signed URL if user has uploaded a CV
    cv_url = None
    if user.get("cv_storage_path"):
        try:
            res = get_supabase().storage.from_("cvs").create_signed_url(user["cv_storage_path"], 3600)
            cv_url = res.get("signedURL")
        except Exception:
            pass # Fails gracefully if bucket setup is incomplete
            
    user["cv_url"] = cv_url
    
    # Compute dynamic profile score (CV is major; without CV, max ~50)
    score = 0
    has_cv = bool(user.get("cv_storage_path"))
    if has_cv:
        score += 40
    if len(user.get("extracted_skills", [])) >= 3:
        score += 25
    if user.get("linkedin_url"):
        score += 10
    if user.get("preferences") and (user.get("preferences") or {}).get("geography"):
        score += 10
    if len(user.get("target_locations", [])) > 0:
        score += 5
    if len(user.get("languages", [])) > 0:
        score += 5
    
    # Without CV, cap at 50 so it's clear more completion is needed
    if not has_cv:
        score = min(50, score)
    
    user["profile_score"] = min(100, score)
    
    return user

@router.patch("/preferences")
async def update_preferences(prefs: PreferencesUpdate, user: dict = Depends(get_current_user)):
    """Updates user profile and dynamic preference objects."""
    update_data = {k: v for k, v in prefs.model_dump().items() if v is not None}

    if not update_data:
        return {"success": True, "message": "No fields to update"}

    update_payload = {}
    if "target_locations" in update_data:
        update_payload["target_locations"] = update_data["target_locations"]
    if "experience_level" in update_data:
        update_payload["experience_level"] = update_data["experience_level"]
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
        "experience_level": data.seniority,
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
    """Uploads a PDF/DOCX to Supabase Storage, parses text, extracts skills via LLM, and updates user profile.
    Returns { success: true, data: {...} } on success, or { success: false, error: "message" } on failure (with 500)."""
    print(f"Upload CV received: filename={file.filename}, user_id={user.get('id')}")
    try:
        if not file.filename or not file.filename.lower().endswith(('.pdf', '.docx')):
            raise HTTPException(status_code=400, detail="Only PDF or DOCX files are supported")
            
        file_bytes = await file.read()
        if len(file_bytes) > 2.5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File too large (max 2.5MB)")
            
        # Extract text based on file type
        if file.filename.lower().endswith('.pdf'):
            cv_text = await extract_text_from_pdf(file_bytes)
        else:
            cv_text = await extract_text_from_docx(file_bytes)
        
        if not (cv_text or cv_text.strip()):
            raise HTTPException(status_code=400, detail="Could not extract text from the document. Try a different file.")
            
        storage_path = f"cv_{user['id']}{'.pdf' if file.filename.lower().endswith('.pdf') else '.docx'}"

        # Run LLM parse + storage upload in parallel — both are independent I/O ops
        async def upload_to_storage():
            try:
                await asyncio.to_thread(
                    get_supabase().storage.from_("cvs").upload,
                    storage_path,
                    file_bytes,
                    {"content-type": file.content_type or "application/octet-stream", "upsert": "true"}
                )
            except Exception as e:
                print(f"Failed to upload to storage: {e}")

        parsed_data, _ = await asyncio.gather(
            parse_cv(cv_text),      # 1. LLM parse (OpenRouter, ~10s)
            upload_to_storage(),    # 2. Storage upload (Supabase, ~2s) — runs concurrently
        )
            
        # Decode incoming preferences from React Native
        prefs_dict = {}
        if preferences:
            try:
                prefs_dict = json.loads(preferences)
            except Exception:
                pass

        experience_level_chosen = prefs_dict.get("seniority") or parsed_data.get("experience_level", "mid")
        prefs_dict["education"] = parsed_data.get("education", [])
        prefs_dict["projects"] = parsed_data.get("projects", [])
        prefs_dict["languages"] = parsed_data.get("languages", [])

        # Generate semantic embedding for matching (may be slow on first request)
        cv_vector = None
        try:
            cv_vector = generate_cv_embedding(parsed_data, cv_text)
        except Exception as e:
            print(f"Failed to generate CV embedding: {e}")

        update_data = {
            "cv_storage_path": storage_path,
            "cv_text": cv_text,
            "extracted_skills": parsed_data.get("skills", []),
            "cv_embedding": cv_vector,
            "experience_level": experience_level_chosen,
            "target_locations": [prefs_dict.get("geography")] if prefs_dict.get("geography") else [],
            "fields": prefs_dict.get("domains") or parsed_data.get("fields", []),
            "preferences": prefs_dict,
            "name": parsed_data.get("full_name") or user.get("name"),
            "email": parsed_data.get("email") or user.get("email"),
            "linkedin_url": parsed_data.get("linkedin_url") or user.get("linkedin_url")
        }
        
        get_supabase().table("users").update(update_data).eq("id", user["id"]).execute()
        
        signed_url = None
        try:
            signed_url = get_supabase().storage.from_("cvs").create_signed_url(storage_path, 3600).get("signedURL")
        except Exception:
            pass
            
        return {
            "success": True, 
            "data": {
                "skills": update_data["extracted_skills"],
                "experience_level": update_data["experience_level"],
                "cv_url": signed_url,
                "message": "CV uploaded and parsed successfully."
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
