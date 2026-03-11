from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import json

from dependencies import supabase, get_supabase, get_current_user
from services.cv_parser import extract_text_from_pdf, extract_text_from_docx, parse_cv
from services.embeddings import generate_cv_embedding

router = APIRouter(prefix="/users", tags=["Users"])

class PreferencesUpdate(BaseModel):
    preferences: Optional[Dict[str, Any]] = None
    target_locations: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    work_authorization: Optional[str] = None
    desired_salary_min: Optional[int] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None

@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    """Fetches the current user profile, computing the completion score and signed CV URL."""
    
    # Generate 1-hour signed URL if user has uploaded a CV
    cv_url = None
    if user.get("cv_storage_path"):
        try:
            res = supabase.storage.from_("cvs").create_signed_url(user["cv_storage_path"], 3600)
            cv_url = res.get("signedURL")
        except Exception:
            pass # Fails gracefully if bucket setup is incomplete
            
    user["cv_url"] = cv_url
    
    # Compute dynamic profile score
    score = 0
    if user.get("cv_storage_path"):          score += 30
    if len(user.get("extracted_skills", [])) >= 3: score += 20
    if user.get("linkedin_url"):             score += 15
    if user.get("preferences"):              score += 15
    if len(user.get("target_locations", [])) > 0:  score += 10
    if len(user.get("languages", [])) > 0:         score += 10
    
    user["profile_score"] = min(100, score)
    
    return user

@router.patch("/preferences")
def update_preferences(prefs: PreferencesUpdate, user: dict = Depends(get_current_user)):
    """Updates user profile and dynamic preference objects."""
    update_data = {k: v for k, v in prefs.model_dump().items() if v is not None}
    
    if not update_data:
        return {"success": True, "message": "No fields to update"}
        
    try:
        response = supabase.table("users").update(update_data).eq("id", user["id"]).execute()
        return {"success": True, "data": response.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cv")
async def upload_cv(
    file: UploadFile = File(...), 
    preferences: Optional[str] = Form(None),
    user: dict = Depends(get_current_user)
):
    """Uploads a PDF/DOCX to Supabase Storage, parses text, extracts skills via LLM, and updates user profile."""
    if not file.filename.endswith(('.pdf', '.docx')):
        raise HTTPException(status_code=400, detail="Only PDF or DOCX files are supported")
        
    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
        
    # Extract text based on file type
    if file.filename.endswith('.pdf'):
        cv_text = await extract_text_from_pdf(file_bytes)
    else:
        cv_text = await extract_text_from_docx(file_bytes)
        
    # 1. Parse via OpenRouter LLM (or mock)
    parsed_data = await parse_cv(cv_text)
    
    # 2. Upload raw file to Supabase Storage Private Bucket 'cvs'
    storage_path = f"cv_{user['id']}{'.pdf' if file.filename.endswith('.pdf') else '.docx'}"
    
    try:
        # Upsert automatically overwrites the existing file if uploaded again
        supabase.storage.from_("cvs").upload(
            path=storage_path, 
            file=file_bytes, 
            file_options={"content-type": file.content_type, "upsert": "true"}
        )
    except Exception as e:
        # Log it, but don't fail the request completely if bucket isn't totally ready
        print(f"Failed to upload to storage: {e}")
        
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

    # Update database row with extracted JSON, text, and embeddings
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
        "linkedin_url": parsed_data.get("linkedin_url") or user.get("linkedin_url"),
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
