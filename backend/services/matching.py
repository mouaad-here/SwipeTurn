import re
import json
from typing import List, Dict, Any, Optional

from datetime import datetime

import numpy as np


def safe_posted_at_ts(job: dict) -> float:
    raw = job.get("posted_at")
    if not raw:
        return 0.0
    try:
        s = str(raw).replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp()
    except Exception:
        return 0.0


def recency_bonus(job: dict) -> float:
    ts = safe_posted_at_ts(job)
    if not ts: return 0.0
    days_old = (datetime.utcnow().timestamp() - ts) / 86400.0
    if days_old < 3: return 2.5
    if days_old < 7: return 1.5
    if days_old < 14: return 0.5
    return 0.0


def get_dedup_key(job: dict) -> str:
    """Generate a stable deduplication key for near-duplicate jobs."""
    title = (job.get("title") or "").lower()
    company = (job.get("company") or "").lower()
    
    # Remove common geographic/gender suffixes and parentheticals
    title = re.sub(r'\b(m/f/d|m/f|h/f|d/f/m|w/m/d)\b', '', title)
    title = re.sub(r'[-–—]\s*(remote|hybrid|onsite)\b', '', title)
    title = re.sub(r'\(.*?\)', '', title)
    
    # Normalize and take the first few words to aggressively group similar titles
    title_norm = re.sub(r'[^a-z0-9\s]', '', title).strip()
    title_words = " ".join(title_norm.split()[:3])
    comp_norm = re.sub(r'[^a-z0-9]', '', company)
    
    return f"{comp_norm}::{title_words}"

def assess_profile_quality(user: dict) -> str:
    """
    Classify the quality of a user's profile to gate personalized logic.
    Tiers:
      - empty: no useful signal.
      - weak: limited signal (few skills/prefs).
      - partial: reasonable signal (CV present or enough skills/prefs).
      - strong: full signal (CV + embedding + skills/prefs).
    """
    cv_text = user.get("cv_text")
    cv_embedding = user.get("cv_embedding")
    skills = user.get("extracted_skills") or []
    prefs = user.get("preferences") or {}
    
    has_cv = bool(cv_text and len(cv_text.strip()) > 50)
    has_embedding = bool(cv_embedding and isinstance(cv_embedding, list) and len(cv_embedding) > 0)
    num_skills = len(skills)
    
    # Meaningful prefs equal those used in semantic/keyword matching
    has_meaningful_prefs = bool(
        (prefs.get("keywords") and len(prefs.get("keywords")) > 0) or 
        (prefs.get("domains") and len(prefs.get("domains")) > 0) or 
        (prefs.get("subcategories") and len(prefs.get("subcategories")) > 0)
    )

    if has_cv and has_embedding and (num_skills >= 3 or has_meaningful_prefs):
        return "strong"
        
    if has_cv or num_skills >= 3 or has_meaningful_prefs:
        return "partial"
        
    has_any_prefs = bool(prefs)
    if num_skills > 0 or has_any_prefs:
        return "weak"
        
    return "empty"


def assess_job_quality(job: dict) -> str:
    """
    Classify the quality of a job post to gate scoring caps.
    Tiers:
      - low: no required_skills.
      - medium: has some skills, reasonable description.
      - high: well-structured, detailed description, multiple skills.
    """
    skills = job.get("required_skills") or []
    desc = job.get("description_text") or ""
    
    num_skills = len(skills)
    desc_len = len(desc.strip())
    
    if num_skills == 0:
        return "low"
        
    if num_skills >= 3 and desc_len >= 500:
        return "high"
        
    return "medium"

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


def calculate_hybrid_score(
    keyword_score: float, 
    semantic_similarity: float,
    profile_quality: str = None,
    job_quality: str = None
) -> float:
    """
    Blend keyword-based score with semantic similarity from embeddings.

    - keyword_score: existing 0–100 score from calculate_match_score
    - semantic_similarity: cosine similarity in [-1, 1]
    
    Note: profile_quality and job_quality are currently accepted for compatibility
    and future use, but the 50/50 scoring formula remains unchanged for now.

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


def score_job_for_user(
    job: dict,
    user: dict,
    is_generic_feed: bool = False,
    query_tokens: List[str] = None,
    exact_priority: bool = False
) -> dict:
    """
    Standardized scoring pipeline for jobs.
    Returns a dictionary of score components and final calculated scores.
    """
    req_skills = job.get("required_skills") or []
    user_skills = user.get("extracted_skills") or []
    prefs = user.get("preferences") or {}
    if not user_skills and prefs:
        user_skills = list(prefs.get("keywords") or []) + list(prefs.get("domains") or [])

    breakdown = get_skill_breakdown(user_skills, req_skills)
    matched = breakdown["matched"]
    missing = breakdown["missing"]

    if is_generic_feed:
        # Fallback scoring for poor profiles
        desc = job.get("description_text") or ""
        quality_score = 0.0
        if len(req_skills) > 0:
            quality_score += 10.0
        if len(desc) > 500:
            quality_score += 10.0

        fit_score = quality_score
        keyword_score = quality_score
        semantic_sim = 0.0
    else:
        profile_quality = assess_profile_quality(user)
        job_quality = assess_job_quality(job)
        keyword_score = calculate_match_score(job, user)

        user_embedding = user.get("cv_embedding")
        job_embedding = job.get("description_embedding")
        
        if user_embedding is not None and job_embedding is not None:
            semantic_sim = cosine_similarity(user_embedding, job_embedding)
        else:
            semantic_sim = 0.0
            
        fit_score = calculate_hybrid_score(keyword_score, semantic_sim, profile_quality, job_quality)

    r_bonus = recency_bonus(job)
    
    search_boost = 0.0
    if query_tokens and exact_priority:
        EXACT_BONUS = 18.0
        title = (job.get("title") or "").lower()
        skills = [s.lower() for s in req_skills]
        desc = (job.get("description_text") or "")[:1000].lower()
        bonus = 0.0
        for token in query_tokens:
            if token in title or any(token in s for s in skills):
                bonus += EXACT_BONUS
            elif token in desc:
                bonus += EXACT_BONUS * 0.4
        search_boost = min(bonus, EXACT_BONUS * len(query_tokens))

    rank_score = fit_score + r_bonus

    return {
        "keyword_score": keyword_score,
        "semantic_similarity": semantic_sim,
        "reranker_score": None,  # Computed later if rerank is enabled
        "recency_bonus": r_bonus,
        "search_boost": search_boost,
        "fit_score": round(min(100.0, fit_score), 1),
        "rank_score": rank_score,
        "matched_skills": matched,
        "missing_skills": missing
    }
