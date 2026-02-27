import uuid
from datetime import datetime
from bs4 import BeautifulSoup
from patchright.sync_api import sync_playwright
import time

def fetch_rekrute(max_pages=5) -> list[dict]:
    jobs = []
    print("Initializing Patchright browser for Rekrute (Pagination mode)...")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
            )
            page = context.new_page()
            
            for page_num in range(1, max_pages + 1):
                url = f"https://www.rekrute.com/offres.html?s=1&p={page_num}&o=1"
                print(f"Fetching Rekrute Page {page_num}...")
                
                try:
                    page.goto(url, wait_until="networkidle", timeout=20000)
                    page.wait_for_selector("li.post-id", timeout=10000)
                except Exception as e:
                    print(f"Skipping or end of pagination at page {page_num}: {e}")
                    break
                
                html_content = page.content()
                soup = BeautifulSoup(html_content, 'html.parser')
                job_cards = soup.find_all('li', class_='post-id')
                
                if not job_cards:
                    print("No more job cards found.")
                    break
                    
                print(f"Found {len(job_cards)} job cards on page {page_num}.")
                
                for card in job_cards:
                    title_elem = card.find('h2')
                    if not title_elem: continue
                    
                    title = title_elem.text.strip()
                    link = "https://www.rekrute.com" + title_elem.find('a')['href'] if title_elem.find('a') else ""
                    
                    company_elem = card.find('img', class_='logo')
                    company = company_elem['title'] if company_elem else "Unknown"
                    logo = "https://www.rekrute.com" + company_elem['src'] if company_elem else ""
                    
                    is_remote = "télétravail" in card.text.lower() or "remote" in card.text.lower()
                    
                    jobs.append({
                        "title": title,
                        "company": company,
                        "company_logo_url": logo,
                        "location": "Morocco",
                        "is_remote": is_remote,
                        "description": "",
                        "apply_url": link,
                        "source": "rekrute",
                        "source_id": f"rek_{str(uuid.uuid4())[:8]}",
                        "posted_at": datetime.utcnow().isoformat()
                    })
                    
                # Small delay to mimic human reading and avoid blocks
                time.sleep(2)
                
            browser.close()
    except Exception as e:
        print(f"fetch_rekrute failed via patchright: {e}")
        
    return jobs

if __name__ == "__main__":
    res = fetch_rekrute(max_pages=3)
    print(f"Total jobs grabbed natively: {len(res)}")
    if res:
        print(res[0])
