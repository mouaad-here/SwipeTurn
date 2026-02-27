import os
import sys

# Ensure pipeline dir is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from processor import process_jobs
from sources.rekrute import fetch_rekrute
from sources.emploi import fetch_emploi
from sources.stagiaires import fetch_stagiaires

def run_moroccan_scrapers():
    print("Running Moroccan Job Scrapers with Pagination (Deep Dive)...")
    all_jobs = []
    
    # 1. Rekrute
    try:
        r_jobs = fetch_rekrute(max_pages=20)
        print(f"Adding {len(r_jobs)} Rekrute jobs to pipeline.")
        all_jobs.extend(r_jobs)
    except Exception as e:
        print(f"Error fetching Rekrute: {e}")
        
    # 2. Emploi (Disabled due to Cloudflare)
    print("Emploi scraper is currently disabled due to rigid Cloudflare anti-bot blocks.")
        
    # 3. Stagiaires
    try:
        s_jobs = fetch_stagiaires(max_pages=20)
        print(f"Adding {len(s_jobs)} Stagiaires jobs to pipeline.")
        all_jobs.extend(s_jobs)
    except Exception as e:
        print(f"Error fetching Stagiaires: {e}")
        
    print(f"\nTotal Moroccan Jobs Found: {len(all_jobs)}")
    if all_jobs:
        print("Pushing to Supabase processor...")
        process_jobs(all_jobs)
        print("Supabase insertion complete.")
    else:
        print("No jobs found to insert.")

if __name__ == "__main__":
    run_moroccan_scrapers()
