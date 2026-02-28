import os
import json
import pika
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Initialize Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials in environment.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Initialize Hugging Face Embedding Model (Downloads on first run, cached after)
# This model converts text into a 384-dimensional vector
print("Loading Hugging Face model 'all-MiniLM-L6-v2' (this takes ~10s on first run)...")
model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
print("Model loaded successfully.")

def categorize_experience(title: str, description: str) -> str:
    """
    Categorize the job into one of four strict buckets based on title/description clues:
    'student' (PFE, Internships, 0 yrs)
    'junior' (< 1 yr, Entry Level)
    'mid' (1-4 yrs)
    'senior_lead' (5+ yrs, Senior, Lead, Principal, Manager)
    """
    text = f"{title} {description}".lower()
    
    # 1. Student / Internship
    if any(keyword in text for keyword in ["internship", "intern", "stage", "stagiaire", "pfe", "projet de fin d'études"]):
        return "student"
        
    # 2. Senior / Lead
    if any(keyword in text for keyword in ["senior", "lead", "principal", "manager", "director", "5+ years", "5 years", "6 years", "7 years", "10 years"]):
        return "senior_lead"
        
    # 3. Junior / Entry Level (Includes people with a few months of internship experience)
    if any(keyword in text for keyword in ["junior", "entry level", "débutant", "0-1 year", "1 year"]):
        return "junior"
        
    # 4. Default to Mid
    return "mid"

def process_message(ch, method, properties, body):
    try:
        job = json.loads(body)
        print(f"Processing job: {job.get('title')} at {job.get('company')}")
        
        # 1. Generate text combination for semantic embedding
        # We emphasize the required skills in the text to improve match accuracy
        skills_text = ", ".join(job.get('required_skills', []))
        embedding_text = f"Title: {job.get('title')}. Skills required: {skills_text}. Description: {job.get('description', '')}"
        
        # 2. Generate the 384-dimensional vector using Hugging Face
        # The returned vector is a numpy array, we convert it to a python list for Supabase
        embedding_vector = model.encode(embedding_text).tolist()
        
        # 3. Determine strict experience level
        exp_level = categorize_experience(job.get('title', ''), job.get('description', ''))
        
        # 4. Merge new AI fields into the original job payload
        job['description_embedding'] = embedding_vector
        job['experience_level'] = exp_level
        
        # 5. Insert into Supabase pgvector table
        # We catch the exception if it fails (e.g. unique constraint on source_id just in case)
        response = supabase.table('jobs').insert(job).execute()
        
        print(f"✅ Successfully inserted job {job.get('source_id')} with ML embeddings.")
        
        # Acknowledge message so RabbitMQ removes it from the queue
        ch.basic_ack(delivery_tag=method.delivery_tag)
        
    except json.JSONDecodeError:
        print("❌ CRITICAL: Failed to decode message. Acknowledging to drop poisoned message.")
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception as e:
        print(f"❌ Error during DB insertion or embedding generation: {str(e)}")
        # Nack the message to requeue it for retry (or dead letter exchange)
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)


def main():
    rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
    
    try:
        connection = pika.BlockingConnection(pika.URLParameters(rabbitmq_url))
        channel = connection.channel()
        
        # Ensure queue exists
        queue_name = 'new_jobs_queue'
        channel.queue_declare(queue=queue_name, durable=True)
        
        # Only prefetch 1 message at a time so workers distribute load evenly
        channel.basic_qos(prefetch_count=1)
        
        # Tell RabbitMQ to use process_message callback
        channel.basic_consume(queue=queue_name, on_message_callback=process_message)
        
        print(' [*] Waiting for new jobs in RabbitMQ. To exit press CTRL+C')
        channel.start_consuming()
        
    except pika.exceptions.AMQPConnectionError:
        print("CRITICAL: Cannot connect to RabbitMQ broker.")
    except KeyboardInterrupt:
        print("Worker stopped by user.")
    except Exception as e:
        print(f"Worker crashed: {e}")

if __name__ == '__main__':
    main()
