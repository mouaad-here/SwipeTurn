import requests
from bs4 import BeautifulSoup
from datetime import datetime
import uuid

def fetch_weworkremotely() -> list[dict]:
    try:
        url = "https://weworkremotely.com/categories/remote-programming-jobs.rss"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'xml')
        items = soup.find_all('item')
        
        jobs = []
        for item in items:
            title_text = item.title.text if item.title else ""
            if ':' in title_text:
                parts = title_text.split(':')
                title = parts[0].strip()
                company = parts[-1].strip()
            else:
                title = title_text
                company = "Unknown Company"
                
            link = item.link.text if item.link else ""
            guid = item.guid.text if item.guid else str(uuid.uuid4())
            pub_date = item.pubDate.text if item.pubDate else datetime.utcnow().isoformat()
            
            desc = item.description.text if item.description else ""
            
            jobs.append({
                "title": title,
                "company": company,
                "location": "Remote",
                "is_remote": True,
                "description": desc,
                "apply_url": link,
                "source": "weworkremotely",
                "source_id": f"wwr_{guid.split('-')[-1][:15]}",
                "posted_at": pub_date
            })
            
        return jobs
    except Exception as e:
        print(f"fetch_weworkremotely failed: {e}")
        return []
