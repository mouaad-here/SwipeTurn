import logging

logger = logging.getLogger(__name__)

_model = None

def get_embedding_model():
    """Lazily load and cache the shared embedding model."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading 'efederici/multilingual-e5-small-4096' (384-dim, multilingual, extended context)...")
        _model = SentenceTransformer('efederici/multilingual-e5-small-4096')
        logger.info("Embedding model loaded successfully.")
    return _model


def build_user_profile_text(parsed_data: dict, cv_text: str) -> str:
    """
    Build compact user profile text for embedding.

    Structure (signal-first, tuned for E5):
      - Skills (full list)
      - Fields/domains
      - Experience level
      - Short summary
      - Top 3 roles or 2 projects
      - Short CV snippet for extra context
    """
    skills = parsed_data.get("skills") or []
    fields = parsed_data.get("fields") or []
    exp_level = parsed_data.get("experience_level", "mid")
    summary_raw = parsed_data.get("summary") or ""
    work_items = parsed_data.get("work_experience") or []
    projects = parsed_data.get("projects") or []

    skills_text = ", ".join(skills)
    fields_text = ", ".join(fields)
    summary = summary_raw.strip()[:500]

    work_str = ""
    if work_items:
        parts = []
        for w in work_items[:3]:
            if isinstance(w, dict):
                parts.append(f"{w.get('company', '')} - {w.get('role', '')}")
            else:
                parts.append(str(w))
        work_str = "Roles: " + "; ".join(parts) + ". "
    elif projects:
        parts = []
        for p in projects[:2]:
            if isinstance(p, dict):
                parts.append(p.get("title", str(p)))
            else:
                parts.append(str(p))
        work_str = "Projects: " + "; ".join(parts) + ". "

    cv_snippet = (cv_text or "").strip()[:1500]

    return (
        f"query: Candidate profile. "
        f"Skills: {skills_text}. "
        f"Fields: {fields_text}. "
        f"Experience: {exp_level}. "
        f"Summary: {summary}. "
        f"{work_str}"
        f"CV: {cv_snippet}"
    ).strip()


def build_user_profile_text_from_user(user: dict) -> str:
    """
    Build compact text from persisted user fields (no fresh CV parse).

    Uses the same high-signal structure as build_user_profile_text but
    pulls from stored preferences and cv_text.
    """
    prefs = user.get("preferences") or {}
    skills = user.get("extracted_skills") or []
    domains = prefs.get("domains") or []
    keywords = prefs.get("keywords") or []
    exp_level = user.get("experience_level") or prefs.get("seniority") or "mid"
    cv_text_raw = (user.get("cv_text") or "").strip()

    skills_text = ", ".join(skills)
    domains_text = ", ".join(domains)
    keywords_text = ", ".join(keywords)
    cv_snippet = cv_text_raw[:1500]

    return (
        f"query: Candidate profile. "
        f"Skills: {skills_text}. "
        f"Domains: {domains_text}. "
        f"Keywords: {keywords_text}. "
        f"Experience: {exp_level}. "
        f"CV: {cv_snippet}"
    ).strip()

def generate_cv_embedding(parsed_data: dict, cv_text: str) -> list:
    """Generates a 384-dimensional vector for a user's CV using multilingual-e5-small-4096."""
    model = get_embedding_model()
    embedding_text = build_user_profile_text(parsed_data, cv_text)
    vector = model.encode(embedding_text).tolist()
    return vector
