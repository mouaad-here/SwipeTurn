"""
Clear all jobs (and swipes that reference them) so you can run the scheduler from scratch.

Run from repo root:
  python backend/scripts/clear_jobs.py

Or from backend with venv activated:
  .\venv\Scripts\Activate.ps1
  python scripts/clear_jobs.py

Then run the pipeline scheduler to re-scrape:
  cd pipeline
  .\venv\Scripts\Activate.ps1   # or: ..\backend\venv\Scripts\Activate.ps1 if venv is in backend
  python scheduler.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY) must be set in .env")
    sys.exit(1)

from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

BATCH = 200


def clear_swipes():
    """Delete all swipes so saved lists are empty and we avoid orphaned references."""
    print("Deleting all swipes...")
    deleted = 0
    while True:
        res = supabase.table("swipes").select("id").limit(BATCH).execute()
        rows = res.data or []
        if not rows:
            break
        ids = [r["id"] for r in rows]
        supabase.table("swipes").delete().in_("id", ids).execute()
        deleted += len(ids)
    print(f"  Deleted {deleted} swipes.")


def clear_jobs():
    """Delete all jobs in batches."""
    print("Deleting all jobs...")
    deleted = 0
    while True:
        res = supabase.table("jobs").select("id").limit(BATCH).execute()
        rows = res.data or []
        if not rows:
            break
        ids = [r["id"] for r in rows]
        supabase.table("jobs").delete().in_("id", ids).execute()
        deleted += len(ids)
        print(f"  Deleted {deleted} jobs so far...")
    print(f"  Total deleted: {deleted} jobs.")


def main():
    confirm = input("This will DELETE all swipes and all jobs. Type 'yes' to confirm: ")
    if confirm.strip().lower() != "yes":
        print("Aborted.")
        return
    clear_swipes()
    clear_jobs()
    print("\nDone. Run the pipeline scheduler to re-scrape jobs (see script docstring).")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Clear all jobs and swipes from the DB.")
    parser.add_argument("--force", "-f", action="store_true", help="Skip confirmation")
    args = parser.parse_args()
    if args.force:
        clear_swipes()
        clear_jobs()
        print("\nDone. Run the pipeline scheduler to re-scrape jobs.")
    else:
        main()
