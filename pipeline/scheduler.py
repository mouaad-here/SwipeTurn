import time
import schedule
import importlib
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from processor import process_jobs, deactivate_expired

SOURCES = [
    "remotive",
    "weworkremotely",
    "jobicy",
    "remoteok",
    "adzuna",
    "greenhouse",
    "lever",
    "jsearch",
    "rekrute",
    "stagiaires"
]

def _load_model():
    """Load the multilingual embedding model once per scheduler process."""
    print("Loading embedding model 'intfloat/multilingual-e5-small' (once for all sources)...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('intfloat/multilingual-e5-small')
    print("Model loaded.")
    return model


def run_pipeline(model):
    print("Starting job pipeline run...", time.strftime("%Y-%m-%d %H:%M:%S"))

    total_new = 0
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
            skipped_jobs = results.get("skipped", 0)

            total_new += new_jobs
            total_skipped += skipped_jobs

            print(f"Processed {source}: {new_jobs} new, {skipped_jobs} skipped.")

        except Exception as e:
            print(f"Error running source {source}: {e}")

    print("--- Cleaning up ---")
    deactivate_expired()

    print(f"Pipeline run complete! Total new: {total_new}, Total skipped: {total_skipped}")

if __name__ == "__main__":
    if not os.path.exists('sources'):
        os.makedirs('sources')

    print("Starting Job Pipeline Scheduler")

    _model = _load_model()

    run_pipeline(_model)
    schedule.every(12).hours.do(run_pipeline, _model)

    print("Scheduler active. Waiting for next run...")
    while True:
        schedule.run_pending()
        time.sleep(60)
