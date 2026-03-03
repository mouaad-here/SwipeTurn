import re
import json
from typing import List, Dict, Any, Optional

import numpy as np

def normalize_skill(skill: str) -> str:
    """Lowercase and remove special characters for consistent matching."""
    return re.sub(r'[^a-z0-9]', '', skill.lower())

def cosine_similarity(v1, v2):
    """Calculates cosine similarity between two vectors, handling list or string input."""
    if v1 is None or v2 is None:
        return 0.0
        
    try:
        # If input is a string (e.g. from Supabase text column or malformed JSON), parse it
        if isinstance(v1, str):
            v1 = json.loads(v1)
        if isinstance(v2, str):
            v2 = json.loads(v2)
            
        v1 = np.array(v1, dtype=float)
        v2 = np.array(v2, dtype=float)
        
        if np.linalg.norm(v1) == 0 or np.linalg.norm(v2) == 0:
            return 0.0
            
        return float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2)))
    except Exception as e:
        print(f"Error calculating cosine similarity: {e}")
        return 0.0

def calculate_match_score(
    user_skills: List[str], 
    job_skills: List[str], 
    user_seniority: str = "mid", 
    job_seniority: str = "mid",
    user_embedding: Optional[List[float]] = None,
    job_embedding: Optional[List[float]] = None,
    user_preferences: Optional[Dict[str, Any]] = None,
    job_location: str = "",
    job_city: Optional[str] = None,
) -> float:
    """
    Calculates a hybrid match score (0-100).
    Hybrid = 60% Vector Similarity + 20% Skill Match + 20% Seniority influence.
    Applies bonuses based on explicit user preferences (Intents).
    """
    # 1. Skill Match Score (20% influence when embeddings present)
    if not job_skills:
        skill_score = 100.0
    elif not user_skills:
        skill_score = 0.0
    else:
        normalized_user = {normalize_skill(s) for s in user_skills}
        normalized_job = {normalize_skill(s) for s in job_skills}
        intersection = normalized_user.intersection(normalized_job)
        
        match_ratio = len(intersection) / len(normalized_job)
        skill_score = (match_ratio ** 1.2) * 100

    # 2. Vector Similarity Score (60% influence when embeddings present)
    vector_sim = cosine_similarity(user_embedding, job_embedding)
    vector_score = vector_sim * 100
    
    # 3. Seniority weighting logic (20% influence)
    seniority_base = 100.0
    
    user_sen_lower = str(user_seniority or "mid").lower()
    job_sen_lower = str(job_seniority or "mid").lower()
    
    if user_sen_lower == "student":
        if any(s in job_sen_lower for s in ["intern", "pfe", "stage", "stagiaire"]):
            seniority_base = 100.0 
        elif any(s in job_sen_lower for s in ["senior", "lead", "architect", "manager"]):
            seniority_base = 25.0
        else:
            seniority_base = 70.0 
    else:
        seniority_map = {"junior": 1, "mid": 2, "senior": 3, "lead": 4, "senior_lead": 5}
        u_val = seniority_map.get(user_sen_lower, 2)
        j_val = seniority_map.get(job_sen_lower, 2)
        
        diff = u_val - j_val
        if diff < 0:
            seniority_base = max(40.0, 100.0 + (diff * 15))
        elif diff > 1:
            seniority_base = 90.0
        else:
            seniority_base = 100.0

    # Confidence-aware hybrid scoring profile.
    # High confidence: good embedding signal + enough extracted skills.
    has_embeddings = bool(user_embedding) and bool(job_embedding)
    strong_vector_signal = vector_sim >= 0.18
    strong_skill_signal = len(job_skills or []) >= 3

    if has_embeddings and strong_vector_signal and strong_skill_signal:
        # High confidence
        final_score = (0.65 * vector_score) + (0.20 * skill_score) + (0.15 * seniority_base)
    elif has_embeddings:
        # Medium confidence
        final_score = (0.45 * vector_score) + (0.35 * skill_score) + (0.20 * seniority_base)
    else:
        # Low confidence fallback
        final_score = (0.70 * skill_score) + (0.30 * seniority_base)

    # 4. User Intent Bonuses (Boost scores based on explicit preferences)
    intent_bonus = 0.0
    if user_preferences:
        # Boost for geography match (audit: also consider job_city for Morocco)
        user_geog = str(user_preferences.get("geography", "")).lower()
        job_loc_lower = str(job_location or "").lower()
        job_city_str = (job_city or "").strip()
        
        if user_geog == "morocco":
            if "morocco" in job_loc_lower or "maroc" in job_loc_lower:
                intent_bonus += 10.0
            if job_city_str:
                intent_bonus += 2.0
        elif user_geog == "global":
            if "remote" in job_loc_lower or "anywhere" in job_loc_lower:
                intent_bonus += 10.0

        # Boost for keyword match (Role Intent)
        keywords = user_preferences.get("keywords", [])
        if keywords:
            # Check if any preference keywords appear in job skills
            norm_job_skills = [normalize_skill(s) for s in job_skills]
            for kw in keywords:
                if normalize_skill(kw) in norm_job_skills:
                    intent_bonus += 5.0 # Extra points if job matches an explicit keyword interest
                    break

    final_score += intent_bonus

    return round(max(0.0, min(100.0, final_score)), 1)

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
            # Return the originally properly capitalized user skill
            matched.append(normalized_user_map[norm_req])
        else:
            # Return the required skill
            missing.append(req)
            
    return {
        "matched": matched,
        "missing": missing
    }
