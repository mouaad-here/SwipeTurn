import os
import json
import re
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")  # Using service role key ideally, or anon key if RLS allows

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None
    print("WARNING: Supabase URL or Key not set. DB inserts will fail.")

OPEN_TO_INTL_KEYWORDS = [
    "open to international", "worldwide", "any nationality",
    "global candidates", "all nationalities", "international applicants",
    "moroccan", "morocco", "north africa", "afrique du nord",
    "mena", "maghreb", "maroc", "no visa required",
    "remote worldwide", "100% remote"
]

VISA_SPONSORSHIP_KEYWORDS = [
    "visa sponsorship", "sponsor work permit", "relocation package",
    "work permit provided", "visa provided", "tier 2 sponsor",
    "h-1b sponsor", "we sponsor", "relocation assistance"
]

SKILLS_LIST = [
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust", "php", "ruby", "swift", "kotlin",
    "react", "angular", "vue", "next.js", "nuxt", "svelte", "react native", "flutter",
    "node.js", "express", "django", "flask", "fastapi", "spring boot", "laravel", "ruby on rails",
    "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra", "dynamodb",
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions",
    "machine learning", "deep learning", "nlp", "computer vision", "tensorflow", "pytorch", "scikit-learn",
    "data science", "data engineering", "pandas", "numpy", "spark", "hadoop",
    "html", "css", "tailwind css", "sass", "graphql", "rest api", "grpc", "rabbitmq", "kafka",
    "figma", "ui/ux", "product management", "agile", "scrum", "jira"
]

def extract_skills(text: str) -> list[str]:
    """Auto-extract known tech keywords from text."""
    if not text:
        return []
    
    found_skills = set()
    text_lower = text.lower()
    
    for skill in SKILLS_LIST:
        # Use simple boundary matching to avoid matching partial words
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, text_lower):
            found_skills.add(skill)
            
    return list(found_skills)

def extract_visa_info(text: str) -> dict:
    """Parse description for visa_sponsorship and open_to_intl flags."""
    if not text:
        return {"visa_sponsorship": False, "open_to_intl": False}
        
    text_lower = text.lower()
    
    visa_sponsorship = any(kw in text_lower for kw in VISA_SPONSORSHIP_KEYWORDS)
    open_to_intl = any(kw in text_lower for kw in OPEN_TO_INTL_KEYWORDS)
    
    return {
        "visa_sponsorship": visa_sponsorship,
        "open_to_intl": open_to_intl
    }

