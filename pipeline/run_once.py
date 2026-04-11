"""
Run the pipeline once (no scheduler). Use when you want to fetch jobs without the 12h loop.
Usage: Activate venv first, then: python run_once.py
"""
import time
import importlib
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from processor import process_jobs, deactivate_expired

# --- Launch-safe source list (Morocco-first MVP) —- keep in sync with scheduler.py ---
SOURCES = [
    # --- Morocco local ---
    "rekrute",          # #1 Moroccan job board
    "stagiaires",       # #1 Moroccan internship / entry-level board
    # --- International / Remote (curated, low noise) ---
    "remotive",         # High-quality curated tech remote
    "weworkremotely",   # High-quality curated tech remote
    "remoteok",         # Tech remote board
    "jsearch",          # LinkedIn / Indeed / Glassdoor via RapidAPI
    # --- Disabled for launch (high volume / global ATS noise) ---
    # "greenhouse",     # POST-LAUNCH: high ATS volume, needs filtering
    # "lever",          # POST-LAUNCH: high ATS volume, needs filtering
    # "adzuna",         # POST-LAUNCH: global volume, not Morocco-relevant yet
    # "jobicy",         # POST-LAUNCH: may hit Cloudflare; re-enable after testing
]

def run_pipeline():
    print("Starting job pipeline run (once)...", time.strftime("%Y-%m-%d %H:%M:%S"))

    print("Loading embedding model 'efederici/multilingual-e5-small-4096' (once for all sources)...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('efederici/multilingual-e5-small-4096')
    print("Model loaded.")

    total_new = 0
    total_enriched = 0
    total_skipped = 0

    for source in SOURCES:
        print(f"--- Fetching from {source} ---")
        try:
            module = importlib.import_module(f"sources.{source}")
            fetch_method = getattr(module, f"fetch_{source}")
            raw_jobs = fetch_method()
            if not raw_jobs:
                print(f"No jobs found from {source}.")
                continue
            print(f"Fetched {len(raw_jobs)} raw jobs from {source}.")
            results = process_jobs(raw_jobs, model)
            new_jobs = results.get("new", 0)
            enriched_jobs = results.get("enriched", 0)
            skipped_jobs = results.get("skipped", 0)
            total_new += new_jobs
            total_enriched += enriched_jobs
            total_skipped += skipped_jobs
            print(f"Processed {source}: {new_jobs} new, {enriched_jobs} enriched, {skipped_jobs} skipped.")
        except Exception as e:
            print(f"Error running source {source}: {e}")

    print("--- Cleaning up ---")
    deactivate_expired()
    print(f"Pipeline run complete! Total new: {total_new}, Total enriched: {total_enriched}, Total skipped: {total_skipped}")

if __name__ == "__main__":
    if not os.path.exists('sources'):
        os.makedirs('sources')
    run_pipeline()
