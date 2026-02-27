import os
import requests
from dotenv import load_dotenv

load_dotenv()

def fetch_adzuna() -> list[dict]:
    app_id = os.getenv("ADZUNA_APP_ID")
    app_key = os.getenv("ADZUNA_APP_KEY")
    
    if not app_id or not app_key:
        print("Adzuna credentials missing.")
        return []
        
    jobs = []
    # Test 2 countries with reasonable pages
    configs = [
        {"country": "fr", "category": "it-jobs"},
        {"country": "gb", "category": "it-jobs"},
    ]
    
    try:
        for cfg in configs:
            url = f"https://api.adzuna.com/v1/api/jobs/{cfg['country']}/search/1"
            params = {
                "app_id": app_id,
                "app_key": app_key,
                "results_per_page": 50,
                "category": cfg['category']
            }
            
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            for j in data.get('results', []):
                company = j.get('company', {}).get('display_name', 'Unknown')
                loc = ', '.join(j.get('location', {}).get('area', []))
                
                jobs.append({
                    "title": j.get('title', 'Unknown Title'),
                    "company": company,
                    "location": loc,
                    "is_remote": "remote" in loc.lower() or "remote" in j.get('title', '').lower(),
                    "description": j.get('description', ''),
                    "apply_url": j.get('redirect_url', ''),
                    "source": "adzuna",
                    "source_id": f"adzuna_{j.get('id')}",
                    "posted_at": j.get('created', '').replace('T', ' ').replace('Z', '')
                })
                
        return jobs
    except Exception as e:
        print(f"fetch_adzuna failed: {e}")
        return jobs
