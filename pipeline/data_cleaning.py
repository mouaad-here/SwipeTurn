"""
Data cleaning for scraped jobs before DB insert.
Use from pipeline/processor.py to normalize location, description, experience_level, expires_at.
"""
import re
from datetime import datetime, timedelta
from html import unescape
from typing import Any, Optional

# Morocco variants and cities for location normalization
# Preserve city so cards show "Fes", "Rabat", etc.; country becomes "Morocco"
MOROCCO_NORMALIZED = "Morocco"
MOROCCO_KEYWORDS = ("maroc", "morocco", "moroco", "morcco")
MOROCCO_CITY_DISPLAY = {
    "rabat": "Rabat", "casablanca": "Casablanca", "fes": "Fes", "fès": "Fes",
    "marrakech": "Marrakech", "tanger": "Tanger", "agadir": "Agadir",
    "meknès": "Meknès", "meknes": "Meknès", "oujda": "Oujda",
    "tétouan": "Tétouan", "tetouan": "Tétouan", "kenitra": "Kenitra", "kénitra": "Kenitra",
    "safi": "Safi", "el jadida": "El Jadida", "nador": "Nador", "salé": "Salé", "sale": "Salé",
}
MOROCCO_CITIES = set(MOROCCO_CITY_DISPLAY.keys())


def _extract_morocco_city(lower: str) -> Optional[str]:
    """Return display name of first Morocco city found in string, else None."""
    for key, display in MOROCCO_CITY_DISPLAY.items():
        if key in lower:
            return display
    return None


def normalize_location(raw: Optional[str]) -> str:
    """
    Normalize location but preserve city for display.
    - "Fes, Maroc" / "Rabat, Morocco" -> "Fes, Morocco" so the card shows the place.
    - "Morocco" only -> "Morocco"
    - Other locations (New York, London) left as-is so global view shows the city.
    """
    if not raw or not str(raw).strip():
        return "Global"
    s = str(raw).strip()
    lower = s.lower()
    is_morocco = any(k in lower for k in MOROCCO_KEYWORDS)
    city = _extract_morocco_city(lower)
    if is_morocco:
        if city:
            return f"{city}, Morocco"
        return MOROCCO_NORMALIZED
    # Location is only a known Morocco city (no country text)
    if city and not any(k in lower for k in ("usa", "uk", "france", "spain", "remote", "global")):
        return f"{city}, Morocco"
    return s


def job_region_from_location_and_source(normalized_location: str, source: Optional[str]) -> str:
    """
    Return ISO-style region code for DB column job_region.
    'MA' for Morocco sources/locations, 'GLOBAL' for everything else.
    Feed filter uses: .eq('job_region', 'MA') for Morocco users.
    """
    if not normalized_location:
        return "GLOBAL"
    lower = normalized_location.lower()
    if "morocco" in lower or "maroc" in lower:
        return "MA"
    src = (source or "").lower()
    if src in ("rekrute", "stagiaires"):
        return "MA"
    return "GLOBAL"


