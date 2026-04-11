"""
LLM-powered job enrichment via OpenRouter.
Single structured call extracts skills, classification, location, and eligibility.
Replaces all rule-based extraction (extract_skills, extract_visa_info, categorize_experience).
Supports parallel execution via process_jobs_parallel().
"""
import os
import json
import time
import hashlib
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_client: Optional[OpenAI] = None

# --- Tuning Config (env-driven) ---
LLM_MAX_WORKERS = int(os.getenv("LLM_MAX_WORKERS", "5"))
LLM_TIMEOUT_SEC = int(os.getenv("LLM_TIMEOUT_SEC", "45"))
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "2"))
LLM_CACHE_ENABLED = os.getenv("LLM_CACHE_ENABLED", "true").lower() == "true"
LLM_CACHE_VERSION = os.getenv("LLM_CACHE_VERSION", "1")
LLM_PROGRESS_EVERY_N = int(os.getenv("LLM_PROGRESS_EVERY_N", "10"))
LLM_DESCRIPTION_MAX_CHARS = int(os.getenv("LLM_DESCRIPTION_MAX_CHARS", "6000"))


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY not set in environment")
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            timeout=LLM_TIMEOUT_SEC,
            max_retries=0,  # We handle rotation/retries ourselves
        )
    return _client


UNIFIED_PROMPT = """
Analyze this job posting. Return ONLY valid JSON, no markdown.

{{
  "skills": {{
    "required": ["canonical_skill"],
    "preferred": ["canonical_skill"]
  }},
  "classification": {{
    "category": "Engineering|Data & AI|DevOps & Cloud|Design & UX|Cybersecurity|Finance & Accounting|Customer Support|Product|Other",
    "subcategory": "e.g. Frontend, Backend, Mobile, Data Science, Data Engineering, ML/AI, BI, SRE",
    "experience_level": "intern|junior|mid|senior",
    "remote_type": "fully_remote|hybrid|onsite"
  }},
  "location": {{
    "city": "city name or null",
    "country_code": "2-letter ISO or null",
    "job_region": "{region_instruction}"
  }},
  "meta": {{
    "visa_sponsorship": true or false or null,
    "open_to_intl": true or false or null,
    "type": "permanent|fixed-term|internship|freelance|other"
  }},
  "eligibility": {{
    "excludes_morocco": true or false or null,
    "reason": "short reason if true, e.g. US work authorization required"
  }}
}}

Rules:
- Normalize: "ReactJS" -> "React", "Postgres" -> "PostgreSQL", "JS" -> "JavaScript"
- Normalize French terms: "Développeur" skills -> English canonical names
- lead/staff/principal/VP/director -> experience_level: "senior"
- "souhaité" / "un plus" / "nice to have" -> preferred array
- Only extract skills, not job duties
- For visa_sponsorship and open_to_intl: only set true/false if the job explicitly mentions it, otherwise null
- For job_region: infer from location/company/context if obvious, otherwise null
- CDI -> permanent, CDD -> fixed-term, Stage/Internship -> internship
- excludes_morocco: true if the job requires local work authorization (US, UK, EU, specific country), citizenship, or explicitly lists ineligible regions that include Morocco/Africa
- excludes_morocco: false if the job is explicitly open to international/remote applicants
- excludes_morocco: null if the posting doesn't mention eligibility at all

Job Title: {title}
Description: {description}
"""

# Option B: cheap primary + fallbacks (qwen → gemini-lite → haiku)
MODELS = [
    "qwen/qwen3.5-flash-02-23",
    "google/gemini-3.1-flash-lite-preview",
    "anthropic/claude-haiku-4-5",
]

# For domestic sources the region/country are known; exclude from LLM inference.
REGION_INSTRUCTION_GLOBAL = "MA|MENA|EU|NA|APAC|LATAM|GLOBAL|null"
REGION_INSTRUCTION_DOMESTIC = "already set by scraper, return null"


