import os
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# RapidAPI free tier: 200 requests/month.
# Pipeline runs every 12 h → 2 runs/day × 30 days = 60 runs/month.
# With QUERIES_PER_RUN = 2 that's 120 requests/month — safely under the limit.
# Do NOT increase QUERIES_PER_RUN above 3 without upgrading the RapidAPI plan.
QUERIES_PER_RUN = 2
QUERIES = [
    "Software Engineer",
    "Data Scientist",
    "Product Manager",
]


def fetch_jsearch() -> list[dict]:
    api_key = os.getenv("JSEARCH_API_KEY")
    if not api_key:
        print("[jsearch] API key missing — set JSEARCH_API_KEY in .env")
        return []

    url = "https://jsearch.p.rapidapi.com/search"
    headers = {
        "X-RapidAPI-Key": api_key,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }

    jobs = []
    queries_to_run = QUERIES[:QUERIES_PER_RUN]
    print(f"[jsearch] Running {len(queries_to_run)} queries (rate-limit budget: {QUERIES_PER_RUN}/run).")

    for q in queries_to_run:
        querystring = {
                "query": q,
                "page": "1",
                "num_pages": "1",
                "date_posted": "week",
                "employment_types": "FULLTIME,CONTRACTOR",
                "work_from_home": "true",
            }
        try:
            response = requests.get(url, headers=headers, params=querystring, timeout=15)
            if response.status_code == 429:
                print("[jsearch] Rate limit hit (429) — monthly quota exhausted. Stopping.")
                break
            if response.status_code == 403:
                print("[jsearch] 403 Forbidden — API key invalid or quota exhausted. Stopping.")
                break
            response.raise_for_status()
            data = response.json()

            for j in data.get('data', []):
                raw_posted = j.get('job_posted_at_datetime_utc')
                posted_at = raw_posted if raw_posted else datetime.utcnow().isoformat()

                job_city = j.get('job_city')
                job_country = j.get('job_country')
                api_skills = j.get('job_required_skills') or []
                job_entry = {
                    "title": j.get('job_title', 'Unknown Title'),
                    "company": j.get('employer_name', 'Unknown Company'),
                    "company_logo_url": j.get('employer_logo', ''),
                    "location": f"{job_city or ''}, {job_country or ''}".strip(', '),
                    "is_remote": j.get('job_is_remote', True),
                    "type": j.get('job_employment_type', 'fulltime').lower(),
                    "description": j.get('job_description', ''),
                    "apply_url": j.get('job_apply_link', ''),
                    "source": "jsearch",
                    "source_id": f"jsearch_{j.get('job_id')}",
                    "posted_at": posted_at,
                    "skills_hint": api_skills,
                }
                if job_city:
                    job_entry["city"] = job_city
                if job_country:
                    job_entry["country_code"] = job_country
                jobs.append(job_entry)

        except Exception as e:
            print(f"[jsearch] Query '{q}' failed: {e}")

    print(f"[jsearch] Fetched {len(jobs)} jobs total.")
    return jobs
