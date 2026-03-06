"""
One-time backfill: run LLM enrichment on existing jobs that have no category/skills
(jobs inserted before the LLM pipeline). Updates jobs + job_skills via process_jobs_parallel.

Usage:
    cd pipeline
    .\\venv\\Scripts\\Activate.ps1
    set OPENROUTER_API_KEY=...
    python scripts/backfill_llm_enrichment.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
BATCH_SIZE = 50
DOMESTIC_SOURCES = {"rekrute", "stagiaires"}


def _write_job_skills(supabase, job_id: str, required: list, preferred: list) -> None:
    """Insert rows into job_skills; caller should delete existing rows for job_id first if re-enriching."""
    if not job_id:
        return
    rows = []
    seen = set()
    for skill in required or []:
        s = (skill or "").strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            rows.append({"job_id": job_id, "skill": s, "is_required": True})
    for skill in preferred or []:
        s = (skill or "").strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            rows.append({"job_id": job_id, "skill": s, "is_required": False})
    if rows:
        try:
            supabase.table("job_skills").insert(rows).execute()
        except Exception as e:
            print(f"  Warning: job_skills insert failed for {job_id}: {e}")


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        return
    if not os.getenv("OPENROUTER_API_KEY"):
        print("ERROR: OPENROUTER_API_KEY must be set.")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    from llm_enrichment import (
        process_jobs_parallel,
        extract_fields_from_llm,
        set_global_accessibility,
    )
    from data_cleaning import (
        normalize_location,
        job_region_from_location_and_source,
        extract_city_country,
    )

    offset = 0
    total_updated = 0
    total_skipped = 0

    while True:
        # Jobs that were never LLM-enriched (no category set)
        res = (
            supabase.table("jobs")
            .select("id, title, description_text, location, source, city, country_code")
            .is_("category", "null")
            .order("posted_at", desc=False)
            .range(offset, offset + BATCH_SIZE - 1)
            .execute()
        )
        jobs = res.data or []
        if not jobs:
            break

        descriptions = []
        for job in jobs:
            desc = (job.get("description_text") or "").strip()
            if not desc or len(desc) < 20:
                desc = f"Job: {job.get('title', '')}. No full description available."
            descriptions.append(desc)

        source_names = [(job.get("source") or "unknown").lower().strip() for job in jobs]
        is_domestic_list = [s in DOMESTIC_SOURCES for s in source_names]

        llm_inputs = [
            {
                "title": job.get("title") or "Unknown Title",
                "description": desc,
                "is_domestic": is_dom,
            }
            for job, desc, is_dom in zip(jobs, descriptions, is_domestic_list)
        ]
        results = process_jobs_parallel(llm_inputs)

        for job, llm_result in zip(jobs, results):
            job_id = job["id"]
            source = (job.get("source") or "").lower().strip()
            is_domestic = source in DOMESTIC_SOURCES

            if llm_result is None:
                total_skipped += 1
                continue

            llm_fields, required_skills, preferred_skills = extract_fields_from_llm(llm_result)
            payload = {"globally_accessible": True}
            set_global_accessibility(payload, llm_result)

            update_row = {
                "category": llm_fields.get("category"),
                "subcategory": llm_fields.get("subcategory"),
                "experience_level": llm_fields.get("experience_level"),
                "job_type": llm_fields.get("job_type"),
                "remote_type": llm_fields.get("remote_type"),
                "visa_sponsorship": llm_fields.get("visa_sponsorship", False),
                "open_to_intl": llm_fields.get("open_to_intl", False),
                "globally_accessible": payload.get("globally_accessible", True),
                "required_skills": llm_fields.get("required_skills") or [],
            }

            if is_domestic:
                update_row["job_region"] = "MA"
                update_row["country_code"] = job.get("country_code") or "MA"
            else:
                loc_norm = normalize_location(job.get("location"))
                llm_loc = (llm_result.get("location") or {})
                update_row["job_region"] = (
                    llm_loc.get("job_region")
                    or job_region_from_location_and_source(loc_norm, job.get("source"))
                )
                city = job.get("city")
                country_code = job.get("country_code")
                if city is None and country_code is None:
                    city, country_code = extract_city_country(loc_norm, job.get("source"))
                if not city and llm_loc.get("city"):
                    city = llm_loc["city"]
                if not country_code and llm_loc.get("country_code"):
                    country_code = llm_loc["country_code"]
                if city is not None:
                    update_row["city"] = city
                if country_code is not None:
                    update_row["country_code"] = country_code

            try:
                supabase.table("jobs").update(update_row).eq("id", job_id).execute()
                # Replace job_skills: delete existing then insert
                supabase.table("job_skills").delete().eq("job_id", job_id).execute()
                _write_job_skills(supabase, job_id, required_skills, preferred_skills)
                total_updated += 1
            except Exception as e:
                print(f"  Failed to update job {job_id}: {e}")
                total_skipped += 1

        print(f"  Processed batch: {len(jobs)} jobs, {total_updated} updated so far.")
        offset += BATCH_SIZE

    print(f"\nDone. Enriched {total_updated} jobs with LLM (skipped {total_skipped}).")


if __name__ == "__main__":
    main()