def process_jobs(raw_jobs: list[dict]) -> dict:
    """
    Deduplicates by source_id, auto-extracts skills if empty,
    and publishes the enriched job object to RabbitMQ for processing.
    """
    import pika
    
    if not supabase:
        print("Error: Supabase client not initialized")
        return {"new": 0, "skipped": len(raw_jobs)}

    # Initialize RabbitMQ connection
    rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
    try:
        connection = pika.BlockingConnection(pika.URLParameters(rabbitmq_url))
        channel = connection.channel()
        # Declare the queue (makes sure it exists)
        channel.queue_declare(queue='new_jobs_queue', durable=True)
    except Exception as e:
        print(f"CRITICAL: Failed to connect to RabbitMQ: {e}")
        return {"new": 0, "skipped": len(raw_jobs)}

    new_count = 0
    skipped_count = 0
    
    now = datetime.utcnow()
    expires_at = now + timedelta(days=60)
    expires_at_iso = expires_at.isoformat()
    scraped_at_iso = now.isoformat()
    
    for job in raw_jobs:
        try:
            # Prevent sending jobs we already have in our database queue
            response = supabase.table('jobs').select('id').eq('source_id', job.get('source_id')).limit(1).execute()
            
            if response.data and len(response.data) > 0:
                skipped_count += 1
                continue
                
            title = job.get('title', 'Unknown Title').strip()
            company = job.get('company', 'Unknown Company').strip()
            
            # Heal missing or extremely short descriptions
            raw_desc = str(job.get('description', '')).strip()
            if not raw_desc or len(raw_desc) < 20:
                raw_desc = f"Job opportunity for {title} at {company}. This is an active hiring position."
            
            # If skills are empty or not list, auto-extract
            req_skills = job.get('required_skills', [])
            if not req_skills or not isinstance(req_skills, list):
                req_skills = extract_skills(title + " " + raw_desc)
            if not req_skills:
                # Provide a generic fallback if extraction found nothing
                req_skills = ["communication", "teamwork"]
                
            # Parse visa info from description and title
            full_text = f"{title} {raw_desc}"
            visa_info = extract_visa_info(full_text)
            
            # Standardize Dates
            from dateutil import parser
            posted_at_raw = job.get('posted_at')
            try:
                if posted_at_raw:
                    dt = parser.parse(str(posted_at_raw))
                    # Ensure timezone awareness is stripped or normalized if needed, but ISO format usually handles it
                    posted_at_iso = dt.isoformat()
                    expires_at_iso = (dt + timedelta(days=60)).isoformat()
                else:
                    posted_at_iso = scraped_at_iso
                    expires_at_iso = (datetime.utcnow() + timedelta(days=60)).isoformat()
            except Exception:
                posted_at_iso = scraped_at_iso
                expires_at_iso = (datetime.utcnow() + timedelta(days=60)).isoformat()
                
            # Standardize Company Logo (Ensure pure string or None)
            logo_url = job.get('company_logo_url')
            if not logo_url or not isinstance(logo_url, str) or len(logo_url) < 5:
                logo_url = None
                
            # Prepare payload for the AMQP Queue
            payload = {
                "title": title,
                "company": company,
                "company_logo_url": logo_url,
                "location": job.get('location', 'Global'),
                "is_remote": bool(job.get('is_remote', False)),
                "type": job.get('type', 'full-time'),
                "description": raw_desc,
                "required_skills": req_skills,
                
                "visa_sponsorship": bool(job.get('visa_sponsorship', visa_info['visa_sponsorship'])),
                "open_to_intl": bool(job.get('open_to_intl', visa_info['open_to_intl'])),
                
                "apply_url": job.get('apply_url', ''),
                "apply_email": job.get('apply_email'),
                "apply_type": job.get('apply_type', 'url'),
                "source": job.get('source', 'unknown'),
                "source_id": str(job.get('source_id')),
                "posted_at": posted_at_iso,
                "scraped_at": scraped_at_iso,
                "is_active": True,
                "expires_at": expires_at_iso
            }
            
            # Publish message to RabbitMQ instead of querying Supabase directly
            channel.basic_publish(
                exchange='',
                routing_key='new_jobs_queue',
                body=json.dumps(payload),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # make message persistent
                )
            )
            
            new_count += 1
            
        except Exception as e:
            print(f"Error processing job {job.get('source_id')}: {e}")
            skipped_count += 1
            
    # Close the MQ connection when the batch is fully published
    try:
        connection.close()
    except Exception:
        pass
        
    return {"new": new_count, "skipped": skipped_count}

def deactivate_expired():
    """Marks is_active = false for expired jobs"""
    if not supabase:
        return
        
    try:
        now_iso = datetime.utcnow().isoformat()
        response = supabase.table('jobs') \
            .update({"is_active": False}) \
            .lt('expires_at', now_iso) \
            .eq('is_active', True) \
            .execute()
            
        deactivated = len(response.data) if response.data else 0
        print(f"Deactivated {deactivated} expired jobs.")
    except Exception as e:
        print(f"Error deactivating expired jobs: {e}")

if __name__ == "__main__":
    # Test skill extraction
    sample = "We are looking for a Python and React developer. Must know TypeScript."
    print("Skills:", extract_skills(sample))
    
    # Test visa extraction
    sample_visa = "We offer visa sponsorship and relocation assistance for global candidates."
    print("Visa:", extract_visa_info(sample_visa))
