import os
import re
import html
import difflib
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None
    print("WARNING: Supabase URL or Key not set. DB inserts will fail.")

DOMESTIC_SOURCES = {"rekrute", "stagiaires"}


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
    """Build compact job profile text for embedding. Prefixed for E5 model."""
    skills_text = ", ".join(required_skills[:25])
    level = experience_level or "unspecified"
    desc_snippet = (description or "").strip()[:1800]
    return (
        f"passage: Role: {title}. "
        f"Required skills: {skills_text}. "
        f"Experience level: {level}. "
        f"Job details: {desc_snippet}"
    ).strip()


def _write_job_skills(job_id: str, required: list[str], preferred: list[str]):
    """Dual-write normalized skills to the job_skills table."""
    if not supabase or not job_id:
        return
    rows = []
    seen = set()
    for skill in required:
        s = (skill or "").strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            rows.append({"job_id": job_id, "skill": s, "is_required": True})
    for skill in preferred:
        s = (skill or "").strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            rows.append({"job_id": job_id, "skill": s, "is_required": False})
    if rows:
        try:
            supabase.table("job_skills").insert(rows).execute()
        except Exception as e:
            print(f"  Warning: job_skills insert failed for {job_id}: {e}")


def process_jobs(raw_jobs: list[dict], model) -> dict:
    """
    Process and insert jobs into the database.
    Uses LLM enrichment for skill extraction, classification, and eligibility.
    Embedding model: intfloat/multilingual-e5-small (384-dim, multilingual).
    """
    if not supabase:
        print("Error: Supabase client not initialized")
        return {"new": 0, "enriched": 0, "skipped": len(raw_jobs)}

    from data_cleaning import (
        normalize_location,
        strip_html,
        parse_posted_at,
        normalize_expires_at,
        job_region_from_location_and_source,
        extract_city_country,
    )
    from llm_enrichment import process_jobs_parallel, set_global_accessibility, extract_fields_from_llm
    from dateutil import parser as date_parser

    new_count = 0
    enriched_count = 0
    skipped_count = 0
    llm_success = 0
    llm_fail = 0

    now = datetime.utcnow()
    scraped_at_iso = now.isoformat()
    now_iso = now.isoformat()

    # --- BATCH QUERY 1: existence check + category (to find existing jobs that need LLM enrichment) ---
    source_ids = [str(j.get("source_id")).strip() for j in raw_jobs if j.get("source_id")]
    existing_jobs_map: dict[str, dict] = {}  # source_id -> {id, category}
    CHUNK = 30
    for i in range(0, len(source_ids), CHUNK):
        chunk = source_ids[i : i + CHUNK]
        try:
            res = (
                supabase.table("jobs")
                .select("id, source_id, category")
                .in_("source_id", chunk)
                .execute()
            )
            for r in res.data or []:
                sid = (r.get("source_id") or "")
                sid = sid.strip() if isinstance(sid, str) else str(sid).strip()
                if sid:
                    existing_jobs_map[sid] = {"id": r.get("id"), "category": r.get("category")}
        except Exception as e:
            print(f"  Warning: existence check failed for chunk ({e}); treating as no matches.")

    # --- BATCH QUERY 2: recent jobs for fuzzy dedup ---
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
        f"Dedup cache loaded: {len(existing_jobs_map)} existing IDs, "
        f"{len(recent_jobs_cache)} recent jobs for fuzzy check."
    )

    # --- STAGE A: filter/dedup, collect new candidates + existing jobs that need LLM (category null) ---
    candidates = []
    update_candidates = []  # existing rows to enrich: same shape + db_job_id
    seen_in_batch: set[str] = set()
    skip_no_url = 0
    skip_dup_id = 0
    skip_fuzzy = 0
    to_enrich = 0

    for job in raw_jobs:
        try:
            apply_url = (job.get('apply_url') or '').strip()
            if not apply_url or not apply_url.startswith(('http://', 'https://')):
                skip_no_url += 1
                skipped_count += 1
                continue

            sid = str(job.get("source_id") or "").strip()
            if sid in seen_in_batch:
                skip_dup_id += 1
                skipped_count += 1
                continue

            title = html.unescape((job.get('title') or 'Unknown Title').strip())
            company = (job.get('company') or 'Unknown Company').strip()

            raw_desc = str(job.get('description', '')).strip()
            raw_desc = strip_html(raw_desc) if raw_desc else ""
            if not raw_desc or len(raw_desc) < 20:
                raw_desc = f"Job opportunity for {title} at {company}. This is an active hiring position."

            existing = existing_jobs_map.get(sid)
            if existing is not None:
                # Already in DB: skip if already enriched, else add to update_candidates for LLM + update
                cat = existing.get("category")
                if cat is not None and str(cat).strip() != "":
                    skip_dup_id += 1
                    skipped_count += 1
                    continue
                seen_in_batch.add(sid)
                source_name = (job.get("source") or "unknown").lower().strip()
                is_domestic = source_name in DOMESTIC_SOURCES
                update_candidates.append({
                    "title": title,
                    "company": company,
                    "raw_desc": raw_desc,
                    "source_name": source_name,
                    "is_domestic": is_domestic,
                    "job": job,
                    "apply_url": apply_url,
                    "db_job_id": existing["id"],
                })
                to_enrich += 1
                continue

            if is_likely_duplicate(
                {"company": company, "title": title, "source": job.get("source")},
                recent_jobs_cache,
            ):
                skip_fuzzy += 1
                skipped_count += 1
                continue

            seen_in_batch.add(sid)
            source_name = (job.get("source") or "unknown").lower().strip()
            is_domestic = source_name in DOMESTIC_SOURCES

            candidates.append({
                "title": title,
                "company": company,
                "raw_desc": raw_desc,
                "source_name": source_name,
                "is_domestic": is_domestic,
                "job": job,
                "apply_url": apply_url,
            })
        except Exception as e:
            print(f"Error filtering job {job.get('source_id')}: {e}")
            skipped_count += 1

    print(f"Stage A: {len(candidates)} new candidates, {len(update_candidates)} existing to enrich ({skipped_count} skipped)")
    if skipped_count > 0 or to_enrich > 0:
        print(f"  Skip reasons: no/invalid apply_url={skip_no_url}, duplicate source_id={skip_dup_id}, fuzzy_dup={skip_fuzzy}")

    # --- STAGE B: parallel LLM enrichment (new candidates + existing to enrich) ---
    all_for_llm = candidates + update_candidates
    llm_inputs = [
        {"title": c["title"], "description": c["raw_desc"], "is_domestic": c["is_domestic"]}
        for c in all_for_llm
    ]
    llm_results = process_jobs_parallel(llm_inputs)
    n_new = len(candidates)
    llm_results_new = llm_results[:n_new]
    llm_results_update = llm_results[n_new:]

    # --- STAGE C: build payloads from candidates + LLM results (insert and update) ---
    pending = []  # list of (payload, embedding_text, required_skills, preferred_skills)
    pending_updates = []  # list of (payload, embedding_text, required_skills, preferred_skills, db_job_id)

    for candidate, llm_result in zip(candidates, llm_results_new):
        try:
            job = candidate["job"]
            title = candidate["title"]
            company = candidate["company"]
            raw_desc = candidate["raw_desc"]
            is_domestic = candidate["is_domestic"]
            apply_url = candidate["apply_url"]

            if llm_result is not None:
                llm_fields, required_skills, preferred_skills = extract_fields_from_llm(llm_result)
                llm_success += 1
            else:
                llm_fields = {}
                required_skills = []
                preferred_skills = []
                llm_fail += 1

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

            if is_domestic:
                job_region = "MA"
                country_code = country_code or "MA"
            else:
                llm_location = (llm_result.get("location") or {}) if llm_result else {}
                job_region = llm_location.get("job_region") or job_region_from_location_and_source(loc_normalized, job.get("source"))
                if not city and llm_location.get("city"):
                    city = llm_location["city"]
                if not country_code and llm_location.get("country_code"):
                    country_code = llm_location["country_code"]

            payload = {
                "title": title,
                "company": company,
                "company_logo_url": logo_url_val,
                "is_remote": bool(job.get('is_remote', False)),
                "type": job.get('type', 'full-time'),
                "description_text": raw_desc[:5000] if raw_desc else None,
                "required_skills": llm_fields.get("required_skills") or [],
                "visa_sponsorship": llm_fields.get("visa_sponsorship", False),
                "open_to_intl": llm_fields.get("open_to_intl", False),
                "apply_url": apply_url,
                "apply_email": job.get('apply_email'),
                "source": job.get('source', 'unknown'),
                "source_id": str(job.get('source_id')),
                "posted_at": posted_at_iso,
                "scraped_at": scraped_at_iso,
                "is_active": True,
                "expires_at": expires_at_iso,
                "job_region": job_region,
                "category": llm_fields.get("category"),
                "subcategory": llm_fields.get("subcategory"),
                "experience_level": llm_fields.get("experience_level"),
                "job_type": llm_fields.get("job_type"),
                "globally_accessible": True,
            }

            if city is not None:
                payload["city"] = city
            if country_code is not None:
                payload["country_code"] = country_code
            if llm_fields.get("remote_type"):
                payload["remote_type"] = llm_fields["remote_type"]
            elif job.get('remote_type'):
                payload["remote_type"] = job.get('remote_type')

            if llm_result is not None:
                set_global_accessibility(payload, llm_result)

            embedding_text = build_job_profile_text(
                title=title,
                required_skills=payload["required_skills"],
                experience_level=payload["experience_level"],
                description=raw_desc,
            )
            pending.append((payload, embedding_text, required_skills, preferred_skills))

        except Exception as e:
            print(f"Error building payload for {candidate['job'].get('source_id')}: {e}")
            skipped_count += 1

    # Build payloads for existing jobs to enrich (same logic, append to pending_updates with db_job_id)
    for candidate, llm_result in zip(update_candidates, llm_results_update):
        try:
            job = candidate["job"]
            title = candidate["title"]
            company = candidate["company"]
            raw_desc = candidate["raw_desc"]
            is_domestic = candidate["is_domestic"]
            apply_url = candidate["apply_url"]
            db_job_id = candidate["db_job_id"]

            if llm_result is not None:
                llm_fields, required_skills, preferred_skills = extract_fields_from_llm(llm_result)
                llm_success += 1
            else:
                llm_fields = {}
                required_skills = []
                preferred_skills = []
                llm_fail += 1

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

            if is_domestic:
                job_region = "MA"
                country_code = country_code or "MA"
            else:
                llm_location = (llm_result.get("location") or {}) if llm_result else {}
                job_region = llm_location.get("job_region") or job_region_from_location_and_source(loc_normalized, job.get("source"))
                if not city and llm_location.get("city"):
                    city = llm_location["city"]
                if not country_code and llm_location.get("country_code"):
                    country_code = llm_location["country_code"]

            payload = {
                "title": title,
                "company": company,
                "company_logo_url": logo_url_val,
                "is_remote": bool(job.get('is_remote', False)),
                "type": job.get('type', 'full-time'),
                "description_text": raw_desc[:5000] if raw_desc else None,
                "required_skills": llm_fields.get("required_skills") or [],
                "visa_sponsorship": llm_fields.get("visa_sponsorship", False),
                "open_to_intl": llm_fields.get("open_to_intl", False),
                "apply_url": apply_url,
                "apply_email": job.get('apply_email'),
                "source": job.get('source', 'unknown'),
                "source_id": str(job.get('source_id')),
                "posted_at": posted_at_iso,
                "scraped_at": scraped_at_iso,
                "is_active": True,
                "expires_at": expires_at_iso,
                "job_region": job_region,
                "category": llm_fields.get("category"),
                "subcategory": llm_fields.get("subcategory"),
                "experience_level": llm_fields.get("experience_level"),
                "job_type": llm_fields.get("job_type"),
                "globally_accessible": True,
            }
            if city is not None:
                payload["city"] = city
            if country_code is not None:
                payload["country_code"] = country_code
            if llm_fields.get("remote_type"):
                payload["remote_type"] = llm_fields["remote_type"]
            elif job.get('remote_type'):
                payload["remote_type"] = job.get('remote_type')
            if llm_result is not None:
                set_global_accessibility(payload, llm_result)

            embedding_text = build_job_profile_text(
                title=title,
                required_skills=payload["required_skills"],
                experience_level=payload["experience_level"],
                description=raw_desc,
            )
            pending_updates.append((payload, embedding_text, required_skills, preferred_skills, db_job_id))
        except Exception as e:
            print(f"Error building update payload for {candidate['job'].get('source_id')}: {e}")
            skipped_count += 1

    print(f"LLM enrichment: {llm_success} success, {llm_fail} failed")

    if not pending and not pending_updates:
        return {"new": new_count, "enriched": enriched_count, "skipped": skipped_count}

    # --- BATCH ENCODE (new + to-update) ---
    all_texts = [emb_text for _, emb_text, _, _ in pending] + [emb_text for _, emb_text, _, _, _ in pending_updates]
    print(f"Batch-encoding {len(all_texts)} jobs with multilingual-e5-small...")
    vectors = model.encode(all_texts, batch_size=64, show_progress_bar=False)
    print("Batch encoding done.")

    n_insert = len(pending)
    vectors_insert = vectors[:n_insert]
    vectors_update = vectors[n_insert:]

    # --- INSERT new jobs ---
    for (payload, _, req_skills, pref_skills), vector in zip(pending, vectors_insert):
        try:
            payload["description_embedding"] = vector.tolist()
            result = supabase.table("jobs").insert(payload).execute()
            job_id = result.data[0]["id"] if result.data else None
            _write_job_skills(job_id, req_skills, pref_skills)
            print(f"[OK] Inserted job {payload.get('source_id')}")
            new_count += 1
        except Exception as e:
            err_str = str(e)
            if "23505" in err_str or "duplicate key" in err_str.lower():
                skipped_count += 1
                print(f"Skipped duplicate: {payload.get('source_id')}")
            else:
                print(f"Error inserting job {payload.get('source_id')}: {e}")
                skipped_count += 1

    # --- UPDATE existing jobs (enrich with LLM + embedding) ---
    for (payload, _, req_skills, pref_skills, db_job_id), vector in zip(pending_updates, vectors_update):
        try:
            payload["description_embedding"] = vector.tolist()
            supabase.table("jobs").update(payload).eq("id", db_job_id).execute()
            try:
                supabase.table("job_skills").delete().eq("job_id", db_job_id).execute()
            except Exception:
                pass
            _write_job_skills(db_job_id, req_skills, pref_skills)
            enriched_count += 1
            print(f"[OK] Enriched existing job {payload.get('source_id')} (id={db_job_id})")
        except Exception as e:
            print(f"Error updating job {db_job_id}: {e}")
            skipped_count += 1

    return {"new": new_count, "enriched": enriched_count, "skipped": skipped_count}


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
