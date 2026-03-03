import json
import logging
from pypdf import PdfReader
from docx import Document as DocxReader
import httpx

import config

logger = logging.getLogger(__name__)

async def extract_text_from_pdf(file_bytes: bytes) -> str:
    from io import BytesIO
    reader = PdfReader(BytesIO(file_bytes))
    text = ""
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    return text

async def extract_text_from_docx(file_bytes: bytes) -> str:
    from io import BytesIO
    doc = DocxReader(BytesIO(file_bytes))
    return "\n".join([para.text for para in doc.paragraphs])

async def parse_cv(cv_text: str) -> dict:
    """Sends CV text to OpenRouter LLM to extract structured data."""
    if not config.OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY missing. Returning mocked CV data.")
        return {
            "skills": ["Python", "React", "TypeScript"],
            "experience_level": "junior",
            "fields": ["Software Engineering"]
        }
        
    prompt = """
    You are an expert technical recruiter AI. Extract the following information from the provided CV/Resume text.
    Return ONLY a raw JSON object with no markdown formatting, no code blocks, and no other text.
    
    Structure the JSON exactly like this:
    {
      "full_name": "User Name",
      "email": "user@example.com",
      "linkedin_url": "https://linkedin.com/in/username",
      "skills": ["Skill 1", "Skill 2"],
      "education": [{"school": "University Name", "degree": "Degree Name", "year": "2023"}],
      "projects": [{"title": "Project Title", "description": "Brief description"}],
      "languages": ["English", "French"],
      "experience_level": "student" | "junior" | "mid" | "senior" | "lead",
      "fields": ["Software Engineering", "Data Science", etc]
    }
    
    CV Text:
    """ + cv_text[:15000] # Limit tokens
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "google/gemini-2.5-flash",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "response_format": { "type": "json_object" }
                },
                timeout=60.0
            )
            response.raise_for_status()
            data = response.json()
            
            raw_content = data["choices"][0]["message"]["content"].strip()
            
            # Strip markdown code fences if the LLM ignores instructions
            if raw_content.startswith("```json"):
                raw_content = raw_content[7:]
            if raw_content.startswith("```"):
                raw_content = raw_content[3:]
            if raw_content.endswith("```"):
                raw_content = raw_content[:-3]
                
            return json.loads(raw_content.strip())
            
    except Exception as e:
        logger.error(f"CV Parsing failed: {e}")
        return {
            "skills": [],
            "experience_level": "student",
            "fields": []
        }
