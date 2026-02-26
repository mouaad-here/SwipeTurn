import asyncio
import sys
import os

# Ensure the backend directory is in the Python path
sys.path.insert(0, os.path.abspath('.'))

from services.cv_parser import parse_cv

async def test_llm():
    print("Sending test request to OpenRouter...")
    sample_text = """
    John Doe
    Email: john@example.com
    
    Experience:
    Software Engineer at TechCorp (2020-Present)
    - Built scalable microservices using Python and FastAPI
    - Deployed containerized applications to Kubernetes
    - Managed PostgreSQL databases using SQLAlchemy
    
    Education:
    B.S. Computer Science, University of California (2016-2020)
    
    Skills:
    Python, FastAPI, React, Docker, Kubernetes, AWS, SQL
    """
    
    try:
        result = await parse_cv(sample_text)
        print("\n--- LLM JSON RESPONSE ---")
        print(result)
        print("-------------------------\n")
        print("\nSUCCESS! The OpenRouter integration is perfectly healthy.")
    except Exception as e:
        print(f"\nERROR: Failed to parse CV: {e}")

if __name__ == "__main__":
    asyncio.run(test_llm())
