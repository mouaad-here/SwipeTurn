import uuid
import requests
from datetime import datetime, timezone, timedelta
import time
import random
import re

# Only keep jobs posted within this many days (feed freshness).
MAX_AGE_DAYS = 14
# Safety cap when using dynamic pagination.
MAX_JOBS_CAP = 5000


def _parse_relative_date_fr(text: str) -> str | None:
    """Parse French relative date strings like 'Il y a 4 heures', 'Il y a 2 jours', 'Il y a 1 mois'."""
    if not text or not isinstance(text, str):
        return None
    txt = text.strip().lower()
    now = datetime.now(timezone.utc)
    # Il y a X heure(s)
    m = re.search(r"il y a\s+(\d+)\s*heures?", txt)
    if m:
        return (now - timedelta(hours=int(m.group(1)))).isoformat()
    # Il y a X jour(s)
    m = re.search(r"il y a\s+(\d+)\s*jours?", txt)
    if m:
        return (now - timedelta(days=int(m.group(1)))).isoformat()
    # Il y a X mois
    m = re.search(r"il y a\s+(\d+)\s*mois", txt)
    if m:
        return (now - timedelta(days=int(m.group(1)) * 30)).isoformat()
    return None


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
            val = item.get(key)
            parsed = _parse_candidate_date(val)
            if parsed:
                return parsed
            if isinstance(val, str):
                rel = _parse_relative_date_fr(val)
                if rel:
                    return rel
    # Scan string values in item for "il y a X heures/jours/mois"
    for key, val in item.items():
        if isinstance(val, str) and "il y a" in val.lower():
            rel = _parse_relative_date_fr(val)
            if rel:
                return rel
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

def fetch_stagiaires(max_pages: int | None = None) -> list[dict]:
    """
    Fetches job listings from Stagiaires.ma using their internal public JSON API.
    Uses dynamic pagination: fetches until API returns no more data or total is reached (cap at MAX_JOBS_CAP).
    Jobs older than MAX_AGE_DAYS are excluded.
    """
    jobs: list[dict] = []
    print("Initializing API Fetcher for Stagiaires (Native JSON Mode, dynamic pagination)...")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.stagiaires.ma/stage-emploi-maroc"
    }

    limit = 20
    pages_scraped = 0
    posted_at_real_count = 0
    posted_at_fallback_count = 0
    page_num = 1
    total_from_api: int | None = None

    try:
        from bs4 import BeautifulSoup

        while True:
            if max_pages is not None and page_num > max_pages:
                break
            if len(jobs) >= MAX_JOBS_CAP:
                print(f"Reached cap of {MAX_JOBS_CAP} jobs. Stopping.")
                break

            offset = (page_num - 1) * limit
            url = f"https://api.stagiaires.ma/api/v1/public/annonces?limit={limit}&offset={offset}&statut=Valid%C3%A9e"

            print(f"Fetching Stagiaires API Page {page_num}...")

            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code != 200:
                print(f"API Request failed with status {response.status_code}. Stopping pagination.")
                break

            data = response.json()
            items = data.get('data', [])

            if total_from_api is None:
                total_from_api = data.get('total') or data.get('totalCount')
                if isinstance(total_from_api, dict):
                    total_from_api = total_from_api.get('total') or total_from_api.get('totalCount')
                if total_from_api is not None:
                    try:
                        total_from_api = int(total_from_api)
                    except (TypeError, ValueError):
                        total_from_api = None

            if not items:
                print("No more job data returned from API.")
                break
            pages_scraped += 1

            print(f"Found {len(items)} job entries natively on API page {page_num}.")

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
                
                company_obj = item.get('entreprise', {}) or {}
                company = company_obj.get('nom', 'Unknown Company')
                logo_url = (
                    company_obj.get('logo_url') or company_obj.get('logo') or company_obj.get('image')
                    or (company_obj.get('url_logo') if isinstance(company_obj.get('url_logo'), str) else None)
                )
                if logo_url and not str(logo_url).startswith('http'):
                    logo_url = 'https://www.stagiaires.ma' + str(logo_url).lstrip('/') if logo_url else None

                ville_obj = item.get('ville', {}) or {}
                location = ville_obj.get('nom', 'Morocco')
                city = ville_obj.get('nom') if ville_obj else None
                
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
                    "source_id": f"sta_{str(item.get('id', uuid.uuid4()))}",
                    "posted_at": posted_at,
                    "job_region": "MA",
                    "country_code": "MA",
                }
                if logo_url:
                    job_entry["company_logo_url"] = logo_url
                if city:
                    job_entry["city"] = city
                if remote_type:
                    job_entry["remote_type"] = remote_type
                if experience_hint:
                    job_entry["experience_level_hint"] = experience_hint
                jobs.append(job_entry)

            if total_from_api is not None and len(jobs) >= total_from_api:
                print(f"Fetched all {total_from_api} jobs from API.")
                break

            page_num += 1
            time.sleep(random.uniform(1, 2))

    except Exception as e:
        print(f"fetch_stagiaires crashed during API request: {e}")

    # Max age filter: keep only jobs posted within MAX_AGE_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)
    filtered = []
    for j in jobs:
        try:
            pt = j.get("posted_at")
            if pt:
                if isinstance(pt, str):
                    dt = datetime.fromisoformat(pt.replace("Z", "+00:00"))
                else:
                    dt = pt
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                if dt >= cutoff:
                    filtered.append(j)
            else:
                filtered.append(j)
        except Exception:
            filtered.append(j)
    dropped = len(jobs) - len(filtered)
    if dropped:
        print(f"[stagiaires] Dropped {dropped} jobs older than {MAX_AGE_DAYS} days.")

    print(
        f"[stagiaires] Scraped {pages_scraped} pages, found {len(filtered)} jobs (after {MAX_AGE_DAYS}-day filter), "
        f"real_posted_at={posted_at_real_count}, fallback_posted_at={posted_at_fallback_count}"
    )
    return filtered

if __name__ == "__main__":
    res = fetch_stagiaires(max_pages=2)
    print(f"Total jobs grabbed natively via API: {len(res)}")
    if res:
        print(res[0])
