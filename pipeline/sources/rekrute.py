import hashlib
import re
import time
import random
import requests
from datetime import datetime, timedelta
from bs4 import BeautifulSoup
from patchright.sync_api import sync_playwright


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


def _fetch_job_description(apply_url: str, timeout: int = 10) -> str:
    """Fetch full job description from the job detail page."""
    if not apply_url or not apply_url.startswith("http"):
        return ""
    try:
        r = requests.get(
            apply_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
            timeout=timeout,
        )
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        parts = []
        for tag in soup.find_all(["section", "div", "article"]):
            cls = tag.get("class") or []
            cls_str = " ".join(cls).lower() if isinstance(cls, list) else str(cls).lower()
            if any(x in cls_str for x in ["description", "poste", "entreprise", "profil", "annonce", "content"]):
                text = tag.get_text(separator=" ", strip=True)
                if len(text) > 100 and "4K" not in text[:50]:
                    parts.append(text)
        if parts:
            return "\n\n".join(parts[:6])
        main = soup.find("main") or soup.find("article") or soup.find(class_=re.compile(r"detail|content|annonce", re.I))
        if main:
            return main.get_text(separator=" ", strip=True)
        return ""
    except Exception:
        return ""


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


MAX_PAGES = 20


def fetch_rekrute(max_pages: int = MAX_PAGES, fetch_full_descriptions: bool = True) -> list[dict]:
    jobs = []
    pages_scraped = 0
    posted_at_real_count = 0
    posted_at_fallback_count = 0
    print("Initializing Patchright browser for Rekrute (Pagination mode)...")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            for page_num in range(1, max_pages + 1):
                url_candidates = [
                    f"https://www.rekrute.com/offres.html?postuler=1&page={page_num}",
                    f"https://www.rekrute.com/offres.html?s=1&p={page_num}&o=1",
                ]
                print(f"Fetching Rekrute Page {page_num}...")
                
                loaded = False
                for url in url_candidates:
                    try:
                        page.goto(url, wait_until="networkidle", timeout=20000)
                        page.wait_for_selector("li.post-id", timeout=10000)
                        loaded = True
                        break
                    except Exception:
                        continue
                if not loaded:
                    print(f"Skipping or end of pagination at page {page_num}.")
                    break
                
                html_content = page.content()
                soup = BeautifulSoup(html_content, 'html.parser')
                job_cards = soup.find_all('li', class_='post-id')
                
                if not job_cards:
                    print("No more job cards found.")
                    break
                pages_scraped += 1
                    
                print(f"Found {len(job_cards)} job cards on page {page_num}.")
                
                for card in job_cards:
                    title_elem = card.find('h2')
                    if not title_elem:
                        continue
                    
                    title = title_elem.text.strip()
                    link = "https://www.rekrute.com" + title_elem.find('a')['href'] if title_elem.find('a') else ""
                    
                    company_elem = card.find('img', class_='logo')
                    company = (company_elem.get('title') or company_elem.get('alt') or "").strip() if company_elem else ""
                    if not company or company.lower() in ("unknown", ""):
                        company = _extract_company_from_card(card, link)
                    company = company or "Company"
                    logo = ("https://www.rekrute.com" + company_elem["src"]) if company_elem and company_elem.get("src") else ""
                    
                    # Description: always fetch full from detail page when possible
                    desc_snippet = _extract_desc_snippet(card, title)
                    posted_at = _extract_posted_at(card.get_text(" ", strip=True))
                    if posted_at:
                        posted_at_real_count += 1
                    if fetch_full_descriptions and link:
                        full_desc = _fetch_job_description(link)
                        if full_desc:
                            desc_snippet = full_desc
                        time.sleep(1.2)
                    if not posted_at:
                        posted_at = datetime.utcnow().isoformat()
                        posted_at_fallback_count += 1
                    
                    is_remote = "télétravail" in card.text.lower() or "remote" in card.text.lower()
                    remote_type = "FULLY_REMOTE" if "télétravail" in card.text.lower() or "remote" in card.text.lower() else None
                    stable_id = hashlib.sha256(link.encode()).hexdigest()[:12] if link else ""
                    source_id = f"rek_{stable_id}" if stable_id else f"rek_{hashlib.sha256(f'{title}|{company}'.encode()).hexdigest()[:12]}"
                    experience_hint = _extract_experience_hint(card.get_text(" ", strip=True), title)
                    
                    job_entry = {
                        "title": title,
                        "company": company,
                        "company_logo_url": logo,
                        "location": "Morocco",
                        "is_remote": is_remote,
                        "remote_type": remote_type,
                        "type": _extract_contract_type(card.get_text(" ", strip=True)),
                        "description": desc_snippet,
                        "apply_url": link,
                        "source": "rekrute",
                        "source_id": source_id,
                        "posted_at": posted_at,
                    }
                    if experience_hint:
                        job_entry["experience_level_hint"] = experience_hint
                    jobs.append(job_entry)
                    
                # Small delay to mimic human reading and avoid blocks
                time.sleep(random.uniform(1, 2))
                
            browser.close()
    except Exception as e:
        print(f"fetch_rekrute failed via patchright: {e}")
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
