"""
Analyze jobs in the DB: Morocco vs Global, and extract all categories/subcategories.

Run from repo root (loads .env from root):
  python backend/scripts/analyze_jobs_categories.py

Or from backend with venv:
  cd backend && .\\venv\\Scripts\\Activate.ps1 && python scripts/analyze_jobs_categories.py

Outputs:
  - backend/scripts/output/jobs_analysis_report.md   (summary)
  - backend/scripts/output/subcategories_from_db.json (all unique categories/subcategories + counts for app use)
"""

import json
import os
import sys
from pathlib import Path
from collections import defaultdict, Counter

# Run from repo root so .env is found
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Load .env: repo root and backend (so it works from backend/ or repo root)
_env_root = REPO_ROOT / ".env"
_env_backend = BACKEND_ROOT / ".env"
from dotenv import load_dotenv
if _env_root.exists():
    load_dotenv(_env_root)
if _env_backend.exists():
    load_dotenv(_env_backend)
load_dotenv()

os.chdir(REPO_ROOT)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY) must be set in .env")
    sys.exit(1)

from supabase import create_client

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

PAGE_SIZE = 1000
COLS = "id, category, subcategory, job_region, source, country_code, is_active, experience_level, title"


def fetch_all_jobs(active_only: bool = True):
    """Fetch all jobs with category/subcategory/region. Paginate to get full table."""
    all_jobs = []
    offset = 0
    query = (
        supabase.table("jobs")
        .select(COLS)
    )
    if active_only:
        query = query.eq("is_active", True)
    while True:
        res = query.range(offset, offset + PAGE_SIZE - 1).execute()
        batch = res.data or []
        all_jobs.extend(batch)
        print(f"  Fetched {offset + len(batch)} jobs...")
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return all_jobs


def normalize_cat(s: str) -> str:
    """Normalize for grouping: strip, lowercase, collapse empty to empty."""
    if s is None:
        return ""
    return str(s).strip().lower()


def normalize_label(s: str) -> str:
    """Preserve a display label: strip, keep original case if meaningful."""
    if s is None:
        return ""
    return str(s).strip()


def analyze(jobs: list):
    """Split Morocco vs Global, aggregate categories and subcategories."""
    morocco = []
    global_jobs = []
    for j in jobs:
        region = (j.get("job_region") or "").strip().upper()
        if region == "MA":
            morocco.append(j)
        else:
            global_jobs.append(j)

    def count_pairs(job_list):
        pairs = Counter()
        by_category = defaultdict(Counter)
        for j in job_list:
            cat = normalize_cat(j.get("category"))
            sub = normalize_cat(j.get("subcategory"))
            cat_label = normalize_label(j.get("category")) or "(no category)"
            sub_label = normalize_label(j.get("subcategory")) or "(no subcategory)"
            if cat or sub:
                pairs[(cat_label, sub_label)] += 1
                by_category[cat_label][sub_label] += 1
        return pairs, by_category

    pairs_all, by_cat_all = count_pairs(jobs)
    pairs_ma, by_cat_ma = count_pairs(morocco)
    pairs_global, by_cat_global = count_pairs(global_jobs)

    # Unique (category, subcategory) with counts
    all_pairs_unique = list(pairs_all.keys())
    all_pairs_unique.sort(key=lambda x: (x[0], x[1]))

    # Build suggested subcategories list: unique subcategory per category (for app dropdown)
    category_to_subs = defaultdict(set)
    for (cat, sub) in all_pairs_unique:
        if sub and sub != "(no subcategory)":
            category_to_subs[cat].add(sub)
    for cat in list(category_to_subs.keys()):
        category_to_subs[cat] = sorted(category_to_subs[cat])

    return {
        "total_jobs": len(jobs),
        "morocco_count": len(morocco),
        "global_count": len(global_jobs),
        "pairs_all": dict(pairs_all),
        "pairs_morocco": dict(pairs_ma),
        "pairs_global": dict(pairs_global),
        "by_category_all": {k: dict(v) for k, v in by_cat_all.items()},
        "by_category_morocco": {k: dict(v) for k, v in by_cat_ma.items()},
        "by_category_global": {k: dict(v) for k, v in by_cat_global.items()},
        "unique_pairs": all_pairs_unique,
        "suggested_subcategories_by_category": {k: list(v) for k, v in sorted(category_to_subs.items())},
        "sources_morocco": Counter(j.get("source") for j in morocco),
        "sources_global": Counter(j.get("source") for j in global_jobs),
        "experience_levels_morocco": Counter(normalize_cat(j.get("experience_level")) for j in morocco),
        "experience_levels_global": Counter(normalize_cat(j.get("experience_level")) for j in global_jobs),
    }