def extract_city_country(normalized_location: str, source: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """
    Extract (city, country_code) for card display and querying.
    Returns (None, None) when unknown.
    """
    if not normalized_location:
        return None, None
    lower = normalized_location.lower()
    # Morocco
    if "morocco" in lower or "maroc" in lower or (source or "").lower() in ("rekrute", "stagiaires"):
        city = _extract_morocco_city(lower)
        return (city, "MA")
    # Remote-like (Worldwide, Americas, Europe) -> city Remote for card
    if any(k in lower for k in ("worldwide", "americas", "europe", "remote", "anywhere")):
        return ("Remote", None)
    # US cities
    if "san francisco" in lower:
        return ("San Francisco", "US")
    if "seattle" in lower:
        return ("Seattle", "US")
    if "austin" in lower:
        return ("Austin", "US")
    if "boston" in lower:
        return ("Boston", "US")
    if "chicago" in lower:
        return ("Chicago", "US")
    if "los angeles" in lower:
        return ("Los Angeles", "US")
    if "denver" in lower:
        return ("Denver", "US")
    if "miami" in lower:
        return ("Miami", "US")
    if "new york" in lower or "ny" in lower:
        return ("New York", "US")
    # FR
    if "paris" in lower:
        return ("Paris", "FR")
    if "lyon" in lower:
        return ("Lyon", "FR")
    if "marseille" in lower or "marseilles" in lower:
        return ("Marseille", "FR")
    if "toulouse" in lower:
        return ("Toulouse", "FR")
    if "lille" in lower:
        return ("Lille", "FR")
    # GB
    if "london" in lower:
        return ("London", "GB")
    if "manchester" in lower:
        return ("Manchester", "GB")
    if "edinburgh" in lower:
        return ("Edinburgh", "GB")
    if "birmingham" in lower:
        return ("Birmingham", "GB")
    # Other
    if "barcelona" in lower:
        return ("Barcelona", "ES")
    if "berlin" in lower:
        return ("Berlin", "DE")
    if "munich" in lower or "münchen" in lower:
        return ("Munich", "DE")
    if "amsterdam" in lower:
        return ("Amsterdam", "NL")
    if "dublin" in lower:
        return ("Dublin", "IE")
    return None, None


def strip_html(html_str: Optional[str], max_length: Optional[int] = None) -> str:
    """Decode HTML entities and remove tags; return plain text."""
    if not html_str:
        return ""
    s = str(html_str)
    s = unescape(s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if max_length and len(s) > max_length:
        s = s[:max_length]
    return s


# Default days when source does not provide expires_at. Many offers are 1 month; tune per-source later.
DEFAULT_EXPIRES_DAYS = 60

# Cached data-driven experience keywords (loaded once from experience_keywords.json)
_EXPERIENCE_KEYWORDS_CACHE: Optional[dict] = None


def _load_experience_keywords() -> dict:
    global _EXPERIENCE_KEYWORDS_CACHE
    if _EXPERIENCE_KEYWORDS_CACHE is not None:
        return _EXPERIENCE_KEYWORDS_CACHE
    import os
    for path in [
        os.path.join(os.path.dirname(__file__), "experience_keywords.json"),
        os.path.join(os.path.dirname(__file__), "..", "study_of_data", "experience_keywords.json"),
    ]:
        if os.path.isfile(path):
            try:
                import json
                with open(path, encoding="utf-8") as f:
                    _EXPERIENCE_KEYWORDS_CACHE = json.load(f)
                return _EXPERIENCE_KEYWORDS_CACHE
            except Exception:
                pass
    _EXPERIENCE_KEYWORDS_CACHE = {}
    return _EXPERIENCE_KEYWORDS_CACHE


def parse_posted_at(raw: Any, fallback_iso: str) -> tuple[str, str]:
    """Return (posted_at_iso, expires_at_iso). Prefer source posted_at; else use fallback and DEFAULT_EXPIRES_DAYS for expires."""
    from dateutil import parser as date_parser
    try:
        if raw:
            dt = date_parser.parse(str(raw))
            posted = dt.isoformat()
            expires = (dt + timedelta(days=DEFAULT_EXPIRES_DAYS)).isoformat()
            return posted, expires
    except Exception:
        pass
    try:
        fb = date_parser.parse(fallback_iso)
        return fallback_iso, (fb + timedelta(days=DEFAULT_EXPIRES_DAYS)).isoformat()
    except Exception:
        now = datetime.utcnow()
        return now.isoformat(), (now + timedelta(days=DEFAULT_EXPIRES_DAYS)).isoformat()


def normalize_expires_at(raw: Any, posted_at_iso: str) -> Optional[str]:
    """Parse expires_at to ISO; on failure use posted_at + DEFAULT_EXPIRES_DAYS (tune per-source for 30d offers)."""
    from dateutil import parser as date_parser
    if not raw:
        try:
            dt = date_parser.parse(posted_at_iso)
            return (dt + timedelta(days=DEFAULT_EXPIRES_DAYS)).isoformat()
        except Exception:
            return (datetime.utcnow() + timedelta(days=DEFAULT_EXPIRES_DAYS)).isoformat()
    try:
        dt = date_parser.parse(str(raw))
        return dt.isoformat()
    except Exception:
        try:
            dt = date_parser.parse(posted_at_iso)
            return (dt + timedelta(days=DEFAULT_EXPIRES_DAYS)).isoformat()
        except Exception:
            return (datetime.utcnow() + timedelta(days=DEFAULT_EXPIRES_DAYS)).isoformat()


SENIORITY_RULES = {
    "student": [
        "intern", "internship", "stage", "stagiaire", "apprenti", "apprentice",
        "stage pfe", "alternance", "alternant",
        "graduate", "new grad", "new graduate", "entry level", "entry-level",
        "fresh graduate", "trainee", "co-op", "coop",
    ],
    "junior": [
        "junior", " jr ", "jr.", "(jr)", "associate engineer", "associate developer",
        "associate software",
        "débutant", "debutant", "debutante", "debut",
        "1-2 years", "1-3 years", "0-2 years",
        "1 year of experience", "1 years of experience",
    ],
    "mid": [
        "mid-level", "mid level", "midlevel",
        "engineer ii", "engineer 2", "swe ii", "swe2",
        "software engineer ii", "software engineer 2",
        "level ii", "level 2", "intermediate", "confirmed", "confirme",
        "2-4 years", "3-5 years",
        "2 years of experience", "3 years of experience",
    ],
    "senior": [
        "senior", " sr.", "sr ", "(sr)", "/ sr",
        "lead ", "tech lead", "team lead",
        "principal", "staff engineer", "staff software",
        "architect", "head of", " vp ", "vp,",
        "engineer iii", "engineer iv", "engineer v",
        "engineer 3", "engineer 4", "engineering manager",
        "group product manager",
        "7+ years", "8+ years", "10+ years",
    ],
}


def _extract_years_of_experience(text: str) -> int | None:
    """
    Try to extract an explicit 'X years of experience' style signal (English/French).
    Keeps logic simple and conservative; only used when keywords fail.
    """
    if not text:
        return None
    lower = text.lower()
    # English: "3+ years of experience", "2 years experience"
    m = re.search(r"(\\d+)\\+?\\s*(?:years?|yrs?)\\s*(?:of\\s+)?experience", lower)
    if not m:
        # French: "3 ans d'expérience", "2 ans d exp"
        m = re.search(r"(\\d+)\\+?\\s*(?:ans?)\\s+d['e]\\s*exp", lower)
    if not m:
        return None
    try:
        return int(m.group(1))
    except Exception:
        return None


def _map_years_to_level(years: int) -> str | None:
    """
    Map a number of years to one of: student | junior | mid | senior.
    Conservative thresholds to avoid over-classifying.
    """
    if years <= 0:
        return "student"
    if years <= 1:
        return "student"
    if years <= 2:
        return "junior"
    if years <= 4:
        return "mid"
    if years >= 5:
        return "senior"
    return None


def categorize_experience_strict(title: str, description: str) -> str | None:
    """
    Returns: student | junior | mid | senior | None.
    None means no confident signal (never default to senior).
    Title has priority over description.
    """
    title_lower = " " + (title or "").lower() + " "
    for level in ["student", "junior", "mid", "senior"]:
        if any(kw in title_lower for kw in SENIORITY_RULES[level]):
            return level

    desc_lower = " " + (description or "").lower()[:1500] + " "
    for level in ["student", "junior", "mid", "senior"]:
        if any(kw in desc_lower for kw in SENIORITY_RULES[level]):
            return level

    # Fallback: explicit years-of-experience signal
    years = _extract_years_of_experience(title or "") or _extract_years_of_experience(description or "")
    if years is not None:
        level = _map_years_to_level(years)
        if level:
            return level

    return None
