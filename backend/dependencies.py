from fastapi import Depends, HTTPException
from jose import jwt
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional

import config

# Initialize Supabase client
# Service role key is used to have admin rights for creating users and overriding RLS
supabase: Client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

# Clerk JWT authentication
def get_current_user_id(authorization: str) -> str:
    """Verifies a Clerk RS256 JWT and returns the clerk_user_id."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
        
    token = authorization.split(" ")[1]
    try:
        if not config.CLERK_PEM_KEY:
            # Bypass for local dev if requested by user (since we don't have the key yet)
            return "mocked_clerk_user_id"
            
        payload = jwt.decode(
            token,
            config.CLERK_PEM_KEY,
            algorithms=["RS256"],
            options={"verify_aud": False} # Clerk uses specific audiences, simplified for MVP
        )
        return payload.get("sub")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

def get_current_user(clerk_id: str = Depends(get_current_user_id)):
    """Fetches user row from Supabase. If missing, auto-creates it."""
    try:
        response = supabase.table('users').select('*').eq('clerk_user_id', clerk_id).execute()
        
        if len(response.data) > 0:
            return response.data[0]
            
        # If user doesn't exist in Supabase yet, create them 
        # (in production, we'd normally extract name/email from the JWT payload claims here)
        new_user = {
            "clerk_user_id": clerk_id,
            "email": "user@swipturn.com",
            "name": "New User"
        }
        
        insert_response = supabase.table('users').insert(new_user).execute()
        return insert_response.data[0]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