def main():
    out_dir = Path(__file__).resolve().parent / "output"
    out_dir.mkdir(exist_ok=True)

    print("Fetching all active jobs...")
    jobs = fetch_all_jobs(active_only=True)
    if not jobs:
        print("No jobs found. Exiting.")
        sys.exit(0)

    print(f"\nAnalyzing {len(jobs)} jobs (Morocco vs Global)...")
    result = analyze(jobs)

    # --- JSON output for app: suggested subcategories + full counts ---
    export_json = {
        "generated_from": "analyze_jobs_categories.py",
        "total_jobs_analyzed": result["total_jobs"],
        "morocco_jobs": result["morocco_count"],
        "global_jobs": result["global_count"],
        "suggested_subcategories_by_category": result["suggested_subcategories_by_category"],
        "unique_category_subcategory_pairs_with_counts": [
            {"category": cat, "subcategory": sub, "count": result["pairs_all"].get((cat, sub), 0),
             "morocco": result["pairs_morocco"].get((cat, sub), 0),
             "global": result["pairs_global"].get((cat, sub), 0)}
            for (cat, sub) in result["unique_pairs"]
        ],
        "sources_morocco": dict(result["sources_morocco"]),
        "sources_global": dict(result["sources_global"]),
        "experience_levels_morocco": dict(result["experience_levels_morocco"]),
        "experience_levels_global": dict(result["experience_levels_global"]),
    }
    json_path = out_dir / "subcategories_from_db.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(export_json, f, indent=2, ensure_ascii=False)
    print(f"Wrote {json_path}")

    # --- Markdown report ---
    lines = [
        "# Jobs DB analysis (Morocco vs Global)",
        "",
        f"**Total active jobs analyzed:** {result['total_jobs']}",
        f"- **Morocco (job_region = MA):** {result['morocco_count']}",
        f"- **Global (other regions):** {result['global_count']}",
        "",
        "## Sources",
        "",
        "### Morocco",
        "| Source | Count |",
        "|--------|-------|",
    ]
    for src, count in result["sources_morocco"].most_common():
        lines.append(f"| {src or '(null)'} | {count} |")
    lines.extend([
        "",
        "### Global",
        "| Source | Count |",
        "|--------|-------|",
    ])
    for src, count in result["sources_global"].most_common():
        lines.append(f"| {src or '(null)'} | {count} |")

    lines.extend([
        "",
        "## Experience levels",
        "",
        "### Morocco",
        "| Level | Count |",
        "|-------|-------|",
    ])
    for level, count in result["experience_levels_morocco"].most_common():
        lines.append(f"| {level or '(null)'} | {count} |")
    lines.extend([
        "",
        "### Global",
        "| Level | Count |",
        "|-------|-------|",
    ])
    for level, count in result["experience_levels_global"].most_common():
        lines.append(f"| {level or '(null)'} | {count} |")

    lines.extend([
        "",
        "## Suggested subcategories to add (from DB)",
        "",
        "Use these in onboarding domains. Structure: `category` → list of `subcategory` values found in the DB.",
        "",
        "```json",
        json.dumps(result["suggested_subcategories_by_category"], indent=2, ensure_ascii=False),
        "```",
        "",
        "## All unique (category, subcategory) pairs with counts",
        "",
        "| Category | Subcategory | Total | Morocco | Global |",
        "|----------|-------------|-------|---------|--------|",
    ])
    for (cat, sub) in result["unique_pairs"]:
        total = result["pairs_all"].get((cat, sub), 0)
        ma = result["pairs_morocco"].get((cat, sub), 0)
        gl = result["pairs_global"].get((cat, sub), 0)
        lines.append(f"| {cat} | {sub} | {total} | {ma} | {gl} |")

    report_path = out_dir / "jobs_analysis_report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {report_path}")

    print("\nDone. Summary:")
    print(f"  Morocco: {result['morocco_count']} jobs")
    print(f"  Global:  {result['global_count']} jobs")
    print(f"  Unique (category, subcategory) pairs: {len(result['unique_pairs'])}")
    print(f"  Categories with subcategories: {len(result['suggested_subcategories_by_category'])}")


if __name__ == "__main__":
    main()
