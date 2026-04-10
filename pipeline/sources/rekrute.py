import hashlib
import json
import re
import time
import random
import requests
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from typing import Any


def _extract_desc_snippet(card, title: str) -> str:
    """Extract description snippet from list card."""
    for sel in ["p", ".description", ".desc", "[class*='desc']", ".post-content"]:
        if sel.startswith(".") or sel.startswith("["):
            elem = card.select_one(sel)
        else:
            elem = card.find(sel)
        if elem:
            t = elem.get_text(separator=" ", strip=True)
            if t and t != title and len(t) > 30:
                return t
    full = card.get_text(separator=" ", strip=True)
    if full and title in full:
        rest = full.replace(title, "").strip()
        if len(rest) > 50:
            return rest[:2000]
    return ""


def _normalize_rekrute_url(href: str) -> str:
    """Turn relative or absolute Rekrute href into full URL."""
    if not href or href.startswith("#") or "javascript" in href.lower():
        return ""
    if href.startswith(("http://", "https://")):
        return href
    return "https://www.rekrute.com" + (href if href.startswith("/") else "/" + href)


def _extract_job_link_from_card(card) -> str:
    """Get job detail URL from card: prefer h2 > a, then any job-like link in the card."""
    title_elem = card.find("h2")
    if title_elem:
        a = title_elem.find("a")
        if a and a.get("href"):
            href = (a["href"] or "").strip()
            if href:
                url = _normalize_rekrute_url(href)
                if url:
                    return url
    for a in card.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href:
            continue
        # Job pages: /offre-..., ...-emploi-..., or *.html
        if "/offre-" in href or "-emploi-" in href or (href.endswith(".html") and len(href) > 10):
            url = _normalize_rekrute_url(href)
            if url:
                return url
    return ""


def _extract_company_from_card(card, link: str) -> str:
    """Fallback: extract company from card text or URL."""
    text = card.get_text()
    for pattern in [
        r"([A-Z][A-Za-z0-9\s&\-'\.]+)\s+recrute",   # "ALTEN Maroc recrute"
        r"([A-Z][A-Za-z0-9\s&\-'\.]+)\s+recherche",
        r"recrutement\s+([a-z0-9\-]+)\-",            # "recrutement-alten-maroc"
    ]:
        m = re.search(pattern, text, re.I)
        if m:
            name = m.group(1).strip().replace("-", " ").title()
            if 2 < len(name) < 80 and "maroc" not in name.lower() and "confidentiel" not in name.lower():
                return name
    if link:
        slug = (link.rstrip("/").split("/")[-1] or "").replace(".html", "")
        if "recrutement-" in slug:
            idx = slug.find("recrutement-") + len("recrutement-")
            rest = slug[idx:]
            parts = rest.replace("-", " ").split()
            out = []
            for p in parts:
                if p.lower() in ("maroc", "rabat", "casablanca", "tanger", "agadir", "marrakech", "confidentiel"):
                    break
                out.append(p.title())
            if out:
                return " ".join(out)
    return ""


def _parse_json_ld_job_posting(soup: BeautifulSoup) -> dict[str, Any]:
    """Extract JobPosting from application/ld+json. Returns dict with datePosted, experienceRequirements, employmentType, industry, addressLocality, validThrough."""
    out: dict[str, Any] = {}
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            raw = script.string
            if not raw:
                continue
            data = json.loads(raw)
            if isinstance(data, dict) and data.get("@type") == "JobPosting":
                out["datePosted"] = data.get("datePosted")
                out["experienceRequirements"] = data.get("experienceRequirements")
                out["employmentType"] = data.get("employmentType")
                out["industry"] = data.get("industry")
                job_loc = data.get("jobLocation") or {}
                addr = job_loc.get("address") if isinstance(job_loc, dict) else {}
                if isinstance(addr, dict):
                    out["addressLocality"] = addr.get("addressLocality")
                out["validThrough"] = data.get("validThrough")
                break
            if isinstance(data, dict) and "@graph" in data:
                for node in data.get("@graph", []):
                    if isinstance(node, dict) and node.get("@type") == "JobPosting":
                        out["datePosted"] = node.get("datePosted")
                        out["experienceRequirements"] = node.get("experienceRequirements")
                        out["employmentType"] = node.get("employmentType")
                        out["industry"] = node.get("industry")
                        job_loc = node.get("jobLocation") or {}
                        addr = job_loc.get("address") if isinstance(job_loc, dict) else {}
                        if isinstance(addr, dict):
                            out["addressLocality"] = addr.get("addressLocality")
                        out["validThrough"] = node.get("validThrough")
                        break
                if out:
                    break
        except (json.JSONDecodeError, TypeError):
            continue
    return out


