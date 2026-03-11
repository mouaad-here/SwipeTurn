from fastapi import Depends, HTTPException, Header
from jose import jwt
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional, Dict, Any

import config

# Initialize Supabase client
# Service role key is used to have admin rights for creating users and overriding RLS
supabase: Client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

def get_supabase() -> Client:
    """Returns the globally initialized Supabase client."""
    return supabase

# Clerk JWT authentication
def get_token_payload(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Verifies a Clerk RS256 JWT and returns the decoded payload claims."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
        
    token = authorization.split(" ")[1]
    try:
        if not config.CLERK_PEM_KEY:
            # Bypass for local dev if requested by user (since we don't have the key yet)
            return {
                "sub": "mocked_clerk_user_id", 
                "email": "mock@swipturn.com", 
                "first_name": "Mock",
                "last_name": "User"
            }
            
        payload = jwt.decode(
            token,
            config.CLERK_PEM_KEY,
            algorithms=["RS256"],
            options={"verify_aud": False} # Clerk uses specific audiences, simplified for MVP
        )
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

def get_current_user(payload: Dict[str, Any] = Depends(get_token_payload)) -> Dict[str, Any]:
    """Fetches user row from Supabase. If missing, auto-creates it using Clerk claims."""
    clerk_id = payload.get("sub")
    if not clerk_id:
         raise HTTPException(status_code=401, detail="Invalid token payload: missing sub")
         
    try:
        response = supabase.table('users').select('*').eq('clerk_user_id', clerk_id).execute()
        
        if len(response.data) > 0:
            return response.data[0]
            
        # Extract name from JWT claims
        first_name = payload.get("first_name", "")
        last_name = payload.get("last_name", "")
        name = payload.get("name") or f"{first_name} {last_name}".strip() or "Guest"
        
        # Extract email from JWT claims
        email = payload.get("email") or "user@swipturn.com"
        
        # If user doesn't exist in Supabase yet, create them 
        new_user = {
            "clerk_user_id": clerk_id,
            "email": email,
            "name": name
        }
        
        insert_response = supabase.table('users').insert(new_user).execute()
        return insert_response.data[0]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
