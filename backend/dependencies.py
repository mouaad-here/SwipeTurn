from fastapi import Depends, HTTPException, Header
from jose import jwt
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional

import config

# Initialize Supabase client lazily
_supabase: Optional[Client] = None

def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        print("Initializing Supabase client...")
        _supabase = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)
        print("Supabase client initialized.")
    return _supabase

# Clerk JWT authentication + optional Guest mode (for development without auth)
def get_current_user_id(
    authorization: Optional[str] = Header(None),
    x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id"),
) -> str:
    """Returns clerk_user_id from JWT, or guest_{id} if X-Guest-Id provided and no valid auth."""
    # Try Bearer token first
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
                clerk_id = payload.get("sub")
                if clerk_id:
                    return clerk_id
            except Exception:
                pass

    # Fall back to guest mode when no valid Bearer token
    if x_guest_id and x_guest_id.strip():
        return f"guest_{x_guest_id.strip()}"
    raise HTTPException(status_code=401, detail="Invalid or missing authorization. Provide Bearer token or X-Guest-Id header.")


def get_current_user(clerk_id: str = Depends(get_current_user_id)):
    """Fetches user row from Supabase. If missing, auto-creates it."""
    try:
        supabase = get_supabase()
        response = supabase.table('users').select('*').eq('clerk_user_id', clerk_id).execute()
        
        if len(response.data) > 0:
            return response.data[0]
            
        # If user doesn't exist in Supabase yet, create them 
        # (in production, we'd normally extract name/email from the JWT payload claims here)
        new_user = {
            "clerk_user_id": clerk_id,
            "email": "user@swipeturn.com",
            "name": "New User"
        }
        
        insert_response = supabase.table('users').insert(new_user).execute()
        return insert_response.data[0]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