def _extract_h2_sections(soup: BeautifulSoup) -> dict[str, str]:
    """Extract sections by h2 heading (Entreprise, Culture, Poste, Profil recherché, Adresse, Traits). Exclude #matching4K and content containing 4K."""
    sections: dict[str, str] = {}
    # Remove 4K block so it's not included when we walk siblings
    for bad in soup.select("#matching4K"):
        bad.decompose()
    for h2 in soup.find_all("h2"):
        title = (h2.get_text(strip=True) or "").strip()
        if not title:
            continue
        # Collect text from following siblings until next h2
        parts = []
        for sib in h2.find_next_siblings():
            if sib.name == "h2":
                break
            text = sib.get_text(separator=" ", strip=True) if hasattr(sib, "get_text") else ""
            if text and "4K" not in text[:100]:
                parts.append(text)
        if parts:
            combined = " ".join(parts).strip()
            if len(combined) > 20:
                sections[title] = combined
    return sections


def _parse_rekrute_detail_page(html: str, apply_url: str) -> dict[str, Any]:
    """
    Parse Rekrute job detail page: JSON-LD + h2 sections.
    Returns dict with: description, city, type, is_remote, posted_at, experience_level_hint (optional).
    """
    result: dict[str, Any] = {}
    try:
        soup = BeautifulSoup(html, "html.parser")

        # 1. JSON-LD
        ld = _parse_json_ld_job_posting(soup)
        if ld.get("datePosted"):
            dp = ld["datePosted"]
            if isinstance(dp, str) and re.match(r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}", dp):
                try:
                    result["posted_at"] = datetime.strptime(dp, "%Y-%m-%d %H:%M:%S").isoformat()
                except ValueError:
                    result["posted_at"] = dp
            else:
                result["posted_at"] = dp
        if ld.get("addressLocality"):
            result["city"] = ld["addressLocality"]
        emp_type = (ld.get("employmentType") or "").strip().upper()
        if emp_type:
            result["type"] = "full-time" if emp_type == "CDI" else "contract" if emp_type == "CDD" else "full-time"
        exp_req = ld.get("experienceRequirements") or ""
        if exp_req and isinstance(exp_req, str):
            result["experience_level_hint"] = _experience_from_rekrute_text(exp_req)

        # 2. H2 sections
        sec = _extract_h2_sections(soup)
        poste = sec.get("Poste :") or ""
        profil = sec.get("Profil recherché :") or ""
        entreprise = sec.get("Entreprise :") or ""
        culture = sec.get("Culture de l'entreprise :") or ""
        adresse = sec.get("Adresse de notre siège :") or ""
        if adresse and not result.get("city"):
            result["city"] = adresse.split()[-1] if adresse.split() else None
        desc_parts = [p for p in [poste, profil, entreprise, culture] if p]
        result["description"] = "\n\n".join(desc_parts) if desc_parts else ""

        # 3. Télétravail from page (fallback if not in JSON-LD)
        page_text = soup.get_text()
        if "télétravail" in page_text.lower():
            result["is_remote"] = "télétravail : oui" in page_text.lower() or "télétravail: oui" in page_text.lower()
        if "is_remote" not in result:
            result["is_remote"] = False

        # 4. Posted date from .newjob if not from JSON-LD
        if "posted_at" not in result:
            span = soup.select_one(".newjob")
            if span:
                txt = span.get_text(separator=" ", strip=True)
                result["posted_at"] = _parse_relative_date(txt) or _parse_absolute_date(txt)
    except Exception:
        pass
    return result


def _experience_from_rekrute_text(text: str) -> str | None:
    """Map Rekrute experienceRequirements string to student/junior/mid/senior."""
    t = (text or "").lower()
    if any(k in t for k in ("stagiaire", "stage", "intern", "pfe", "étudiant", "etudiant")):
        return "student"
    if any(k in t for k in ("junior", "débutant", "debutant", "0-2", "1-2")):
        return "junior"
    if any(k in t for k in ("intermédiaire", "intermediaire", "3 à 5", "3-5")):
        return "mid"
    if any(k in t for k in ("senior", "lead", "principal", "manager", "5+", "6 ans", "7 ans")):
        return "senior"
    return None


