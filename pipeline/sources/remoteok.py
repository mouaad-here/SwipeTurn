"""
RemoteOK API - Free public remote jobs. No auth required.
API: https://remoteok.com/api
Attribution: Link back to Remote OK and mention as source required.
"""
import requests
from datetime import datetime


def fetch_remoteok() -> list[dict]:
    """Fetch remote jobs from RemoteOK API. All jobs are remote (Morocco-applicable)."""
    try:
        url = "https://remoteok.com/api"
        headers = {"User-Agent": "SwipeTurn/1.0 (https://swipeturn.com; jobs for Moroccans)"}
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()

        jobs = []
        # First element can be metadata; rest are job objects
        items = data if isinstance(data, list) else []
        for j in items:
            if not isinstance(j, dict):
                continue
            # Skip metadata object (has 'legal' key, no 'position')
            if "legal" in j or not j.get("position"):
                continue

            apply_url = j.get("apply_url") or j.get("url") or ""
            if not apply_url or not str(apply_url).startswith("http"):
                continue

            company = j.get("company") or "Unknown Company"
            if not company or not str(company).strip():
                company = "Unknown Company"

            tags = j.get("tags") or []
            if isinstance(tags, list):
                required_skills = [str(t).lower() for t in tags if t]
            else:
                required_skills = []

            pub_date = j.get("date") or ""
            if pub_date and "T" in str(pub_date):
                pub_date = pub_date.replace("Z", "+00:00")
            elif not pub_date:
                pub_date = datetime.utcnow().isoformat()

            jobs.append({
                "title": j.get("position", "Unknown Title"),
                "company": company,
                "company_logo_url": j.get("company_logo") or j.get("logo") or "",
                "location": j.get("location") or "Remote",
                "is_remote": True,
                "type": "full-time",
                "description": j.get("description", ""),
                "required_skills": required_skills,
                "apply_url": apply_url,
                "source": "remoteok",
                "source_id": f"remoteok_{j.get('id', j.get('slug', ''))}",
                "posted_at": pub_date,
            })

        return jobs
    except Exception as e:
        print(f"fetch_remoteok failed: {e}")
        return []


if __name__ == "__main__":
    res = fetch_remoteok()
    print(f"Fetched {len(res)} jobs from RemoteOK")
    if res:
        print(res[0])
