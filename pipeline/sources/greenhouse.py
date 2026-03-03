import requests
from datetime import datetime

# Verified active Greenhouse boards (tested 2026-03-03; dead boards removed).
# To re-verify: GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
COMPANIES = [
    "stripe",     # 584 jobs
    "anthropic",  # 451 jobs
    "airbnb",     # 246 jobs
    "datadog",    # 449 jobs
    "brex",       # 240 jobs
    "flexport",   # 168 jobs
    "instacart",  # 154 jobs
    "dropbox",    # 147 jobs
    "figma",      # 174 jobs
    "gitlab",     # 158 jobs
    "pinterest",  # 119 jobs
    "discord",    #  78 jobs
    "twitch",     #  65 jobs
    "webflow",    #  55 jobs
    "peloton",    #  41 jobs
]

TITLE_KEYWORDS = [
    "engineer", "developer", "data", "product", "design", "manager",
    "analyst", "scientist", "architect", "devops", "backend", "frontend",
    "fullstack", "full-stack", "ml", "ai",
]

# Per-job metadata fetch (_fetch_job_metadata) was removed because it made
# one extra HTTP request + 0.3 s sleep for every job, adding minutes of
# latency per run.  Level/seniority is inferred downstream by
# categorize_experience_strict() from the title and description instead.


def fetch_greenhouse() -> list[dict]:
    jobs = []
    print(f"Fetching Greenhouse for {len(COMPANIES)} companies...")
    for company in COMPANIES:
        try:
            url = f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true"
            response = requests.get(url, timeout=10)
            if response.status_code != 200:
                print(f"  [greenhouse] {company} -> HTTP {response.status_code}, skipping.")
                continue

            data = response.json()
            board_name = data.get("name", company)
            company_jobs = data.get("jobs", [])
            added = 0

            for j in company_jobs:
                title = j.get("title", "")
                if not any(k in title.lower() for k in TITLE_KEYWORDS):
                    continue

                loc_name = j.get("location", {}).get("name", "") or ""
                job_id = j.get("id")

                jobs.append({
                    "title": title,
                    "company": board_name,
                    "location": loc_name,
                    "is_remote": "remote" in loc_name.lower() or "anywhere" in loc_name.lower(),
                    "description": j.get("content", ""),
                    "apply_url": j.get("absolute_url", ""),
                    "source": "greenhouse",
                    "source_id": f"gh_{job_id}",
                    "posted_at": j.get("updated_at", datetime.utcnow().isoformat()),
                })
                added += 1

            print(f"  [greenhouse] {company}: {added}/{len(company_jobs)} jobs matched filter.")
        except Exception as e:
            print(f"  [greenhouse] {company} error: {e}")

    return jobs
