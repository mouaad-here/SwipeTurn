import os
import json
import re
import html
import difflib
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
# Service role key bypasses RLS; required for pipeline inserts. Anon key will fail with RLS enabled.
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None
    print("WARNING: Supabase URL or Key not set. DB inserts will fail.")

OPEN_TO_INTL_KEYWORDS = [
    "open to international", "worldwide", "any nationality",
    "global candidates", "all nationalities", "international applicants",
    "moroccan", "morocco", "north africa", "afrique du nord",
    "mena", "maghreb", "maroc", "no visa required",
    "remote worldwide", "100% remote"
]

VISA_SPONSORSHIP_KEYWORDS = [
    "visa sponsorship", "sponsor work permit", "relocation package",
    "work permit provided", "visa provided", "tier 2 sponsor",
    "h-1b sponsor", "we sponsor", "relocation assistance"
]

SENIORITY_RULES = {
    "student": [
        "intern", "internship", "stage", "stagiaire", "apprenti",
        "apprentice", "graduate", "new grad", "new graduate",
        "entry level", "entry-level", "fresh graduate",
        "trainee", "bootcamp", "co-op", "coop",
    ],
    "junior": [
        "junior", " jr ", "jr.", "(jr)", "associate engineer",
        "associate developer", "associate software",
        "1-2 years", "1-3 years", "0-2 years", "débutant",
    ],
    "mid": [
        "mid-level", "mid level", "midlevel",
        "engineer ii", "engineer 2", "swe ii", "swe2",
        "software engineer ii", "software engineer 2",
        "level ii", "level 2",
        "intermediate", "confirmed", "confirmé",
        "2-4 years", "3-5 years",
    ],
    "senior": [
        "senior", " sr.", "sr ", "(sr)", "/ sr",
        "lead ", "tech lead", "team lead",
        "principal", "staff engineer", "staff software",
        "architect", "head of", "director", " vp ", "vp,",
        "engineer iii", "engineer iv", "engineer v",
        "engineer 3", "engineer 4", "engineering manager",
        "group product manager",
        "7+ years", "8+ years", "10+ years",
    ],
}

SKILLS_LIST = [
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust", "php", "ruby", "swift", "kotlin",
    "react", "angular", "vue", "next.js", "nuxt", "svelte", "react native", "flutter",
    "node.js", "express", "django", "flask", "fastapi", "spring boot", "laravel", "ruby on rails",
    "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra", "dynamodb",
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions",
    "machine learning", "deep learning", "nlp", "computer vision", "tensorflow", "pytorch", "scikit-learn",
    "data science", "data engineering", "pandas", "numpy", "spark", "hadoop",
    "html", "css", "tailwind css", "sass", "graphql", "rest api", "grpc", "rabbitmq", "kafka",
    "figma", "ui/ux", "product management", "agile", "scrum", "jira"
]

SKILL_ALIASES = {
    "js": "javascript",
    "ts": "typescript",
    "nodejs": "node.js",
    "node": "node.js",
    "postgres": "postgresql",
    "k8s": "kubernetes",
    "tf": "terraform",
    "rn": "react native",
    "py": "python",
    "ml": "machine learning",
    "ai": "machine learning",
}

SKILL_SECTIONS = (
    "requirements", "required skills", "must have", "nice to have",
    "qualifications", "competences", "compétences", "skills", "stack",
    "profil recherché", "profile", "technologies",
)


