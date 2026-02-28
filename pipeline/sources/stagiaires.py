import uuid
import requests
from datetime import datetime, timezone
import time

def fetch_stagiaires(max_pages=5) -> list[dict]:
    """
    Fetches job listings from Stagiaires.ma using their internal public JSON API.
    This entirely bypasses the need for Playwright or HTML parsing, making it significantly faster and perfectly stable.
    """
    jobs = []
    print("Initializing API Fetcher for Stagiaires (Native JSON Mode)...")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.stagiaires.ma/stage-emploi-maroc"
    }
    
    limit = 20
    
    try:
        for page_num in range(1, max_pages + 1):
            offset = (page_num - 1) * limit
            url = f"https://api.stagiaires.ma/api/v1/public/annonces?limit={limit}&offset={offset}&statut=Valid%C3%A9e"
            
            print(f"Fetching Stagiaires API Page {page_num}...")
            
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code != 200:
                print(f"API Request failed with status {response.status_code}. Stopping pagination.")
                break
                
            data = response.json()
            items = data.get('data', [])
            
            if not items:
                print("No more job data returned from API.")
                break
                
            print(f"Found {len(items)} job entries natively on API page {page_num}.")
            
            from bs4 import BeautifulSoup

            for item in items:
                title = item.get('titre', 'Unknown Internship')
                
                # Extract remote status
                workspace_type = item.get('type_de_lieu_de_travail', '')
                is_remote = "Télétravail" in str(workspace_type) or "Hybride" in str(workspace_type)
                
                company_obj = item.get('entreprise', {})
                company = company_obj.get('nom', 'Unknown Company') if company_obj else 'Unknown Company'
                
                ville_obj = item.get('ville', {})
                location = ville_obj.get('nom', 'Morocco') if ville_obj else 'Morocco'
                
                # Extract and clean HTML Description
                raw_html_desc = item.get('description', '')
                clean_desc = BeautifulSoup(raw_html_desc, "html.parser").get_text(separator=' ', strip=True) if raw_html_desc else ''
                
                apply_url = item.get('lien_annonce')
                if not apply_url:
                    # Fallback URL generation if the API drops it somehow
                    apply_url = f"https://www.stagiaires.ma/stage-emploi-maroc/{item.get('id')}"
                
                jobs.append({
                    "title": title,
                    "company": company,
                    "location": location,
                    "is_remote": is_remote,
                    "type": "internship",
                    "description": clean_desc,
                    "apply_url": apply_url,
                    "source": "stagiaires",
                    "source_id": f"sta_{str(item.get('id', uuid.uuid4()))}", # Stable API ID!
                    "posted_at": datetime.now(timezone.utc).isoformat()
                })
            
            # Polite rate limiting
            time.sleep(1)
            
    except Exception as e:
        print(f"fetch_stagiaires crashed during API request: {e}")
        
    return jobs

if __name__ == "__main__":
    res = fetch_stagiaires(max_pages=2)
    print(f"Total jobs grabbed natively via API: {len(res)}")
    if res:
        print(res[0])
