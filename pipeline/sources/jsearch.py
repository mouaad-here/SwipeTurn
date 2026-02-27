import os
import requests
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

def fetch_jsearch() -> list[dict]:
    api_key = os.getenv("JSEARCH_API_KEY")
    if not api_key:
        print("JSearch API Key missing.")
        return []
        
    url = "https://jsearch.p.rapidapi.com/search"
    headers = {
        "X-RapidAPI-Key": api_key,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com"
    }
    
    jobs = []
    queries = ["Software Engineer", "Data Analyst", "Product Manager"]
    
    for q in queries:
        querystring = {"query": f"{q} remote", "page": "1", "num_pages": "1"}
        try:
            response = requests.get(url, headers=headers, params=querystring, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            for j in data.get('data', []):
                raw_posted = j.get('job_posted_at_datetime_utc')
                posted_at = raw_posted if raw_posted else datetime.utcnow().isoformat()
                
                jobs.append({
                    "title": j.get('job_title', 'Unknown Title'),
                    "company": j.get('employer_name', 'Unknown Company'),
                    "company_logo_url": j.get('employer_logo', ''),
                    "location": f"{j.get('job_city', '')}, {j.get('job_country', '')}".strip(', '),
                    "is_remote": j.get('job_is_remote', False),
                    "type": j.get('job_employment_type', 'fulltime').lower(),
                    "description": j.get('job_description', ''),
                    "apply_url": j.get('job_apply_link', ''),
                    "source": "jsearch",
                    "source_id": f"jsearch_{j.get('job_id')}",
                    "posted_at": posted_at
                })
        except Exception as e:
            print(f"fetch_jsearch failed for {q}: {e}")
            
    return jobs
