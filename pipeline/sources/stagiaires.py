import uuid
import requests
from datetime import datetime, timezone
import time
import random
import re


def _parse_candidate_date(value) -> str | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    # Common numeric epoch formats
    if raw.isdigit():
        try:
            iv = int(raw)
            if iv > 1_000_000_000_000:  # ms
                return datetime.fromtimestamp(iv / 1000, tz=timezone.utc).isoformat()
            if iv > 1_000_000_000:  # s
                return datetime.fromtimestamp(iv, tz=timezone.utc).isoformat()
        except Exception:
            pass
    # dd/mm/yyyy or dd-mm-yyyy
    m = re.search(r"\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b", raw)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        try:
            return datetime(y, mo, d, tzinfo=timezone.utc).isoformat()
        except Exception:
            pass
    # ISO-style fallback
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).isoformat()
    except Exception:
        return None


def _extract_posted_at_from_item(item: dict) -> str | None:
    candidate_fields = [
        "date_publication", "published_at", "created_at", "date_creation",
        "datePublication", "publishedAt", "createdAt", "updated_at",
    ]
    for key in candidate_fields:
        if key in item:
            parsed = _parse_candidate_date(item.get(key))
            if parsed:
                return parsed
    return None


def _extract_experience_hint(item: dict, title: str, description: str) -> str | None:
    blob = f"{title} {description} {item.get('niveau_experience', '')}".lower()
    if any(k in blob for k in ("stagiaire", "stage", "intern", "pfe", "étudiant", "etudiant")):
        return "student"
    if any(k in blob for k in ("junior", "debutant", "débutant", "0-2", "1-2")):
        return "junior"
    if any(k in blob for k in ("senior", "lead", "principal", "manager", "5+", "6 ans", "7 ans")):
        return "senior"
    return None

MAX_PAGES = 20


def fetch_stagiaires(max_pages: int = MAX_PAGES) -> list[dict]:
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
    pages_scraped = 0
    posted_at_real_count = 0
    posted_at_fallback_count = 0
    
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
            pages_scraped += 1
                
            print(f"Found {len(items)} job entries natively on API page {page_num}.")
            
            from bs4 import BeautifulSoup

            for item in items:
                title = item.get('titre', 'Unknown Internship')
                
                # Extract remote status and remote_type
                workspace_type = str(item.get('type_de_lieu_de_travail', ''))
                is_remote = "Télétravail" in workspace_type or "Hybride" in workspace_type
                remote_type = None
                if "Télétravail" in workspace_type:
                    remote_type = "FULLY_REMOTE"
                elif "Hybride" in workspace_type:
                    remote_type = "HYBRID"
                
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

                posted_at = _extract_posted_at_from_item(item)
                if posted_at:
                    posted_at_real_count += 1
                else:
                    posted_at = datetime.now(timezone.utc).isoformat()
                    posted_at_fallback_count += 1

                contract_type = str(item.get("type_contrat") or item.get("type") or "").lower()
                if not contract_type:
                    contract_type = "internship"
                elif "stage" in contract_type:
                    contract_type = "internship"
                elif "freelance" in contract_type:
                    contract_type = "freelance"
                elif "cdd" in contract_type or "contract" in contract_type:
                    contract_type = "contract"
                elif "part" in contract_type:
                    contract_type = "part-time"
                else:
                    contract_type = "full-time"

                experience_hint = _extract_experience_hint(item, title, clean_desc)
                
                job_entry = {
                    "title": title,
                    "company": company,
                    "location": location,
                    "is_remote": is_remote,
                    "type": contract_type,
                    "description": clean_desc,
                    "apply_url": apply_url,
                    "source": "stagiaires",
                    "source_id": f"sta_{str(item.get('id', uuid.uuid4()))}",  # Stable API ID!
                    "posted_at": posted_at
                }
                if remote_type:
                    job_entry["remote_type"] = remote_type
                if experience_hint:
                    job_entry["experience_level_hint"] = experience_hint
                jobs.append(job_entry)
            
            # Polite rate limiting
            time.sleep(random.uniform(1, 2))
            
    except Exception as e:
        print(f"fetch_stagiaires crashed during API request: {e}")
    print(
        f"[stagiaires] Scraped {pages_scraped} pages, found {len(jobs)} jobs, "
        f"real_posted_at={posted_at_real_count}, fallback_posted_at={posted_at_fallback_count}"
    )
        
    return jobs

if __name__ == "__main__":
    res = fetch_stagiaires(max_pages=2)
    print(f"Total jobs grabbed natively via API: {len(res)}")
    if res:
        print(res[0])
