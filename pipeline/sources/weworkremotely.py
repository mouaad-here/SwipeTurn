import hashlib
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
                company = parts[0].strip()
                title = parts[-1].strip() if len(parts) > 1 else title_text
            else:
                title = title_text
                company = "Unknown Company"

            link = item.link.text if item.link else ""
            guid = item.guid.text if item.guid else str(uuid.uuid4())
            pub_date = item.pubDate.text if item.pubDate else datetime.utcnow().isoformat()
            desc = item.description.text if item.description else ""

            # Use an md5 hash of the full guid so every job gets a unique,
            # stable source_id regardless of how the URL slug ends.
            source_id = f"wwr_{hashlib.md5(guid.encode()).hexdigest()[:12]}"

            jobs.append({
                "title": title,
                "company": company,
                "location": "Remote",
                "is_remote": True,
                "description": desc,
                "apply_url": link,
                "source": "weworkremotely",
                "source_id": source_id,
                "posted_at": pub_date,
            })

        return jobs
    except Exception as e:
        print(f"fetch_weworkremotely failed: {e}")
        return []