def _get_cache_key(title: str, description: str, is_domestic: bool) -> str:
    """
    Generate SHA-256 cache key.
    Inputs: title, description, is_domestic, prompt_hash, cache_version.
    """
    prompt_hash = hashlib.sha256(UNIFIED_PROMPT.encode("utf-8")).hexdigest()[:16]
    payload = f"T:{title.strip().lower()}|D:{description[:LLM_DESCRIPTION_MAX_CHARS]}|DOM:{is_domestic}|PH:{prompt_hash}|V:{LLM_CACHE_VERSION}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _check_cache(cache_key: str) -> Optional[tuple[dict, str]]:
    """Return (result, model_id) if found in DB, else None."""
    if not LLM_CACHE_ENABLED:
        return None
    
    from processor import supabase
    if not supabase:
        return None
    
    try:
        res = supabase.table("llm_enrichment_cache").select("result, model_id").eq("cache_key", cache_key).execute()
        if res.data:
            return res.data[0]["result"], res.data[0]["model_id"]
    except Exception as e:
        print(f"  [Cache Error] Failed to read for {cache_key[:8]}: {e}")
    return None


def _update_cache(cache_key: str, result: dict, model_id: str):
    """Store result in DB enrichment cache."""
    if not LLM_CACHE_ENABLED:
        return
    
    from processor import supabase
    if not supabase:
        return
    
    try:
        supabase.table("llm_enrichment_cache").upsert({
            "cache_key": cache_key,
            "result": result,
            "model_id": model_id,
        }).execute()
    except Exception as e:
        print(f"  [Cache Error] Failed to write for {cache_key[:8]}: {e}")


def process_job(title: str, description: str, *, is_domestic: bool = False) -> tuple[dict, str, bool, int]:
    """
    Call OpenRouter LLM to extract structured data.
    Returns (result_dict, model_id, was_cache_hit, retries_used).
    """
    cache_key = _get_cache_key(title, description, is_domestic)
    cached = _check_cache(cache_key)
    if cached:
        return cached[0], cached[1], True, 0

    region_instruction = REGION_INSTRUCTION_DOMESTIC if is_domestic else REGION_INSTRUCTION_GLOBAL
    from data_cleaning import clean_description_for_llm
    prompt_text = UNIFIED_PROMPT.format(
        title=title,
        description=clean_description_for_llm(description, max_chars=LLM_DESCRIPTION_MAX_CHARS),
        region_instruction=region_instruction,
    )

    client = _get_client()
    last_error = None
    retries_count = 0

    # Model rotation loop (Qwen -> Gemini -> Haiku)
    for model in MODELS:
        # Retry logic for the SAME model before moving to fallback
        for attempt in range(LLM_MAX_RETRIES + 1):
            try:
                if attempt > 0:
                    retries_count += 1
                    time.sleep(1)  # short backoff

                response = client.chat.completions.create(
                    model=model,
                    max_tokens=1000,
                    temperature=0,
                    messages=[{"role": "user", "content": prompt_text}],
                    extra_headers={
                        "HTTP-Referer": "https://swipturn.app",
                        "X-Title": "SwipTurn Job Processor",
                    },
                )
                raw = response.choices[0].message.content.strip()
                if raw.startswith("```"):
                    raw = raw.split("```")[1].lstrip("json").strip()
                result = json.loads(raw)
                
                # Success: cache and return
                _update_cache(cache_key, result, model)
                return result, model, False, retries_count
                
            except (json.JSONDecodeError, KeyError, IndexError) as e:
                last_error = f"ParseError: {e}"
                break # Move to next model immediately for parse errors
            except Exception as e:
                last_error = f"APIError: {e}"
                # Retry same model if it's a network/timeout error
                continue

    raise RuntimeError(f"All LLM models failed for job '{title}': {last_error}")


