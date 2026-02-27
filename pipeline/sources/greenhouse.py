import requests
from datetime import datetime

COMPANIES = [
    "stripe", "openai", "anthropic", "doordash", "airbnb", 
    "instacart", "pinterest", "dropbox", "box", "discord",
    "figma", "notion", "gitlab", "hashicorp", "twitch",
    "webflow", "vimeo", "plaid", "brex", "retool",
    "datadog", "peloton", "flexport", "coinbase", "kraken"
]

def fetch_greenhouse() -> list[dict]:
    jobs = []
    print(f"Fetching Greenhouse for {len(COMPANIES)} companies...")
    for company in COMPANIES:
        try:
            url = f"https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true"
            response = requests.get(url, timeout=10)
            if response.status_code != 200:
                continue
                
            data = response.json()
            board_name = data.get("name", company)
            
            for j in data.get("jobs", []):
                title = j.get("title", "")
                if not any(k in title.lower() for k in ["engineer", "developer", "data", "product", "design", "manager"]):
                    continue
                    
                loc_name = j.get("location", {}).get("name", "")
                jobs.append({
                    "title": title,
                    "company": board_name,
                    "location": loc_name,
                    "is_remote": "remote" in loc_name.lower() or "anywhere" in loc_name.lower(),
                    "description": j.get("content", ""),
                    "apply_url": j.get("absolute_url", ""),
                    "source": "greenhouse",
                    "source_id": f"gh_{j.get('id')}",
                    "posted_at": j.get("updated_at", datetime.utcnow().isoformat())
                })
        except Exception as e:
            # Silently skip
            pass
            
    return jobs
