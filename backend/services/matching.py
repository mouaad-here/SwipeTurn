import re
import json
from typing import List, Dict, Any, Optional

import numpy as np


def normalize_skill(skill: str) -> str:
    """Lowercase and normalize for matching; preserve C++/C# via canonical forms."""
    s = (skill or "").lower().strip()
    s = re.sub(r"\s+", " ", s)
    if s in ("c++", "c#"):
        return "cplus" if s == "c++" else "csharp"
    return re.sub(r"[^a-z0-9]", "", s)


def cosine_similarity(v1, v2):
    """Calculates cosine similarity between two vectors, handling list or string input."""
    if v1 is None or v2 is None:
        return 0.0
    try:
        if isinstance(v1, str):
            v1 = json.loads(v1)
        if isinstance(v2, str):
            v2 = json.loads(v2)
        v1 = np.array(v1, dtype=float)
        v2 = np.array(v2, dtype=float)
        if np.linalg.norm(v1) == 0 or np.linalg.norm(v2) == 0:
            return 0.0
        return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))
    except Exception:
        return 0.0


def calculate_match_score(
    job: dict,
    user: dict,
) -> float:
    """
    3-component match score (0-100) per PIPELINE.md Section 7:
      - Skill overlap: 0-60 pts (most important signal)
      - Domain match:  0-25 pts
      - Job type match: 0-15 pts
    Seniority is a hard filter (applied before this function).
    Recency is sort order (applied after scoring).
    """
    prefs = user.get("preferences") or {}
    score = 0.0

    # 1. Skill overlap (0-60 pts)
    user_skills = set(
        normalize_skill(s) for s in
        (user.get("extracted_skills") or []) + (prefs.get("keywords") or [])
        if s
    )
    job_skills = set(
        normalize_skill(s) for s in (job.get("required_skills") or [])
        if s
    )
    if job_skills and user_skills:
        overlap = len(user_skills & job_skills) / len(job_skills)
        score += overlap * 60
    elif not job_skills:
        score += 30  # neutral when no requirements listed

    # 2. Domain match (0-25 pts)
    user_subcategories = set(s.lower() for s in (prefs.get("subcategories") or []) if s)
    user_domains = set(d.lower() for d in (prefs.get("domains") or []) if d)
    job_subcategory = (job.get("subcategory") or "").lower()
    job_category = (job.get("category") or "").lower()

    if job_subcategory and job_subcategory in user_subcategories:
        score += 25
    elif job_category and job_category in user_domains:
        score += 15

    # 3. Job type match (0-15 pts)
    user_job_types = set(t.lower() for t in (prefs.get("job_type") or []) if t)
    job_type = (job.get("job_type") or job.get("type") or "").lower()
    if user_job_types and job_type and job_type in user_job_types:
        score += 15
    elif not user_job_types:
        score += 7.5  # neutral when user hasn't set preference

    return round(min(score, 100.0), 1)


def calculate_hybrid_score(keyword_score: float, semantic_similarity: float) -> float:
    """
    Blend keyword-based score with semantic similarity from embeddings.

    - keyword_score: existing 0–100 score from calculate_match_score
    - semantic_similarity: cosine similarity in [-1, 1]

    We map cosine to [0, 100] and average:
        semantic_scaled = (sim + 1) * 50
        final = 0.5 * keyword_score + 0.5 * semantic_scaled
    """
    # Clamp to a safe range in case upstream callers pass values slightly outside [-1, 1]
    sim = max(-1.0, min(1.0, float(semantic_similarity)))
    semantic_scaled = (sim + 1.0) * 50.0
    final = 0.5 * float(keyword_score) + 0.5 * semantic_scaled
    return float(max(0.0, min(100.0, final)))


def get_skill_breakdown(user_skills: List[str], job_skills: List[str]) -> Dict[str, List[str]]:
    """Separates job skills into what the user has matched vs what is missing."""
    if not job_skills:
        return {"matched": [], "missing": []}

    normalized_user_map = {normalize_skill(s): s for s in user_skills}

    matched = []
    missing = []

    for req in job_skills:
        norm_req = normalize_skill(req)
        if norm_req in normalized_user_map:
            matched.append(normalized_user_map[norm_req])
        else:
            missing.append(req)

    return {"matched": matched, "missing": missing}
