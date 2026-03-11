"""
One-time backfill: re-embed all existing jobs using intfloat/multilingual-e5-small.
Replaces old all-MiniLM-L6-v2 embeddings (both are 384-dim, no schema change needed).

Usage:
    cd pipeline
    .\\venv\\Scripts\\Activate.ps1
    python scripts/backfill_embeddings_e5.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
BATCH_SIZE = 50

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Loading efederici/multilingual-e5-small-4096...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer("efederici/multilingual-e5-small-4096")
    print("Model loaded.")

    offset = 0
    total_updated = 0

    while True:
        res = (
            supabase.table("jobs")
            .select("id, title, required_skills, experience_level, description_text")
            .order("posted_at", desc=True)
            .range(offset, offset + BATCH_SIZE - 1)
            .execute()
        )
        jobs = res.data or []
        if not jobs:
            break

        texts = []
        for job in jobs:
            skills = job.get("required_skills") or []
            if isinstance(skills, str):
                import json
                try:
                    skills = json.loads(skills)
                except Exception:
                    skills = []
            skills_text = ", ".join(skills)
            level = job.get("experience_level") or "unspecified"
            desc = (job.get("description_text") or "")[:2500]
            text = (
                f"passage: Role: {job.get('title', '')}. "
                f"Required: {skills_text}. "
                f"Experience level: {level}. "
                f"Context: {desc}"
            ).strip()
            texts.append(text)

        vectors = model.encode(texts, batch_size=64, show_progress_bar=False)

        for job, vector in zip(jobs, vectors):
            try:
                supabase.table("jobs").update(
                    {"description_embedding": vector.tolist()}
                ).eq("id", job["id"]).execute()
                total_updated += 1
            except Exception as e:
                print(f"  Failed to update {job['id']}: {e}")

        print(f"  Updated {len(jobs)} jobs (total: {total_updated})")
        offset += BATCH_SIZE

    print(f"\nDone. Re-embedded {total_updated} jobs with multilingual-e5-small-4096.")


if __name__ == "__main__":
    main()
