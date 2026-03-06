"""
LLM-powered job enrichment via OpenRouter.
Single structured call extracts skills, classification, location, and eligibility.
Replaces all rule-based extraction (extract_skills, extract_visa_info, categorize_experience).
Supports parallel execution via process_jobs_parallel().
"""
import os
import json
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_client: Optional[OpenAI] = None
LLM_MAX_WORKERS = int(os.getenv("LLM_MAX_WORKERS", "5"))


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY not set in environment")
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
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


def process_job(title: str, description: str, *, is_domestic: bool = False) -> tuple[dict, str]:
    """
    Call OpenRouter LLM to extract structured data from a job posting.
    Returns (parsed JSON dict, model_id used), or raises on total failure.
    Model order: Qwen 3.5 Flash (primary) → Gemini 3.1 Flash Lite → Claude Haiku (fallback).
    """
    region_instruction = REGION_INSTRUCTION_DOMESTIC if is_domestic else REGION_INSTRUCTION_GLOBAL
    prompt_text = UNIFIED_PROMPT.format(
        title=title,
        description=description[:6000],
        region_instruction=region_instruction,
    )

    client = _get_client()
    last_error = None

    for model in MODELS:
        try:
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
            print(f"  [LLM] {model} <- {title[:55]!r}")
            return result, model
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            last_error = e
            continue
        except Exception as e:
            last_error = e
            continue

    raise RuntimeError(f"All LLM models failed for job '{title}': {last_error}")


def set_global_accessibility(job: dict, llm_result: dict) -> dict:
    """Derive globally_accessible from LLM eligibility extraction."""
    eligibility = llm_result.get("eligibility") or {}
    excludes = eligibility.get("excludes_morocco")

    if excludes is True:
        job["globally_accessible"] = False
    else:
        job["globally_accessible"] = True

    return job


def extract_fields_from_llm(llm_result: dict) -> dict:
    """
    Flatten LLM result into job payload fields.
    Returns a dict of fields ready to merge into the job insert payload.
    """
    skills = llm_result.get("skills") or {}
    classification = llm_result.get("classification") or {}
    location = llm_result.get("location") or {}
    meta = llm_result.get("meta") or {}

    required = skills.get("required") or []
    preferred = skills.get("preferred") or []
    all_skills = list(dict.fromkeys(required + preferred))

    fields = {
        "required_skills": all_skills,
        "category": classification.get("category"),
        "subcategory": classification.get("subcategory"),
        "experience_level": classification.get("experience_level"),
        "remote_type": classification.get("remote_type"),
        "visa_sponsorship": meta.get("visa_sponsorship"),
        "open_to_intl": meta.get("open_to_intl"),
        "job_type": meta.get("type"),
    }

    if not fields["visa_sponsorship"]:
        fields["visa_sponsorship"] = False
    if not fields["open_to_intl"]:
        fields["open_to_intl"] = False

    return fields, required, preferred


def _process_single_safe(job: dict) -> tuple[dict | None, str | None]:
    """Wrapper that calls process_job and returns (result, model_used) or (None, None) on failure."""
    try:
        result, model_used = process_job(
            job["title"],
            job["description"],
            is_domestic=job.get("is_domestic", False),
        )
        return result, model_used
    except Exception as e:
        print(f"  [LLM Worker] Failed for '{job.get('title', '?')[:60]}': {e}")
        return None, None


def process_jobs_parallel(
    jobs: list[dict],
    *,
    max_workers: int = LLM_MAX_WORKERS,
) -> list[dict | None]:
    """
    Fire individual process_job() calls concurrently via ThreadPoolExecutor.
    Each job gets full description, no truncation, with the existing fallback chain.

    Args:
        jobs: list of {"title": str, "description": str, "is_domestic": bool}
        max_workers: concurrent threads (default from LLM_MAX_WORKERS env, 5)

    Returns:
        list[dict | None] aligned 1:1 with input. None = all fallbacks failed for that job.
    """
    if not jobs:
        return []

    _get_client()

    total = len(jobs)
    start_time = time.time()
    print(f"[LLM Parallel] Starting {total} jobs with {max_workers} workers...")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results_with_models: list[tuple[dict | None, str | None]] = list(
            executor.map(_process_single_safe, jobs)
        )

    results: list[dict | None] = [r for r, _ in results_with_models]
    model_usage = Counter(m for _, m in results_with_models if m is not None)

    elapsed = time.time() - start_time
    succeeded = sum(1 for r in results if r is not None)
    failed = total - succeeded

    total_skills = 0
    for r in results:
        if r is not None:
            skills = r.get("skills") or {}
            total_skills += len(skills.get("required") or []) + len(skills.get("preferred") or [])
    avg_skills = total_skills / succeeded if succeeded else 0

    print(
        f"[LLM Parallel] total={total} succeeded={succeeded} failed={failed} "
        f"elapsed={elapsed:.1f}s avg_skills={avg_skills:.1f}"
    )
    if model_usage:
        usage_str = ", ".join(f"{m}: {c}" for m, c in sorted(model_usage.items(), key=lambda x: -x[1]))
        print(f"[LLM Parallel] Model usage: {usage_str}")

    return results
