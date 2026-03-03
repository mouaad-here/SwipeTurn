import os
import sys
from dotenv import load_dotenv

# Add parent dir to path to import services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dependencies import supabase
from services.embeddings import generate_cv_embedding

def backfill_user_embeddings():
    print("Fetching users with missing embeddings...")
    res = supabase.table("users").select("*").is_("cv_embedding", "null").execute()
    users = res.data
    
    if not users:
        print("No users found with missing embeddings.")
        return
        
    print(f"Found {len(users)} users to process.")
    
    for user in users:
        cv_text = user.get("cv_text")
        if not cv_text:
            print(f"Skipping user {user['id']} (no CV text found).")
            continue
            
        print(f"Generating embedding for {user.get('name')}...")
        try:
            # Mock parsed data from existing user fields
            parsed_data = {
                "skills": user.get("extracted_skills", []),
                "experience_level": user.get("experience_level", "mid"),
                "fields": user.get("fields", [])
            }
            vector = generate_cv_embedding(parsed_data, cv_text)
            
            supabase.table("users").update({"cv_embedding": vector}).eq("id", user["id"]).execute()
            print(f"✅ Successfully updated user {user['id']}")
        except Exception as e:
            print(f"❌ Failed to process user {user['id']}: {e}")

if __name__ == "__main__":
    backfill_user_embeddings()