def set_global_accessibility(job: dict, llm_result: dict) -> dict:
    """
    Derive globally_accessible from LLM eligibility extraction.

    Rules:
      excludes_morocco == True  → globally_accessible = False (logged)
      excludes_morocco == False → globally_accessible = True
      excludes_morocco == None  → globally_accessible = True (launch-safe default, logged as unknown)
    """
    eligibility = llm_result.get("eligibility") or {}
    excludes = eligibility.get("excludes_morocco")
    reason = eligibility.get("reason", "")

    if excludes is True:
        job["globally_accessible"] = False
        print(f"  [Eligibility] EXCLUDED from Morocco — {reason or 'no reason given'} | job={job.get('source_id') or job.get('title', '?')[:60]!r}")
    elif excludes is False:
        job["globally_accessible"] = True
    else:
        # excludes_morocco is None — posting doesn't mention eligibility
        job["globally_accessible"] = True  # launch-safe default
        print(f"  [Eligibility] UNKNOWN eligibility (excludes_morocco=null); defaulting to accessible | job={job.get('source_id') or job.get('title', '?')[:60]!r}")

    return job


# --- Allowed enum values for LLM output validation ---
_VALID_EXPERIENCE_LEVELS = {"intern", "junior", "mid", "senior"}
_VALID_REMOTE_TYPES = {"fully_remote", "hybrid", "onsite"}
_VALID_JOB_TYPES = {"permanent", "fixed-term", "internship", "freelance", "other"}
_VALID_CATEGORIES = {
    "Engineering", "Data & AI", "DevOps & Cloud", "Design & UX",
    "Cybersecurity", "Finance & Accounting", "Customer Support", "Product", "Other"
}

# Maximum skills stored per job to keep vectors clean and ranking reliable.
SKILL_CAP = 15


def _validate_llm_fields(fields: dict, title: str = "?") -> dict:
    """
    Validate and normalize LLM enum/category fields in-place.
    Invalid values are discarded (set to None) with a log line.
    Skill list is cleaned, deduped, and capped at SKILL_CAP.
    Preserves required→preferred ordering when merging skills.
    """
    label = title[:60]

    # experience_level
    lvl = fields.get("experience_level")
    if lvl is not None and lvl not in _VALID_EXPERIENCE_LEVELS:
        print(f"  [Validation] Discarded invalid experience_level={lvl!r} for {label!r}")
        fields["experience_level"] = None

    # remote_type
    rt = fields.get("remote_type")
    if rt is not None and rt not in _VALID_REMOTE_TYPES:
        print(f"  [Validation] Discarded invalid remote_type={rt!r} for {label!r}")
        fields["remote_type"] = None

    # job_type
    jt = fields.get("job_type")
    if jt is not None and jt not in _VALID_JOB_TYPES:
        print(f"  [Validation] Discarded invalid job_type={jt!r} for {label!r}")
        fields["job_type"] = None

    # category
    cat = fields.get("category")
    if cat is not None and cat not in _VALID_CATEGORIES:
        print(f"  [Validation] Discarded invalid category={cat!r} for {label!r}")
        fields["category"] = None

    # country_code: must be None or 2-letter uppercase ISO
    cc = fields.get("country_code")
    if cc is not None:
        cc_norm = cc.strip().upper() if isinstance(cc, str) else None
        if not cc_norm or len(cc_norm) != 2:
            print(f"  [Validation] Discarded invalid country_code={cc!r} for {label!r}")
            fields["country_code"] = None
        else:
            fields["country_code"] = cc_norm

    # skills: normalize whitespace, dedupe, cap
    raw_skills = fields.get("required_skills") or []
    cleaned = []
    seen_lower: set[str] = set()
    for s in raw_skills:
        s = (s or "").strip()
        if s and s.lower() not in seen_lower:
            seen_lower.add(s.lower())
            cleaned.append(s)

    if len(cleaned) > SKILL_CAP:
        print(
            f"  [Validation] Skill list trimmed {len(cleaned)} → {SKILL_CAP} for {label!r}"
        )
        cleaned = cleaned[:SKILL_CAP]

    fields["required_skills"] = cleaned
    return fields


