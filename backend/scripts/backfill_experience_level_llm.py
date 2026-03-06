"""
LLM backfill for jobs.experience_level using OpenRouter (Gemini 2.5 Flash).

Run after pipeline or on schedule (e.g. every 12h):
  cd backend
  .\\venv\\Scripts\\Activate.ps1
  python scripts/backfill_experience_level_llm.py

Requires OPENROUTER_API_KEY in backend/.env. Skips if missing.
"""

import asyncio
import json
import os
import sys
import time
from typing import Any, Dict, List

from dotenv import load_dotenv

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

load_dotenv(os.path.join(BACKEND_DIR, ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY) must be set in backend/.env")
    sys.exit(1)

if not OPENROUTER_API_KEY:
    print("OPENROUTER_API_KEY not set. Skipping LLM backfill. Set it in backend/.env to run.")
    sys.exit(0)

from supabase import create_client
import httpx

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

VALID_LEVELS = {"student", "junior", "mid", "senior", "senior_lead"}
BATCH_SIZE = 600
MIN_CONFIDENCE = 0.7
DESC_SNIPPET_LEN = 800
REQUEST_DELAY_SEC = 0.5


def fetch_jobs_to_backfill(limit: int = BATCH_SIZE) -> List[Dict]:
    cols = "id, title, description_text, experience_level"
    res = (
        supabase.table("jobs")
        .select(cols)
        .eq("is_active", True)
        .or_("experience_level.is.null,experience_level.eq.unknown")
        .limit(limit)
        .execute()
    )
    return res.data or []


async def classify_one(client: httpx.AsyncClient, job: Dict) -> Dict[str, Any]:
    """Call OpenRouter to classify job experience level. Returns {level, confidence} or {}."""
    title = (job.get("title") or "").strip()
    desc = (job.get("description_text") or "").strip()[:DESC_SNIPPET_LEN]
    payload = json.dumps({"title": title, "description": desc})

    prompt = """You are an expert recruiter. Classify this job's experience level from the title and description.

Job (JSON):
""" + payload + """

Return ONLY a JSON object with no markdown, no code blocks:
{"experience_level": "student" | "junior" | "mid" | "senior" | "senior_lead", "confidence": 0.0 to 1.0}

Use: student for internships/stage/trainee; junior for 0-2y; mid for 2-5y; senior for 5+ or "senior"/"lead" in title; senior_lead for principal/staff/director."""

    try:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "google/gemini-2.5-flash",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0].strip()
        out = json.loads(raw)
        level = (out.get("experience_level") or "").strip().lower()
        conf = float(out.get("confidence", 0))
        if level not in VALID_LEVELS:
            return {}
        return {"experience_level": level, "confidence": conf}
    except Exception as e:
        print(f"  [LLM error for job {job.get('id')}]: {e}")
        return {}


async def backfill_llm(jobs: List[Dict], min_conf: float = MIN_CONFIDENCE) -> int:
    updated = 0
    async with httpx.AsyncClient() as client:
        for i, job in enumerate(jobs):
            result = await classify_one(client, job)
            if not result or result.get("confidence", 0) < min_conf:
                await asyncio.sleep(REQUEST_DELAY_SEC)
                continue
            level = result["experience_level"]
            try:
                supabase.table("jobs").update({"experience_level": level}).eq("id", job["id"]).execute()
                updated += 1
                if updated <= 5 or updated % 50 == 0:
                    print(f"  Updated job {job['id']} -> {level} (conf={result['confidence']:.2f})")
            except Exception as e:
                print(f"  [DB error] job {job['id']}: {e}")
            await asyncio.sleep(REQUEST_DELAY_SEC)
    return updated


def main():
    print("=" * 60)
    print("LLM backfill: jobs.experience_level (OpenRouter / Gemini 2.5 Flash)")
    print("=" * 60)

    jobs = fetch_jobs_to_backfill()
    if not jobs:
        print("No jobs with NULL/'unknown' experience_level. Nothing to do.")
        return

    print(f"Classifying {len(jobs)} jobs (min_confidence={MIN_CONFIDENCE})...")
    t0 = time.time()
    updated = asyncio.run(backfill_llm(jobs))
    elapsed = time.time() - t0
    print(f"Done in {elapsed:.1f}s. Updated {updated} jobs.")
    print("=" * 60)


if __name__ == "__main__":
    main()
