import time
import schedule
import importlib
import os
import sys

# Ensure pipeline dir is in path to import processor and sources
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from processor import process_jobs, deactivate_expired

SOURCES = [
    "remotive",
    "weworkremotely",
    "adzuna",
    "greenhouse",
    "lever",
    "jsearch",
    "rekrute",
    "stagiaires"
]

def run_pipeline():
    print("Starting job pipeline run...", time.strftime("%Y-%m-%d %H:%M:%S"))
    
    total_new = 0
    total_skipped = 0
    
    for source in SOURCES:
        print(f"--- Fetching from {source} ---")
        try:
            # Dynamically import the source module
            module = importlib.import_module(f"sources.{source}")
            fetch_method = getattr(module, f"fetch_{source}")
            
            # Fetch jobs
            raw_jobs = fetch_method()
            if not raw_jobs:
                print(f"No jobs found from {source}.")
                continue
                
            print(f"Fetched {len(raw_jobs)} raw jobs from {source}.")
            
            # Process and insert jobs
            results = process_jobs(raw_jobs)
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
    # Ensure sources exist
    if not os.path.exists('sources'):
        os.makedirs('sources')
        
    print("Starting Job Pipeline Scheduler")
    
    # Run once immediately
    run_pipeline()
    
    # Then schedule every 12 hours
    schedule.every(12).hours.do(run_pipeline)
    
    print("Scheduler active. Waiting for next run...")
    while True:
        schedule.run_pending()
        time.sleep(60)
