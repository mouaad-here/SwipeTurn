"""
Backfill experience_level for jobs where it is NULL or 'unknown',
using the strict categorizer from pipeline.data_cleaning.

Run from repo root (recommended):
    cd backend
    .\\venv\\Scripts\\Activate.ps1
    python scripts/backfill_experience_level.py
"""

import os
import sys
from typing import List, Dict

from dotenv import load_dotenv

# Make backend and repo root importable
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

load_dotenv(os.path.join(BACKEND_DIR, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY) must be set in backend/.env")
    sys.exit(1)

from supabase import create_client  # type: ignore
from pipeline.data_cleaning import categorize_experience_strict  # type: ignore

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def fetch_jobs_to_backfill(batch_size: int = 500) -> List[Dict]:
    """
    Fetch active jobs where experience_level is NULL or 'unknown'.
    """
    cols = "id, title, description_text, experience_level, job_region, source"
    res = (
        supabase.table("jobs")
        .select(cols)
        .eq("is_active", True)
        .or_("experience_level.is.null,experience_level.eq.unknown")
        .limit(batch_size)
        .execute()
    )
    data = res.data or []
    print(f"Fetched {len(data)} jobs with NULL/'unknown' experience_level to inspect.")
    return data


def backfill_experience_level(jobs: List[Dict]) -> None:
    """
    For each job, derive experience_level from title + description using
    categorize_experience_strict. Update only when we get a non-None level
    and it differs from the current value.
    """
    updates = []
    for j in jobs:
        title = j.get("title") or ""
        desc = j.get("description_text") or ""
        current = (j.get("experience_level") or "").strip().lower() or None

        new_level = categorize_experience_strict(title, desc)

        if not new_level:
            continue
        if current == new_level:
            continue

        updates.append({"id": j["id"], "experience_level": new_level})

    if not updates:
        print("No changes to apply (no confident new levels found).")
        return

    print(f"Applying updates for {len(updates)} jobs...")
    # Supabase Python client doesn't support bulk update by primary key in one call,
    # so we do simple per-row updates. Volume is small (~hundreds), so it's fine.
    for row in updates:
        supabase.table("jobs").update({"experience_level": row["experience_level"]}).eq("id", row["id"]).execute()

    print("Backfill completed.")


def main():
    print("=" * 60)
    print("Backfill jobs.experience_level using pipeline.data_cleaning")
    print("=" * 60)

    jobs = fetch_jobs_to_backfill()
    if not jobs:
        print("No jobs with NULL/'unknown' experience_level found. Nothing to do.")
        return

    backfill_experience_level(jobs)

    print("=" * 60)
    print("Done. Re-run backend/scripts/audit_feed_filters.py to verify.")
    print("=" * 60)


if __name__ == "__main__":
    main()

