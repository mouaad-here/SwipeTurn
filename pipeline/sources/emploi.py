import uuid
from datetime import datetime
from bs4 import BeautifulSoup
from patchright.sync_api import sync_playwright

def fetch_emploi() -> list[dict]:
    jobs = []
    print("Initializing Patchright browser for Emploi...")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            page.goto("https://www.emploi.ma/recherche-jobs-maroc", wait_until="networkidle")
            page.wait_for_selector(".job-description-wrapper", timeout=15000)
            
            html_content = page.content()
            browser.close()
            
            soup = BeautifulSoup(html_content, 'html.parser')
            job_rows = soup.select('.job-description-wrapper')
            
            print(f"Emploi Page Loaded - Found {len(job_rows)} job rows.")
            
            for row in job_rows:
                title_elem = row.find('h3')
                if not title_elem: continue
                
                title = title_elem.text.strip()
                link_elem = title_elem.find('a')
                link = "https://www.emploi.ma" + link_elem['href'] if link_elem else ""
                
                company_elem = row.find('div', class_='job-company')
                company = company_elem.text.strip() if company_elem else "Unknown"
                
                is_remote = "teletravail" in title.lower() or "télétravail" in title.lower()
                
                jobs.append({
                    "title": title,
                    "company": company,
                    "location": "Morocco",
                    "is_remote": is_remote,
                    "description": "", 
                    "apply_url": link,
                    "source": "emploi",
                    "source_id": f"emp_{str(uuid.uuid4())[:8]}",
                    "posted_at": datetime.utcnow().isoformat()
                })
                
    except Exception as e:
        print(f"fetch_emploi failed via patchright: {e}")
        
    return jobs

if __name__ == "__main__":
    res = fetch_emploi()
    print(f"Total jobs grabbed natively: {len(res)}")
    if res:
        print(res[0])
