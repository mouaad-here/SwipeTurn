"""
Jobicy API - Free remote jobs. No auth required.
API: https://jobicy.com/api/v2/remote-jobs
Attribution: Link back to Jobicy.com required.
"""
import requests
from datetime import datetime


def fetch_jobicy(count: int = 80) -> list[dict]:
    """Fetch remote jobs from Jobicy API. All jobs are remote (Morocco-applicable)."""
    try:
        url = "https://jobicy.com/api/v2/remote-jobs"
        params = {"count": min(count, 100)}
        response = requests.get(url, params=params, timeout=15)
        response.raise_for_status()
        data = response.json()

        jobs = []
        raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []
        if not raw_jobs and isinstance(data, list):
            raw_jobs = [j for j in data if isinstance(j, dict) and j.get("jobTitle")]

        for j in raw_jobs:
            apply_url = j.get("url") or ""
            if not apply_url or not apply_url.startswith("http"):
                continue

            job_type = j.get("jobType") or ["Full-Time"]
            job_type_str = job_type[0] if isinstance(job_type, list) else str(job_type)
            job_geo = j.get("jobGeo") or "Worldwide"
            location = str(job_geo) if job_geo else "Remote"

            jobs.append({
                "title": j.get("jobTitle", "Unknown Title"),
                "company": j.get("companyName", "Unknown Company"),
                "company_logo_url": j.get("companyLogo") or "",
                "location": location,
                "is_remote": True,
                "type": job_type_str.lower().replace(" ", "-") if job_type_str else "full-time",
                "description": j.get("jobDescription") or j.get("jobExcerpt") or "",
                "apply_url": apply_url,
                "source": "jobicy",
                "source_id": f"jobicy_{j.get('id', j.get('jobSlug', ''))}",
                "posted_at": j.get("pubDate") or datetime.utcnow().isoformat(),
            })

        return jobs
    except Exception as e:
        print(f"fetch_jobicy failed: {e}")
        return []


if __name__ == "__main__":
    res = fetch_jobicy(count=10)
    print(f"Fetched {len(res)} jobs from Jobicy")
    if res:
        print(res[0])
