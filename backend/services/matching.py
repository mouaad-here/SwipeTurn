import re
from typing import List, Dict, Any

def normalize_skill(skill: str) -> str:
    """Lowercase and remove special characters for consistent matching."""
    return re.sub(r'[^a-z0-9]', '', skill.lower())

def calculate_match_score(user_skills: List[str], job_skills: List[str]) -> float:
    """Returns a float between 0 and 100 representing the match percentage."""
    if not job_skills:
        return 40.0 # Neutral score if the job doesn't list specific requirements

    if not user_skills:
        return 0.0

    normalized_user = {normalize_skill(s) for s in user_skills}
    normalized_job = {normalize_skill(s) for s in job_skills}

    intersection = normalized_user.intersection(normalized_job)
    
    # Calculate percentage of job requirements met by the user
    score = (len(intersection) / len(normalized_job)) * 100
    return round(score, 1)

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
