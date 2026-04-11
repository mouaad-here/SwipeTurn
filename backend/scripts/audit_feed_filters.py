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

from constants import get_seniority_filter, SENIORITY_FILTER

# DB stores job_region as "MA" for Morocco; we normalize to lowercase in checks
VALID_JOB_REGIONS = {"ma", "global"}
VALID_EXPERIENCE_LEVELS = {"intern", "student", "junior", "mid", "senior", "lead", "unknown"}


def fetch_active_jobs():
    """Fetch active jobs with job_region, experience_level, city, country_code. Fallback derive job_region from source if column missing."""
    cols = "id, experience_level, city, country_code, source"
    try:
        res = supabase.table("jobs").select("id, job_region, experience_level, city, country_code, source, globally_accessible, open_to_intl").eq(
            "is_active", True
        ).execute()
        return res.data or []
    except Exception as e:
        if "job_region" in str(e) or "does not exist" in str(e).lower():
            res = supabase.table("jobs").select(cols).eq("is_active", True).execute()
            data = res.data or []
            for j in data:
                src = (j.get("source") or "").lower()
                j["job_region"] = "MA" if src in ("rekrute", "stagiaires") else "global"
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
        r_raw = (j.get("job_region") or "").strip()
        r = r_raw.lower() if r_raw else None
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
    """Echo seniority filter (strict: one level per user) used by jobs feed."""
    print("\n--- 2. Matrix consistency (feed source of truth) ---")
    print("  SENIORITY_FILTER (allowed experience_level per user selection):")
    for k, v in SENIORITY_FILTER.items():
        print(f"    {k}: {v}")


def spot_check_feed(jobs):
    """Simulate feed filter for (geography, user_seniority). For global: also require globally_accessible and open_to_intl so we only show jobs user can apply for."""
    print("\n--- 3. Spot-check feed rules ---")
    # expected_region: "ma" = Morocco only, "global" = global jobs (must have globally_accessible & open_to_intl), None = both
    cases = [
        ("morocco", "junior", "ma"),
        ("global", "mid", "global"),
        ("both", "senior", None),
    ]
    all_ok = True
    for geo, seniority, expected_region in cases:
        allowed_levels = get_seniority_filter(seniority)
        allowed = set(allowed_levels)
        if expected_region == "ma":
            returned = [
                j for j in jobs
                if (j.get("job_region") or "").strip().lower() == "ma"
                and ((j.get("experience_level") or "").lower() in allowed or j.get("experience_level") is None)
            ]
        elif expected_region == "global":
            # Discovery: NULL is allowed. Only False is rejected.
            returned = [
                j for j in jobs
                if (j.get("globally_accessible") is True or j.get("globally_accessible") is None)
                and (j.get("open_to_intl") is True or j.get("open_to_intl") is None)
                and ((j.get("experience_level") or "").lower() in allowed or j.get("experience_level") is None)
            ]
        else:
            returned = [
                j for j in jobs
                if ((j.get("job_region") or "").strip().lower() == "ma"
                    or ((j.get("globally_accessible") is True or j.get("globally_accessible") is None) 
                        and (j.get("open_to_intl") is True or j.get("open_to_intl") is None)))
                and ((j.get("experience_level") or "").lower() in allowed or j.get("experience_level") is None)
            ]
        bad_level = [j for j in returned if (j.get("experience_level") or "").lower() not in allowed and j.get("experience_level") is not None]
        # For discovery we don't filter by job_region (we check MA or global_accessible), so don't query region strictly
        bad_region = [] if expected_region == "global" else [j for j in returned if expected_region and (j.get("job_region") or "").strip().lower() != expected_region]
        if expected_region == "global":
            # Ensure no explicit 'False' values leaked through
            bad_global = [j for j in returned if j.get("globally_accessible") is False or j.get("open_to_intl") is False]
            if bad_global:
                print(f"  FAIL geography={geo!r}: {len(bad_global)} jobs with EXPLICIT globally_accessible=false or open_to_intl=false returned")
                all_ok = False
        if bad_level or bad_region:
            print(f"  FAIL geography={geo!r} user_seniority={seniority!r}: bad_level={len(bad_level)} bad_region={len(bad_region)}")
            all_ok = False
        else:
            print(f"  OK geography={geo!r} user_seniority={seniority!r}: {len(returned)} jobs in allowed levels {allowed_levels}")
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
