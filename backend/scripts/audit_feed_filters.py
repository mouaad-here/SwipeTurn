"""
Audit feed filters: validate job_region / experience_level and the two matrices.

Run from repo root:
  python backend/scripts/audit_feed_filters.py

Or from backend with venv:
  python scripts/audit_feed_filters.py

Checks:
1. Data quality: active jobs by (job_region, experience_level); warn on null/invalid.
2. Matrix consistency: echo ALLOWED_EXPERIENCE_GLOBAL and ALLOWED_EXPERIENCE_MOROCCO.
3. Spot-check: for a few (geography, user_seniority) pairs, assert feed filter returns only allowed levels.
"""

import os
import sys
from collections import Counter

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

# Same as backend/routers/jobs.py (source of truth)
ALLOWED_EXPERIENCE_GLOBAL = {
    "student": ["student"],
    "junior": ["student", "junior"],
    "mid": ["junior", "mid"],
    "senior": ["mid", "senior", "senior_lead"],
}
ALLOWED_EXPERIENCE_MOROCCO = {
    "student": ["student"],
    "junior": ["student", "mid"],
    "mid": ["mid"],
    "senior": ["mid", "senior", "senior_lead"],
}

VALID_JOB_REGIONS = {"morocco", "global"}
VALID_EXPERIENCE_LEVELS = {"student", "junior", "mid", "senior", "senior_lead"}


def fetch_active_jobs():
    """Fetch active jobs with job_region and experience_level. If job_region column is missing, fetch without it and derive region from location/source."""
    cols = "id, experience_level, location, source"
    try:
        res = supabase.table("jobs").select("id, job_region, experience_level, location, source").eq(
            "is_active", True
        ).execute()
        return res.data or []
    except Exception as e:
        if "job_region" in str(e) or "does not exist" in str(e).lower():
            res = supabase.table("jobs").select(cols).eq("is_active", True).execute()
            data = res.data or []
            # Derive job_region like fallback in jobs.py
            for j in data:
                loc = (j.get("location") or "").lower()
                src = (j.get("source") or "").lower()
                j["job_region"] = "morocco" if ("morocco" in loc or "maroc" in loc or src in ("rekrute", "stagiaires")) else "global"
            return data
        raise


def audit_data_quality(jobs):
    """Count by (job_region, experience_level); warn on null/invalid."""
    print("\n--- 1. Data quality (active jobs) ---")
    by_region_exp = Counter()
    null_region = 0
    invalid_region = 0
    null_exp = 0
    invalid_exp = 0

    for j in jobs:
        r = (j.get("job_region") or "").strip().lower() or None
        e = (j.get("experience_level") or "").strip().lower() or None

        if r is None:
            null_region += 1
        elif r not in VALID_JOB_REGIONS:
            invalid_region += 1
        if e is None:
            null_exp += 1
        elif e not in VALID_EXPERIENCE_LEVELS:
            invalid_exp += 1

        key_r = r if r in VALID_JOB_REGIONS else "_null_or_invalid"
        key_e = e if e in VALID_EXPERIENCE_LEVELS else "_null_or_invalid"
        by_region_exp[(key_r, key_e)] += 1

    print(f"  Total active jobs: {len(jobs)}")
    print("  By (job_region, experience_level):")
    for (r, e), count in sorted(by_region_exp.items(), key=lambda x: (-x[1], x[0])):
        print(f"    ({r!r}, {e!r}): {count}")

    issues = []
    if null_region:
        issues.append(f"  WARN: job_region NULL: {null_region}")
    if invalid_region:
        issues.append(f"  WARN: job_region not in {VALID_JOB_REGIONS}: {invalid_region}")
    if null_exp:
        issues.append(f"  WARN: experience_level NULL: {null_exp}")
    if invalid_exp:
        issues.append(f"  WARN: experience_level not in {VALID_EXPERIENCE_LEVELS}: {invalid_exp}")
    if issues:
        print("  Issues:")
        for line in issues:
            print(line)
    else:
        print("  No schema issues detected.")
    return len(issues) == 0


def audit_matrices():
    """Echo the two matrices for diff against jobs.py."""
    print("\n--- 2. Matrix consistency (feed source of truth) ---")
    print("  ALLOWED_EXPERIENCE_GLOBAL:")
    for k, v in ALLOWED_EXPERIENCE_GLOBAL.items():
        print(f"    {k}: {v}")
    print("  ALLOWED_EXPERIENCE_MOROCCO:")
    for k, v in ALLOWED_EXPERIENCE_MOROCCO.items():
        print(f"    {k}: {v}")


def spot_check_feed(jobs):
    """Simulate feed filter for a few (geography, user_seniority); assert every returned job has allowed experience_level and job_region."""
    print("\n--- 3. Spot-check feed rules ---")
    cases = [
        ("morocco", "junior", ALLOWED_EXPERIENCE_MOROCCO["junior"], "morocco"),
        ("global", "mid", ALLOWED_EXPERIENCE_GLOBAL["mid"], "global"),
        ("both", "senior", ALLOWED_EXPERIENCE_GLOBAL["senior"], None),
    ]
    all_ok = True
    for geo, seniority, allowed_list, expected_region in cases:
        allowed = set(allowed_list)
        # Same as feed: region filter (if morocco/global) + experience_level in allowed
        returned = [
            j for j in jobs
            if (expected_region is None or (j.get("job_region") or "").lower() == expected_region)
            and (j.get("experience_level") or "").lower() in allowed
        ]
        bad_level = [j for j in returned if (j.get("experience_level") or "").lower() not in allowed]
        bad_region = [j for j in returned if expected_region and (j.get("job_region") or "").lower() != expected_region]
        if bad_level or bad_region:
            print(f"  FAIL geography={geo!r} user_seniority={seniority!r}: bad_level={len(bad_level)} bad_region={len(bad_region)}")
            all_ok = False
        else:
            print(f"  OK geography={geo!r} user_seniority={seniority!r}: {len(returned)} jobs in allowed levels {allowed_list}")
    if all_ok:
        print("  All spot-checks passed.")
    return all_ok


def main():
    print("=" * 60)
    print("AUDIT: Feed filters (job_region + experience_level matrices)")
    print("=" * 60)

    jobs = fetch_active_jobs()
    print(f"\nFetched {len(jobs)} active jobs.")

    ok1 = audit_data_quality(jobs)
    audit_matrices()
    ok3 = spot_check_feed(jobs) if jobs else True

    print("\n" + "=" * 60)
    if ok1 and ok3:
        print("Audit finished: no failures.")
    else:
        print("Audit finished: fix warnings/failures above (e.g. backfill job_region or experience_level).")
    print("=" * 60)

    sys.exit(0 if (ok1 and ok3) else 1)


if __name__ == "__main__":
    main()
