from fastapi import Depends, HTTPException, Header
from jose import jwt
from supabase import create_client, Client, ClientOptions
from pydantic import BaseModel
from typing import Optional, Dict, Any
import httpx

# MONKEYPATCH HTTPX: Disable HTTP/2 globally to prevent WinError 10035 socket crashes on Windows
original_client_init = httpx.Client.__init__
def patched_client_init(self, *args, **kwargs):
    kwargs['http2'] = False
    original_client_init(self, *args, **kwargs)
httpx.Client.__init__ = patched_client_init

original_async_client_init = httpx.AsyncClient.__init__
def patched_async_client_init(self, *args, **kwargs):
    kwargs['http2'] = False
    original_async_client_init(self, *args, **kwargs)
httpx.AsyncClient.__init__ = patched_async_client_init

import config

# Initialize Supabase client lazily
_supabase: Optional[Client] = None

# Columns fetched internally for every authenticated request.
# cv_embedding is included because jobs.py uses it directly for feed matching.
# cv_text and cv_storage_path are intentionally excluded — they are no longer
# written to the DB (see Component 2) and would only bloat the response.
_INTERNAL_USER_COLUMNS = ",".join([
    "id", "clerk_user_id", "email", "name",
    "parsed_experience_level", "preferences",
    "extracted_skills", "cv_embedding",
    "target_locations", "fields", "desired_job_type",
    "relocation_preference", "linkedin_url", "portfolio_url",
    "onboarding_completed_at", "languages",
    "is_guest", "created_at", "device_id",
    "subscription", "subscription_expires_at",
    "work_authorization",
])


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        print("Initializing Supabase client...")
        # Use longer timeouts to prevent WinError 10035 on Windows
        options = ClientOptions(postgrest_client_timeout=20.0, storage_client_timeout=20.0)
        _supabase = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, options=options)
        print("Supabase client initialized.")
    return _supabase

def get_token_payload(
    authorization: Optional[str] = Header(None),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id")
) -> Dict[str, Any]:
    """Verifies a Clerk RS256 JWT and returns payload, or falls back to Guest Mode."""
    # 1. Try Bearer token first
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        if token and token != "null":
            try:
                if config.CLERK_PEM_KEY and "BEGIN PUBLIC KEY" in config.CLERK_PEM_KEY:
                    payload = jwt.decode(
                        token,
                        config.CLERK_PEM_KEY,
                        algorithms=["RS256"],
                        options={"verify_aud": False}
                    )
                else:
                    payload = jwt.decode(token, key="", options={"verify_signature": False, "verify_aud": False})
                return payload
            except Exception as e:
                pass # Fall through to guest or fail

    # 2. Fall back to guest mode
    if x_guest_id and x_guest_id.strip():
        guest_sub = f"guest_{x_guest_id.strip()}"
        return {
            "sub": guest_sub,
            "email": f"{guest_sub}@swipeturn.guest",
            "first_name": "Guest",
            "last_name": "User"
        }
        
    raise HTTPException(status_code=401, detail="Invalid authorization. Provide Bearer token or X-Guest-Id header.")

def get_current_user_id(payload: Dict[str, Any] = Depends(get_token_payload)) -> str:
    """Returns just the clerk_user_id or guest_id."""
    return payload.get("sub")

def get_current_user(payload: Dict[str, Any] = Depends(get_token_payload)) -> Dict[str, Any]:
    """Fetches user row from Supabase. If missing, auto-creates it using Clerk claims (or Guest claims)."""
    clerk_id = payload.get("sub")
    if not clerk_id:
         raise HTTPException(status_code=401, detail="Invalid token payload: missing sub")
         
    try:
        supabase = get_supabase()
        response = supabase.table('users').select(_INTERNAL_USER_COLUMNS).eq('clerk_user_id', clerk_id).execute()
        
        if len(response.data) > 0:
            return response.data[0]
            
        # Extract name from JWT claims
        first_name = payload.get("first_name", "")
        last_name = payload.get("last_name", "")
        name = payload.get("name") or f"{first_name} {last_name}".strip() or "Guest"
        
        # Extract email from JWT claims
        email = payload.get("email") or f"{clerk_id}@swipeturn.com"
        
        # If user doesn't exist in Supabase yet, create them 
        new_user = {
            "clerk_user_id": clerk_id,
            "email": email,
            "name": name
        }
        
        try:
            insert_response = supabase.table('users').insert(new_user).execute()
            if insert_response.data:
                # Re-fetch with scoped columns to stay consistent
                response = supabase.table('users').select(_INTERNAL_USER_COLUMNS).eq('clerk_user_id', clerk_id).execute()
                if response.data:
                    return response.data[0]
            return insert_response.data[0] if insert_response.data else {}
        except Exception as insert_err:
            if "23505" in str(insert_err) or "already exists" in str(insert_err):
                response = supabase.table('users').select(_INTERNAL_USER_COLUMNS).eq('clerk_user_id', clerk_id).execute()
                if len(response.data) > 0:
                    return response.data[0]
            raise insert_err
            
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[get_current_user] DATABASE ERROR: {e}\n{error_trace}")
        raise HTTPException(
            status_code=500, 
            detail=f"Database/Auth Error in get_current_user: {str(e)}"
        )
