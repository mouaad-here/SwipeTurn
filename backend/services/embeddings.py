import logging

logger = logging.getLogger(__name__)

_model = None

def get_embedding_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading 'intfloat/multilingual-e5-small' (384-dim, multilingual)...")
        _model = SentenceTransformer('intfloat/multilingual-e5-small')
        logger.info("Embedding model loaded successfully.")
    return _model


def build_user_profile_text(parsed_data: dict, cv_text: str) -> str:
    """Build compact user profile text for embedding. Uses 'query: ' prefix for E5."""
    skills_text = ", ".join(parsed_data.get('skills', []) or [])
    fields_text = ", ".join(parsed_data.get('fields', []) or [])
    exp_level = parsed_data.get('experience_level', 'mid')
    summary = parsed_data.get('summary', '') or ''
    work_items = parsed_data.get('work_experience', []) or []
    projects = parsed_data.get('projects', []) or []

    work_str = ""
    if work_items:
        parts = []
        for w in work_items[:5]:
            if isinstance(w, dict):
                parts.append(f"{w.get('company', '')} - {w.get('role', '')}")
            else:
                parts.append(str(w))
        work_str = "Work: " + "; ".join(parts) + ". "
    elif projects:
        parts = [p.get('title', str(p)) if isinstance(p, dict) else str(p) for p in projects[:5]]
        work_str = "Projects: " + "; ".join(parts) + ". "

    cv_snippet = (cv_text or '')[:1500].strip()
    return (
        f"query: Candidate profile. Skills: {skills_text}. Fields: {fields_text}. "
        f"Experience: {exp_level}. Summary: {summary}. {work_str}CV snippet: {cv_snippet}"
    ).strip()


def build_user_profile_text_from_user(user: dict) -> str:
    """Build compact text from persisted user fields. Uses 'query: ' prefix for E5."""
    prefs = user.get("preferences") or {}
    skills = user.get("extracted_skills") or []
    domains = prefs.get("domains") or []
    keywords = prefs.get("keywords") or []
    exp_level = user.get("experience_level") or prefs.get("seniority") or "mid"
    cv_text = (user.get("cv_text") or "")[:1200]
    return (
        f"query: Candidate profile. Skills: {', '.join(skills)}. "
        f"Domains: {', '.join(domains)}. "
        f"Keywords: {', '.join(keywords)}. "
        f"Experience: {exp_level}. "
        f"CV snippet: {cv_text}"
    ).strip()

def generate_cv_embedding(parsed_data: dict, cv_text: str) -> list:
    """Generates a 384-dimensional vector for a user's CV using multilingual-e5-small."""
    model = get_embedding_model()
    embedding_text = build_user_profile_text(parsed_data, cv_text)
    vector = model.encode(embedding_text).tolist()
    return vector