def _normalize_skill_name(skill: str) -> str:
    s = (skill or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return SKILL_ALIASES.get(s, s)


def _extract_sectioned_text(text: str) -> str:
    lower = text.lower()
    extracted = []
    for label in SKILL_SECTIONS:
        idx = lower.find(label)
        if idx == -1:
            continue
        chunk = text[idx:idx + 420]
        extracted.append(chunk)
    return "\n".join(extracted)


def extract_skills(text: str) -> list[str]:
    """Auto-extract known tech keywords from text with section-aware boost."""
    if not text:
        return []
    
    found_skills = set()
    text_lower = text.lower()
    focus_text = _extract_sectioned_text(text)
    combined = f"{text_lower}\n{focus_text.lower()}".strip()
    
    for skill in SKILLS_LIST:
        # Use simple boundary matching to avoid matching partial words
        pattern = r'\b' + re.escape(skill) + r'\b'
        if re.search(pattern, combined):
            found_skills.add(_normalize_skill_name(skill))

    # Small n-gram style pass for common terms often missed in mixed formatting
    raw_tokens = re.split(r"[^a-zA-Z0-9\+\#\.\-/]+", combined)
    for tok in raw_tokens:
        if not tok:
            continue
        normalized = _normalize_skill_name(tok)
        if normalized in SKILLS_LIST:
            found_skills.add(normalized)

    return sorted(found_skills)

def extract_visa_info(text: str) -> dict:
    """Parse description for visa_sponsorship and open_to_intl flags."""
    if not text:
        return {"visa_sponsorship": False, "open_to_intl": False}
        
    text_lower = text.lower()
    
    visa_sponsorship = any(kw in text_lower for kw in VISA_SPONSORSHIP_KEYWORDS)
    open_to_intl = any(kw in text_lower for kw in OPEN_TO_INTL_KEYWORDS)
    
    return {
        "visa_sponsorship": visa_sponsorship,
        "open_to_intl": open_to_intl
    }

def categorize_experience(title: str, description: str) -> str | None:
    """
    Returns student | junior | mid | senior | None.
    None means no signal found — do NOT default to senior.
    Title is the highest-confidence signal; description is fallback.
    """
    title_lower = (" " + (title or "").lower() + " ")

    # Check title first (most reliable)
    for level in ["student", "junior", "mid", "senior"]:
        if any(kw in title_lower for kw in SENIORITY_RULES[level]):
            return level

    # Fallback to description — first 1500 chars only
    desc_lower = (" " + (description or "").lower()[:1500] + " ")
    for level in ["student", "junior", "mid", "senior"]:
        if any(kw in desc_lower for kw in SENIORITY_RULES[level]):
            return level

    return None  # no default, no assumption


def _normalize_text_for_dedup(value: str | None) -> str:
    if not value:
        return ""
    v = value.lower().strip()
    v = re.sub(r"[^a-z0-9\s]", " ", v)
    v = re.sub(r"\s+", " ", v).strip()
    return v


def is_likely_duplicate(new_job: dict, existing_jobs: list[dict]) -> bool:
    """
    Cross-source fuzzy dedup based on normalized company + similar title.
    Checks recently inserted jobs to avoid duplicate remote listings.
    """
    new_company = _normalize_text_for_dedup(new_job.get("company"))
    new_title = _normalize_text_for_dedup(new_job.get("title"))
    new_source = (new_job.get("source") or "").lower().strip()
    dedup_sources = {"remoteok", "remotive", "weworkremotely", "jobicy", "jsearch", "greenhouse", "lever"}
    if new_source and new_source not in dedup_sources:
        return False
    if not new_company or not new_title:
        return False

    for existing in existing_jobs:
        ex_source = (existing.get("source") or "").lower().strip()
        if ex_source and ex_source not in dedup_sources:
            continue
        ex_company = _normalize_text_for_dedup(existing.get("company"))
        ex_title = _normalize_text_for_dedup(existing.get("title"))
        if not ex_company or not ex_title:
            continue

        if new_company != ex_company:
            continue

        if new_title == ex_title:
            return True

        ratio = difflib.SequenceMatcher(None, new_title, ex_title).ratio()
        if ratio >= 0.93:
            return True

    return False


def build_job_profile_text(
    title: str,
    required_skills: list[str],
    experience_level: Optional[str],
    description: str,
) -> str:
    """
    Build compact job profile text for stable embedding quality.
    """
    skills_text = ", ".join(required_skills[:25])
    level = experience_level or "unspecified"
    desc = (description or "").strip()
    # Keep core signal, avoid boilerplate overflow.
    desc_snippet = desc[:1800]
    return (
        f"Role: {title}. "
        f"Required skills: {skills_text}. "
        f"Experience level: {level}. "
        f"Job details: {desc_snippet}"
    ).strip()

def process_jobs(raw_jobs: list[dict], model) -> dict:
    """
    Process and insert jobs into the database.

    Performance optimisations applied here:
    - model is loaded ONCE outside this function and passed in.
    - Two DB queries upfront replace N per-job queries (batch existence check
      + single dedup window fetch).
    - model.encode() is called ONCE on all candidate texts as a batch.
    """
    if not supabase:
        print("Error: Supabase client not initialized")
        return {"new": 0, "skipped": len(raw_jobs)}

    from data_cleaning import (
        normalize_location,
        strip_html,
        parse_posted_at,
        normalize_expires_at,
        job_region_from_location_and_source,
        extract_city_country,
        categorize_experience_strict,
    )
    from dateutil import parser as date_parser

    new_count = 0
    skipped_count = 0
    skills_fallback_count = 0
    skills_extracted_count = 0

    now = datetime.utcnow()
    scraped_at_iso = now.isoformat()
    now_iso = now.isoformat()

    # --- BATCH QUERY 1: existence check for this whole batch ---
    # Chunked into ≤100 IDs per query to stay under PostgREST's URL length limit.
    # Passing 2000+ IDs in one .in_() call creates a URL > 20 KB which triggers
    # a 400 "JSON could not be generated" error from Supabase.
    source_ids = [str(j.get('source_id')) for j in raw_jobs if j.get('source_id')]
    existing_source_ids: set[str] = set()
    CHUNK = 100
    for i in range(0, len(source_ids), CHUNK):
        chunk = source_ids[i: i + CHUNK]
        res = (
            supabase.table("jobs")
            .select("source_id")
            .in_("source_id", chunk)
            .execute()
        )
        existing_source_ids.update(r["source_id"] for r in (res.data or []))

    # --- BATCH QUERY 2: recent jobs for fuzzy dedup (1 query, replaces N) ---
    dedup_window_start = (now - timedelta(days=7)).isoformat()
    recent_res = (
        supabase.table("jobs")
        .select("company,title,source")
        .gte("posted_at", dedup_window_start)
        .limit(2000)
        .execute()
    )
    recent_jobs_cache = recent_res.data or []
    print(
        f"Dedup cache loaded: {len(existing_source_ids)} existing IDs, "
        f"{len(recent_jobs_cache)} recent jobs for fuzzy check."
    )

    # --- PASS 1: filter & build payloads without embeddings yet ---
    pending = []  # list of (payload, exp_level, embedding_text)
    seen_in_batch: set[str] = set()  # guard against scrapers returning duplicates within one batch

    for job in raw_jobs:
        try:
            apply_url = (job.get('apply_url') or '').strip()
            if not apply_url or not apply_url.startswith(('http://', 'https://')):
                skipped_count += 1
                continue

            sid = str(job.get('source_id') or '')
            if sid in existing_source_ids or sid in seen_in_batch:
                skipped_count += 1
                continue
            seen_in_batch.add(sid)

            title = html.unescape((job.get('title') or 'Unknown Title').strip())
            company = (job.get('company') or 'Unknown Company').strip()

            raw_desc = str(job.get('description', '')).strip()
            raw_desc = strip_html(raw_desc) if raw_desc else ""
            if not raw_desc or len(raw_desc) < 20:
                raw_desc = f"Job opportunity for {title} at {company}. This is an active hiring position."

            req_skills = job.get('required_skills') or job.get('skills_hint') or []
            if not req_skills or not isinstance(req_skills, list):
                req_skills = extract_skills(title + " " + raw_desc)
            if isinstance(req_skills, list) and len(req_skills) <= 2:
                extra = extract_skills(title + " " + raw_desc)
                req_skills = list(dict.fromkeys(list(req_skills) + extra))
            if not req_skills:
                req_skills = ["communication", "teamwork"]
                skills_fallback_count += 1
            else:
                skills_extracted_count += len(req_skills)

            full_text = f"{title} {raw_desc}"
            visa_info = extract_visa_info(full_text)

            posted_at_iso, default_expires_iso = parse_posted_at(job.get('posted_at'), now_iso)
            expires_at_iso = normalize_expires_at(job.get('expires_at'), posted_at_iso) or default_expires_iso
            if expires_at_iso == posted_at_iso:
                try:
                    dt = date_parser.parse(posted_at_iso)
                    expires_at_iso = (dt + timedelta(days=60)).isoformat()
                except Exception:
                    expires_at_iso = (now + timedelta(days=60)).isoformat()

            logo_url_val = job.get('company_logo_url') or job.get('logo_url')
            if not logo_url_val or not isinstance(logo_url_val, str) or len(logo_url_val) < 5:
                logo_url_val = None

            loc_normalized = normalize_location(job.get('location'))
            scraper_city = job.get('city')
            scraper_country = job.get('country_code')
            if scraper_city is not None or scraper_country is not None:
                city = scraper_city
                country_code = scraper_country
            else:
                city, country_code = extract_city_country(loc_normalized, job.get("source"))

            payload = {
                "title": title,
                "company": company,
                "company_logo_url": logo_url_val,
                "location": loc_normalized,
                "is_remote": bool(job.get('is_remote', False)),
                "type": job.get('type', 'full-time'),
                "description_text": raw_desc[:5000] if raw_desc else None,
                "required_skills": req_skills,
                "visa_sponsorship": bool(job.get('visa_sponsorship', visa_info['visa_sponsorship'])),
                "open_to_intl": bool(job.get('open_to_intl', visa_info['open_to_intl'])),
                "apply_url": apply_url,
                "apply_email": job.get('apply_email'),
                "source": job.get('source', 'unknown'),
                "source_id": str(job.get('source_id')),
                "posted_at": posted_at_iso,
                "scraped_at": scraped_at_iso,
                "is_active": True,
                "expires_at": expires_at_iso,
            }
            payload["job_region"] = job_region_from_location_and_source(loc_normalized, job.get("source"))
            if city is not None:
                payload["city"] = city
            if country_code is not None:
                payload["country_code"] = country_code
            if job.get('remote_type'):
                payload["remote_type"] = job.get('remote_type')

            # Fuzzy dedup against in-memory cache — no extra DB round-trip
            if is_likely_duplicate(
                {"company": company, "title": title, "source": job.get("source")},
                recent_jobs_cache,
            ):
                skipped_count += 1
                continue

            exp_level = job.get('gh_level') or job.get('experience_level_hint')
            if exp_level is None:
                exp_level = categorize_experience_strict(title, raw_desc)

            embedding_text = build_job_profile_text(
                title=title,
                required_skills=req_skills,
                experience_level=exp_level,
                description=raw_desc,
            )
            pending.append((payload, exp_level, embedding_text))

        except Exception as e:
            print(f"Error preparing job {job.get('source_id')}: {e}")
            skipped_count += 1

    print(
        f"Skill extraction stats: extracted={skills_extracted_count}, "
        f"fallback={skills_fallback_count}"
    )

    if not pending:
        return {"new": new_count, "skipped": skipped_count}

    # --- BATCH ENCODE: all texts in one model call ---
    texts = [emb_text for _, _, emb_text in pending]
    print(f"Batch-encoding {len(texts)} jobs...")
    vectors = model.encode(texts, batch_size=64, show_progress_bar=False)
    print("Batch encoding done.")

    # --- PASS 2: attach embeddings and insert ---
    for (payload, exp_level, _), vector in zip(pending, vectors):
        try:
            payload['description_embedding'] = vector.tolist()
            payload['experience_level'] = exp_level
            supabase.table('jobs').insert(payload).execute()
            print(f"[OK] Inserted job {payload.get('source_id')} with ML embeddings.")
            new_count += 1
        except Exception as e:
            print(f"Error inserting job {payload.get('source_id')}: {e}")
            skipped_count += 1

    return {"new": new_count, "skipped": skipped_count}

def deactivate_expired():
    """Marks is_active = false for expired jobs"""
    if not supabase:
        return
        
    try:
        now_iso = datetime.utcnow().isoformat()
        response = supabase.table('jobs') \
            .update({"is_active": False}) \
            .lt('expires_at', now_iso) \
            .eq('is_active', True) \
            .execute()
            
        deactivated = len(response.data) if response.data else 0
        print(f"Deactivated {deactivated} expired jobs.")
    except Exception as e:
        print(f"Error deactivating expired jobs: {e}")

if __name__ == "__main__":
    # Test skill extraction
    sample = "We are looking for a Python and React developer. Must know TypeScript."
    print("Skills:", extract_skills(sample))
    
    # Test visa extraction
    sample_visa = "We offer visa sponsorship and relocation assistance for global candidates."
    print("Visa:", extract_visa_info(sample_visa))