def _fetch_job_description(apply_url: str, timeout: int = 10) -> str:
    """Fetch full job description from the job detail page (legacy: returns plain string)."""
    detail = _fetch_job_detail_structured(apply_url, timeout)
    return detail.get("description", "")


def _fetch_job_detail_structured(apply_url: str, timeout: int = 10) -> dict[str, Any]:
    """Fetch job detail page and return structured data (description, city, type, is_remote, posted_at, experience_level_hint)."""
    if not apply_url or not apply_url.startswith("http"):
        return {}
    try:
        r = requests.get(
            apply_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=timeout,
        )
        r.raise_for_status()
        return _parse_rekrute_detail_page(r.text, apply_url)
    except Exception:
        return {}


def _parse_relative_date(text: str) -> str | None:
    txt = (text or "").lower()
    now = datetime.utcnow()
    if "aujourd" in txt or "today" in txt:
        return now.isoformat()
    if "hier" in txt or "yesterday" in txt:
        return (now - timedelta(days=1)).isoformat()
    m_hours = re.search(r"il y a\s+(\d+)\s*h", txt)
    if m_hours:
        return (now - timedelta(hours=int(m_hours.group(1)))).isoformat()
    m_days = re.search(r"il y a\s+(\d+)\s+jour", txt)
    if m_days:
        return (now - timedelta(days=int(m_days.group(1)))).isoformat()
    return None


def _parse_absolute_date(text: str) -> str | None:
    m = re.search(r"\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b", text or "")
    if not m:
        return None
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if year < 100:
        year += 2000
    try:
        return datetime(year, month, day).isoformat()
    except Exception:
        return None


def _extract_posted_at(card_text: str) -> str | None:
    abs_date = _parse_absolute_date(card_text)
    if abs_date:
        return abs_date
    rel_date = _parse_relative_date(card_text)
    if rel_date:
        return rel_date
    return None


def _extract_contract_type(text: str) -> str:
    t = (text or "").lower()
    if "stage" in t or "pfe" in t or "intern" in t:
        return "internship"
    if "cdi" in t:
        return "full-time"
    if "cdd" in t:
        return "contract"
    if "freelance" in t:
        return "freelance"
    if "part-time" in t or "temps partiel" in t:
        return "part-time"
    return "full-time"


def _extract_experience_hint(text: str, title: str) -> str | None:
    blob = f"{title} {text}".lower()
    if any(k in blob for k in ("stagiaire", "stage", "intern", "pfe", "étudiant", "etudiant")):
        return "student"
    if any(k in blob for k in ("junior", "debutant", "débutant", "0-2", "1-2")):
        return "junior"
    if any(k in blob for k in ("senior", "lead", "principal", "manager", "5+", "6 ans", "7 ans")):
        return "senior"
    return None


MAX_PAGES_DEFAULT = 20