def extract_fields_from_llm(llm_result: dict, title: str = "?") -> tuple[dict, list, list]:
    """
    Flatten LLM result into job payload fields, validate enums, and cap skills.
    Returns (fields_dict, required_skills_list, preferred_skills_list).

    Null-safety contract:
      - visa_sponsorship / open_to_intl keep their LLM value (true/false/null).
      - Only the LLM setting them explicitly to false produces False.
      - Unknown (null) stays None; do NOT coerce to False.
    """
    skills = llm_result.get("skills") or {}
    classification = llm_result.get("classification") or {}
    meta = llm_result.get("meta") or {}

    required = [s for s in (skills.get("required") or []) if s]
    preferred = [s for s in (skills.get("preferred") or []) if s]
    # Merge required first, then preferred — preserves importance order
    merged = list(dict.fromkeys(required + preferred))

    fields = {
        "required_skills": merged,
        "category": classification.get("category"),
        "subcategory": classification.get("subcategory"),
        "experience_level": classification.get("experience_level"),
        "remote_type": classification.get("remote_type"),
        # IMPORTANT: do NOT coerce None → False here.
        # None means "not mentioned"; False means "explicitly denied".
        "visa_sponsorship": meta.get("visa_sponsorship"),
        "open_to_intl": meta.get("open_to_intl"),
        "job_type": meta.get("type"),
    }

    fields = _validate_llm_fields(fields, title=title)

    # Reconstruct required/preferred after skill cap (required are the first N if cap was hit)
    capped = fields["required_skills"]
    req_capped = [s for s in capped if s in {x for x in required}]
    pref_capped = [s for s in capped if s not in {x for x in required}]

    return fields, req_capped, pref_capped


def _process_single_safe(job: dict) -> tuple[dict | None, str | None, bool, int]:
    """Wrapper that returns (result, model_used, was_cache_hit, retries)."""
    try:
        return process_job(
            job["title"],
            job["description"],
            is_domestic=job.get("is_domestic", False),
        )
    except Exception as e:
        print(f"  [LLM Worker] Failed for '{job.get('title', '?')[:60]}': {e}")
        return None, None, False, 0


def process_jobs_parallel(
    jobs: list[dict],
    *,
    max_workers: int = LLM_MAX_WORKERS,
) -> list[dict | None]:
    """
    Fire individual process_job() calls concurrently.
    Includes comprehensive batch logging and cache stats.
    """
    if not jobs:
        return []

    _get_client()
    total = len(jobs)
    start_time = time.time()
    print(f"[LLM Parallel] Processing {total} jobs (workers={max_workers}, cache={LLM_CACHE_ENABLED})...")

    # Metrics
    succeeded = 0
    failed = 0
    cache_hits = 0
    total_retries = 0
    model_usage = Counter()

    results = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # map() preserves order
        outcomes = list(executor.map(_process_single_safe, jobs))

    for i, (res, model, hit, retries) in enumerate(outcomes):
        results.append(res)
        total_retries += retries
        if res:
            succeeded += 1
            if hit:
                cache_hits += 1
            else:
                model_usage[model] += 1
        else:
            failed += 1

        # Periodic progress log
        if (i + 1) % LLM_PROGRESS_EVERY_N == 0 or (i + 1) == total:
            elapsed = time.time() - start_time
            print(f"  [LLM Progress] {i+1}/{total} ({(i+1)/total:.0%}) | Hits: {cache_hits} | OK: {succeeded - cache_hits} | ERR: {failed} | Time: {elapsed:.1f}s")

    elapsed = time.time() - start_time
    print(f"[LLM Batch Complete]")
    print(f"  - Total: {total} | Succeeded: {succeeded} | Failed: {failed}")
    print(f"  - Cache: {cache_hits} hits ({cache_hits/total:.1% if total else 0})")
    print(f"  - Retries: {total_retries} total retries")
    if model_usage:
        usage_str = ", ".join(f"{m}: {c}" for m, c in sorted(model_usage.items(), key=lambda x: -x[1]))
        print(f"  - Model Usage (misses): {usage_str}")
    print(f"  - Total Batch Time: {elapsed:.1f}s")

    return results
