import requests
from datetime import datetime

COMPANIES = [
    "netflix", "lyft", "fivetran", "yelp", "reddit", 
    "canva", "auth0", "affirm", "wix", "coursera"
]

def fetch_lever() -> list[dict]:
    jobs = []
    print(f"Fetching Lever for {len(COMPANIES)} companies...")
    for company in COMPANIES:
        try:
            url = f"https://api.lever.co/v0/postings/{company}"
            response = requests.get(url, timeout=10)
            if response.status_code != 200:
                continue
                
            data = response.json()
            for j in data:
                title = j.get("text", "")
                
                desc = j.get("descriptionPlain", "") or j.get("description", "")
                cat = j.get("categories", {})
                loc = cat.get("location", "Unknown Location")
                dept = cat.get("department", "")
                
                if not any(k in dept.lower() or k in title.lower() for k in ["engineer", "developer", "data", "product", "design"]):
                    continue
                    
                raw_posted_at = j.get("createdAt", "")
                try:
                    posted_at = datetime.fromtimestamp(int(raw_posted_at)/1000).isoformat()
                except:
                    posted_at = datetime.utcnow().isoformat()
                    
                jobs.append({
                    "title": title,
                    "company": company.capitalize(),
                    "location": loc,
                    "is_remote": "remote" in loc.lower(),
                    "description": desc,
                    "apply_url": j.get("hostedUrl", ""),
                    "source": "lever",
                    "source_id": f"lev_{j.get('id')}",
                    "posted_at": posted_at
                })
        except Exception as e:
            pass
            
    return jobs