def fetch_rekrute(max_pages: int = MAX_PAGES_DEFAULT, fetch_full_descriptions: bool = True) -> list[dict]:
    """
    Fetch jobs from Rekrute using plain HTTP (requests) for listing pages.
    Discovers total pages from pagination links in raw HTML to avoid hardcoded limits.
    """
    jobs = []
    pages_scraped = 0
    posted_at_real_count = 0
    posted_at_fallback_count = 0
    
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
        "Referer": "https://www.rekrute.com/",
    })

    print("Fetching Rekrute listings via HTTP...")
    
    # Attempt to find last page from Page 1 first
    total_pages = max_pages
    try:
        first_page_url = "https://www.rekrute.com/offres.html?postuler=1&page=1"
        r = session.get(first_page_url, timeout=15)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            pagination = soup.select(".pagination")
            if pagination:
                links = pagination[0].find_all("a")
                if links:
                    # Look for the last numeric link or 'Suivant' neighbor
                    # Rekrute pagination usually has '1 2 3 ... 145 Suivant'
                    # The second to last link often has the max page number if Suivant is present.
                    potential_pages = []
                    for link in links:
                        try:
                            val = link.text.strip()
                            if val.isdigit():
                                potential_pages.append(int(val))
                        except ValueError:
                            continue
                    if potential_pages:
                        total_pages = min(max(potential_pages), 100) # Safety cap at 100 pages for a single run
                        print(f"Dynamic pagination discovery: {total_pages} total pages found.")
    except Exception as e:
        print(f"Failed to discover pagination dynamically: {e}. Falling back to max_pages={max_pages}")

    try:
        for page_num in range(1, total_pages + 1):
            url = f"https://www.rekrute.com/offres.html?postuler=1&page={page_num}"
            print(f"Fetching Rekrute Page {page_num}...")
            
            try:
                resp = session.get(url, timeout=15)
                if resp.status_code != 200:
                    print(f"Skipping page {page_num} due to status {resp.status_code}.")
                    break
                
                if "captcha" in resp.text.lower() or "challenge" in resp.text.lower():
                    print(f"Anti-bot detected on page {page_num}. Terminating run.")
                    break

                soup = BeautifulSoup(resp.text, 'html.parser')
                job_cards = soup.find_all('li', class_='post-id')
                
                if not job_cards:
                    print(f"No more job cards found at page {page_num}.")
                    break
                    
                pages_scraped += 1
                print(f"Found {len(job_cards)} job cards on page {page_num}.")
                
                for card in job_cards:
                    title_elem = card.find('h2')
                    if not title_elem:
                        continue
                    
                    title = title_elem.text.strip()
                    link = _extract_job_link_from_card(card)
                    if not link or not link.startswith(("http://", "https://")):
                        continue
                    
                    company_elem = card.find('img', class_='logo')
                    company = (company_elem.get('title') or company_elem.get('alt') or "").strip() if company_elem else ""
                    if not company or company.lower() in ("unknown", ""):
                        company = _extract_company_from_card(card, link)
                    company = company or "Company"
                    logo = ("https://www.rekrute.com" + company_elem["src"]) if company_elem and company_elem.get("src") else ""
                    
                    desc_snippet = _extract_desc_snippet(card, title)
                    posted_at = _extract_posted_at(card.get_text(" ", strip=True))
                    if posted_at:
                        posted_at_real_count += 1
                    is_remote = "télétravail" in card.text.lower() or "remote" in card.text.lower()
                    remote_type = "FULLY_REMOTE" if is_remote else None
                    contract_type = _extract_contract_type(card.get_text(" ", strip=True))
                    experience_hint = _extract_experience_hint(card.get_text(" ", strip=True), title)
                    city = None

                    if fetch_full_descriptions and link:
                        detail = _fetch_job_detail_structured(link)
                        if detail:
                            if detail.get("description"):
                                desc_snippet = detail["description"]
                            if detail.get("posted_at"):
                                posted_at = detail["posted_at"]
                            if detail.get("city"):
                                city = detail["city"]
                            if "type" in detail and detail["type"]:
                                contract_type = detail["type"]
                            if "is_remote" in detail:
                                is_remote = detail["is_remote"]
                                remote_type = "FULLY_REMOTE" if is_remote else None
                            if detail.get("experience_level_hint"):
                                experience_hint = detail["experience_level_hint"]
                        time.sleep(1.0) # Respectful delay between detail requests

                    if not posted_at:
                        posted_at = datetime.utcnow().isoformat()
                        posted_at_fallback_count += 1

                    stable_id = hashlib.sha256(link.encode()).hexdigest()[:12] if link else ""
                    source_id = f"rek_{stable_id}" if stable_id else f"rek_{hashlib.sha256(f'{title}|{company}'.encode()).hexdigest()[:12]}"

                    job_entry = {
                        "title": title,
                        "company": company,
                        "company_logo_url": logo,
                        "location": "Morocco",
                        "is_remote": is_remote,
                        "remote_type": remote_type,
                        "type": contract_type,
                        "description": desc_snippet,
                        "apply_url": link,
                        "source": "rekrute",
                        "source_id": source_id,
                        "posted_at": posted_at,
                        "job_region": "MA",
                        "country_code": "MA",
                    }
                    if city:
                        job_entry["city"] = city
                    if experience_hint:
                        job_entry["experience_level_hint"] = experience_hint
                    jobs.append(job_entry)
                    
                # Standard delay between index pages
                time.sleep(random.uniform(1.5, 3))
            
            except Exception as e:
                print(f"Error on page {page_num}: {e}")
                break

    except Exception as e:
        print(f"fetch_rekrute failed via HTTP: {e}")
    print(
        f"[rekrute] Scraped {pages_scraped} pages, found {len(jobs)} jobs, "
        f"real_posted_at={posted_at_real_count}, fallback_posted_at={posted_at_fallback_count}"
    )
        
    return jobs

if __name__ == "__main__":
    res = fetch_rekrute(max_pages=3)
    print(f"Total jobs grabbed natively: {len(res)}")
    if res:
        print(res[0])
