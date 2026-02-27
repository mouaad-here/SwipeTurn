import requests
from datetime import datetime

def fetch_remotive() -> list[dict]:
    try:
        url = "https://remotive.com/api/remote-jobs?limit=100"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        jobs = []
        for j in data.get('jobs', []):
            pub_date = j.get("publication_date")
            if pub_date:
                # simplify to iso
                pub_date = pub_date.replace("T", " ")
                
            jobs.append({
                "title": j.get("title", "Unknown Title"),
                "company": j.get("company_name", "Unknown Company"),
                "company_logo_url": j.get("company_logo", ""),
                "location": j.get("candidate_required_location", "Remote"),
                "is_remote": True,
                "type": j.get("job_type", "full-time").lower(),
                "description": j.get("description", ""),
                "required_skills": [t.lower() for t in j.get("tags", [])],
                "apply_url": j.get("url", ""),
                "source": "remotive",
                "source_id": f"remotive_{j.get('id')}",
                "posted_at": pub_date
            })
            
        return jobs
    except Exception as e:
        print(f"fetch_remotive failed: {e}")
        return []
