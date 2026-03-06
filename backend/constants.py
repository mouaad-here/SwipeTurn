"""
Shared constants for job feed filtering and geography logic.
Refactored: seniority is a strict hard filter, eligibility uses globally_accessible + open_to_intl.
"""

# Seniority: strict filter per PIPELINE.md Section 7.
# User explicitly selected their level; respect it.
SENIORITY_FILTER = {
    "intern":  ["intern"],
    "junior":  ["junior"],
    "mid":     ["mid"],
    "senior":  ["senior"],
}


def get_seniority_filter(user_seniority: str) -> list[str]:
    """Returns the allowed experience_level values for this user. Strict: one level only."""
    s = (user_seniority or "mid").lower().strip()
    return SENIORITY_FILTER.get(s, ["mid"])


def build_eligibility_filter(user: dict) -> dict:
    """
    Build eligibility filter dict per PIPELINE.md Section 5.
    Returns filter conditions for the feed query.
    """
    prefs = user.get("preferences") or {}
    geography = (prefs.get("geography") or "morocco").lower()
    relocation = (prefs.get("relocation_preference") or "remote_only").lower()

    if geography == "morocco":
        return {"job_region": "MA"}

    global_filter = {
        "globally_accessible": True,
        "open_to_intl": True,
    }

    if relocation == "remote_only":
        global_filter["remote_type"] = "fully_remote"

    if geography == "both":
        return {"or": [{"job_region": "MA"}, global_filter]}

    return global_filter


# Domain keywords for domain-based feed filtering (kept for backward compat during transition).
DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "Engineering": [
        "software", "developer", "développeur", "engineer", "ingénieur", "backend", "front-end",
        "frontend", "fullstack", "full-stack", "full stack", "programming", "web developer",
        "mobile developer", "java", "python", "javascript", "typescript", "react", "node",
    ],
    "Data & AI": [
        "data", "machine learning", "artificial intelligence", "deep learning", "nlp",
        "data science", "data engineer", "data analyst", "bi ", "business intelligence",
        "ml engineer", "computer vision", "llm", "analyst", "scientist",
    ],
    "Design & UX": [
        "design", "designer", "ui", "ux", "figma", "creative", "graphic", "interface",
        "web design", "motion", "branding", "visual",
    ],
    "Product": [
        "product manager", "chef de produit", "product owner", "po ", "pm ", "agile",
        "scrum", "roadmap", "product management",
    ],
    "DevOps & Cloud": [
        "devops", "cloud", "aws", "azure", "gcp", "kubernetes", "docker", "infrastructure",
        "sre ", "platform engineer", "site reliability", "ci/cd", "terraform", "linux admin",
    ],
    "Customer Support": [
        "customer support", "customer service", "service client", "helpdesk", "help desk",
        "call center", "assistance", "conseiller", "support agent", "technical support",
    ],
    "Cybersecurity": [
        "security", "cybersecurity", "sécurité", "soc", "pentest", "penetration",
        "vulnerability", "firewall", "siem",
    ],
    "Finance & Accounting": [
        "finance", "accounting", "comptabilité", "audit", "controller", "treasury",
        "financial analyst", "risk", "compliance",
    ],
}

# Minimum feed score (kept but may be lowered now that scoring is simpler).
MIN_FEED_SCORE = 20.0
