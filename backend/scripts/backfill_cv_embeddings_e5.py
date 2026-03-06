"""
One-time backfill: re-embed all user CVs using intfloat/multilingual-e5-small.
Replaces old all-MiniLM-L6-v2 embeddings (both are 384-dim, no schema change needed).

Usage:
    cd backend
    .\\venv\\Scripts\\Activate.ps1
    python scripts/backfill_cv_embeddings_e5.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from supabase import create_client

BATCH_SIZE = 20


def main():
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    print("Loading intfloat/multilingual-e5-small...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("intfloat/multilingual-e5-small")
    print("Model loaded.")

    res = (
        supabase.table("users")
        .select("id, extracted_skills, experience_level, preferences, cv_text")
        .not_.is_("cv_text", "null")
        .execute()
    )
    users = res.data or []
    print(f"Found {len(users)} users with CV text to re-embed.")

    updated = 0
    for user in users:
        try:
            prefs = user.get("preferences") or {}
            skills = user.get("extracted_skills") or []
            domains = prefs.get("domains") or []
            keywords = prefs.get("keywords") or []
            exp_level = user.get("experience_level") or prefs.get("seniority") or "mid"
            cv_text = (user.get("cv_text") or "")[:1500]

            text = (
                f"query: Candidate profile. Skills: {', '.join(skills)}. "
                f"Domains: {', '.join(domains)}. "
                f"Keywords: {', '.join(keywords)}. "
                f"Experience: {exp_level}. "
                f"CV snippet: {cv_text}"
            ).strip()

            vector = model.encode(text).tolist()
            supabase.table("users").update(
                {"cv_embedding": vector}
            ).eq("id", user["id"]).execute()
            updated += 1
        except Exception as e:
            print(f"  Failed for user {user['id']}: {e}")

    print(f"\nDone. Re-embedded {updated} user CVs with multilingual-e5-small.")


if __name__ == "__main__":
    main()
