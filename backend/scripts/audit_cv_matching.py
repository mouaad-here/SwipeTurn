# -*- coding: utf-8 -*-
"""
CV Matching Quality Audit
=========================
Runs the full pipeline end-to-end for a given PDF and reports:
  1. What the LLM extracts from the CV
  2. What text gets embedded (the actual vector content)
  3. Top 20 matched jobs with scores and skill breakdown
  4. Whether the cross-encoder reranker changes the ranking
  5. DB coverage stats (missing embeddings, filter reach)

Usage (from repo root, with backend venv active):
    cd backend
    .\\venv\\Scripts\\Activate.ps1
    python scripts/audit_cv_matching.py ../Mouaad_Resume-2.pdf
"""

import asyncio
import io
import os
import sys
import json
import time
from pathlib import Path

# Force UTF-8 output on Windows so box-drawing / arrow chars don't crash
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Make backend modules importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from services.cv_parser import extract_text_from_pdf, parse_cv
from services.embeddings import generate_cv_embedding, build_user_profile_text, build_user_profile_text_from_user
from services.matching import calculate_match_score, get_skill_breakdown, cosine_similarity
from services.reranker import rerank_pairs
from dependencies import get_supabase
from constants import get_allowed_experience_levels, SENIORITY_INCOMPATIBLE, SENIOR_TITLE_KEYWORDS, SENIOR_YEARS_PATTERNS


# ─── Helpers ──────────────────────────────────────────────────────────────────

def sep(title: str = "", char: str = "-", width: int = 72):
    if title:
        pad = max(0, width - len(title) - 2)
        print(f"\n{char * 2} {title} {char * pad}")
    else:
        print(char * width)


def fmt_list(items: list, max_items: int = 15) -> str:
    if not items:
        return "(none)"
    shown = items[:max_items]
    suffix = f"  … +{len(items) - max_items} more" if len(items) > max_items else ""
    return ", ".join(shown) + suffix


# ─── Step 1: Extract & Parse ──────────────────────────────────────────────────

async def step1_extract_and_parse(pdf_path: str):
    sep("STEP 1 — CV Extraction & LLM Parse")

    pdf_bytes = Path(pdf_path).read_bytes()
    print(f"  File: {pdf_path}  ({len(pdf_bytes):,} bytes)")

    t0 = time.time()
    cv_text = await extract_text_from_pdf(pdf_bytes)
    t1 = time.time()
    print(f"  Extracted text: {len(cv_text):,} chars  ({t1 - t0:.2f}s)")

    if len(cv_text) < 50:
        print("  WARNING: Very little text extracted. PDF may be image-based.")

    # Print a snippet of the raw text
    print("\n  --- Raw CV text (first 600 chars) ---")
    print("  " + cv_text[:600].replace("\n", "\n  "))

    t2 = time.time()
    print("\n  Calling OpenRouter (Gemini Flash) to parse CV…")
    parsed = await parse_cv(cv_text)
    t3 = time.time()
    print(f"  LLM parse done in {t3 - t2:.1f}s")

    sep("Extracted Structured Data")
    print(f"  Name           : {parsed.get('full_name', '(not found)')}")
    print(f"  Email          : {parsed.get('email', '(not found)')}")
    print(f"  LinkedIn       : {parsed.get('linkedin_url', '(not found)')}")
    print(f"  Exp Level      : {parsed.get('experience_level', '(not found)')}")
    print(f"  Fields         : {fmt_list(parsed.get('fields', []))}")
    print(f"  Skills ({len(parsed.get('skills', []))}): {fmt_list(parsed.get('skills', []))}")
    print(f"  Languages      : {fmt_list(parsed.get('languages', []))}")

    education = parsed.get("education", [])
    if education:
        print(f"  Education ({len(education)}):")
        for ed in education[:3]:
            print(f"    - {ed.get('degree', '?')} at {ed.get('school', '?')} ({ed.get('year', '?')})")

    projects = parsed.get("projects", [])
    if projects:
        print(f"  Projects ({len(projects)}):")
        for p in projects[:3]:
            print(f"    - {p.get('title', '?')}: {p.get('description', '')[:80]}")

    return cv_text, parsed


# ─── Step 2: Embedding ────────────────────────────────────────────────────────

def step2_embedding(parsed: dict, cv_text: str):
    sep("STEP 2 — Embedding Generation")

    profile_text = build_user_profile_text(parsed, cv_text)
    print(f"  Profile text length: {len(profile_text)} chars")
    print("\n  --- Profile text sent to embedding model ---")
    print("  " + profile_text[:600].replace("\n", "\n  "))

    t0 = time.time()
    embedding = generate_cv_embedding(parsed, cv_text)
    t1 = time.time()

    if embedding:
        print(f"\n  Embedding: {len(embedding)}-dim vector  ({t1 - t0:.2f}s)")
        print(f"  Sample values: {[round(v, 4) for v in embedding[:6]]} …")
    else:
        print("  ERROR: Embedding returned None or empty.")

    return embedding


# ─── Step 3: Fetch Jobs & Score ───────────────────────────────────────────────

def step3_score_jobs(parsed: dict, embedding: list, user_prefs: dict = None):
    sep("STEP 3 — Fetch Jobs & Score")

    user_skills = parsed.get("skills", [])
    user_seniority = parsed.get("experience_level", "mid")

    # Coverage query: paginate through ALL active jobs (Supabase caps at 1000 per request)
    print("  Querying jobs table (paginated)...")
    all_jobs = []
    PAGE_SIZE = 1000
    offset = 0
    while True:
        res = (
            get_supabase()
            .table("jobs")
            .select("id, title, company, required_skills, experience_level, description_embedding, description_text, job_region, city, location, apply_url")
            .eq("is_active", True)
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = res.data or []
        all_jobs.extend(batch)
        print(f"    Fetched {offset + len(batch)} jobs...")
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    total = len(all_jobs)
    with_embedding = sum(1 for j in all_jobs if j.get("description_embedding"))
    without_embedding = total - with_embedding

    print(f"\n  Total active jobs in DB  : {total}")
    print(f"  Jobs WITH embedding      : {with_embedding}")
    print(f"  Jobs WITHOUT embedding   : {without_embedding}  <- these are invisible to vector search")

    if total == 0:
        print("  ERROR: No jobs found. Is the backend connected to the right Supabase project?")
        return [], []

    # Mirror the live feed's seniority incompatibility filter + text-based student guard
    incompatible_levels = SENIORITY_INCOMPATIBLE.get(user_seniority, set())

    def _looks_senior(job: dict) -> bool:
        title = (job.get("title") or "").lower()
        desc = (job.get("description_text") or "")[:1200].lower()
        if any(kw in title for kw in SENIOR_TITLE_KEYWORDS):
            return True
        text = f"{title} {desc}"
        return any(pat in text for pat in SENIOR_YEARS_PATTERNS)

    def is_compatible(job: dict) -> bool:
        level = (job.get("experience_level") or "").lower().strip()
        if level in incompatible_levels:
            return False
        if user_seniority == "student" and _looks_senior(job):
            return False
        return True

    # Score only jobs that have an embedding AND pass the seniority filter
    scorable = [j for j in all_jobs if j.get("description_embedding") and is_compatible(j)]
    filtered_out = sum(1 for j in all_jobs if j.get("description_embedding") and not is_compatible(j))
    print(f"\n  Jobs filtered out (wrong seniority for '{user_seniority}'): {filtered_out}")
    print(f"  Scoring {len(scorable)} compatible jobs...")

    scored = []
    for job in scorable:
        job_skills = job.get("required_skills") or []
        if isinstance(job_skills, str):
            try:
                job_skills = json.loads(job_skills)
            except Exception:
                job_skills = []

        score = calculate_match_score(
            user_skills=user_skills,
            job_skills=job_skills,
            user_seniority=user_seniority,
            job_seniority=job.get("experience_level", "mid"),
            user_embedding=embedding,
            job_embedding=job.get("description_embedding"),
            user_preferences=user_prefs,
            job_location=job.get("location") or job.get("job_region") or "",
            job_city=job.get("city"),
        )

        raw_sim = cosine_similarity(embedding, job.get("description_embedding"))
        breakdown = get_skill_breakdown(user_skills, job_skills)

        scored.append({
            "job": job,
            "score": score,
            "cosine_sim": round(raw_sim, 4),
            "matched_skills": breakdown["matched"],
            "missing_skills": breakdown["missing"],
        })

    scored.sort(key=lambda x: x["score"], reverse=True)

    sep("Top 20 Matched Jobs (before rerank)")
    print(f"  {'#':<3} {'Score':>6}  {'CosSim':>7}  {'Title':<40}  {'Company':<25}  {'Level':<10}  Matched / Missing Skills")
    print(f"  {'-'*3} {'-'*6}  {'-'*7}  {'-'*40}  {'-'*25}  {'-'*10}  {'-'*30}")

    for i, r in enumerate(scored[:20], 1):
        j = r["job"]
        title = (j.get("title") or "")[:40]
        company = (j.get("company") or "")[:25]
        level = (j.get("experience_level") or "")[:10]
        matched = ", ".join(r["matched_skills"][:5]) or "(none)"
        missing = ", ".join(r["missing_skills"][:4]) or "(none)"
        print(f"  {i:<3} {r['score']:>6.1f}  {r['cosine_sim']:>7.4f}  {title:<40}  {company:<25}  {level:<10}  +[{matched}]  -[{missing}]")

    return scored, all_jobs


# ─── Step 4: Cross-Encoder Rerank ─────────────────────────────────────────────

def step4_rerank(scored: list, parsed: dict, cv_text: str):
    sep("STEP 4 — Cross-Encoder Rerank (top 50)")

    top50 = scored[:50]
    if not top50:
        print("  No jobs to rerank.")
        return

    user_profile_text = build_user_profile_text(parsed, cv_text)[:512]

    pairs = []
    for r in top50:
        job_desc = (r["job"].get("description_text") or r["job"].get("title") or "")[:512]
        pairs.append((user_profile_text, job_desc))

    print(f"  Running cross-encoder on {len(pairs)} pairs...")
    t0 = time.time()
    rerank_scores = rerank_pairs(pairs, timeout_seconds=15.0)
    t1 = time.time()

    if rerank_scores is None:
        print(f"  Cross-encoder timed out or failed after {t1 - t0:.1f}s. Skipping rerank.")
        return

    print(f"  Rerank completed in {t1 - t0:.1f}s")

    # Combine base score + rerank score
    reranked = []
    for r, rs in zip(top50, rerank_scores):
        reranked.append({**r, "rerank_score": round(float(rs), 4)})

    reranked_sorted = sorted(reranked, key=lambda x: x["rerank_score"], reverse=True)

    sep("Top 20 After Cross-Encoder Rerank")
    print(f"  {'#':<3} {'Base':>6}  {'Rerank':>8}  {'Title':<45}  {'Company'}")
    print(f"  {'-'*3} {'-'*6}  {'-'*8}  {'-'*45}  {'-'*25}")

    for i, r in enumerate(reranked_sorted[:20], 1):
        j = r["job"]
        title = (j.get("title") or "")[:45]
        company = (j.get("company") or "")[:25]
        print(f"  {i:<3} {r['score']:>6.1f}  {r['rerank_score']:>8.4f}  {title:<45}  {company}")

    # Show rank changes
    sep("Rank Changes (base rank -> rerank rank, top 20)")
    base_order = {r["job"]["id"]: i+1 for i, r in enumerate(top50)}
    rerank_order = {r["job"]["id"]: i+1 for i, r in enumerate(reranked_sorted[:20])}

    changes = []
    for job_id, rerank_rank in rerank_order.items():
        base_rank = base_order.get(job_id, "?")
        delta = (base_rank - rerank_rank) if isinstance(base_rank, int) else 0
        changes.append((rerank_rank, base_rank, delta, job_id))

    changes.sort(key=lambda x: abs(x[2]), reverse=True)
    for rerank_rank, base_rank, delta, job_id in changes[:10]:
        arrow = f"+{delta}" if delta > 0 else (f"-{abs(delta)}" if delta < 0 else "=")
        job = next((r["job"] for r in top50 if r["job"]["id"] == job_id), {})
        title = (job.get("title") or "")[:50]
        print(f"  {arrow:>4}  #{base_rank:>3} -> #{rerank_rank:<3}  {title}")


# ─── Step 5: Coverage Stats ───────────────────────────────────────────────────

def step5_coverage(all_jobs: list, parsed: dict):
    sep("STEP 5 — DB Coverage & Filter Analysis")

    user_seniority = (parsed.get("experience_level") or "mid").lower()

    regions = {}
    seniority_dist = {}
    no_apply_url = 0
    inactive = 0

    for j in all_jobs:
        r = j.get("job_region") or "unknown"
        regions[r] = regions.get(r, 0) + 1
        s = j.get("experience_level") or "unknown"
        seniority_dist[s] = seniority_dist.get(s, 0) + 1
        if not (j.get("apply_url") or "").strip().startswith(("http://", "https://")):
            no_apply_url += 1

    print(f"\n  Jobs by region:")
    for r, count in sorted(regions.items(), key=lambda x: -x[1]):
        print(f"    {r:<20} {count:>5}")

    print(f"\n  Jobs by experience_level:")
    for s, count in sorted(seniority_dist.items(), key=lambda x: -x[1]):
        print(f"    {s:<20} {count:>5}")

    print(f"\n  Jobs missing apply_url  : {no_apply_url}")

    # Skills coverage
    no_skills = sum(1 for j in all_jobs if not j.get("required_skills"))
    print(f"  Jobs with NO required_skills : {no_skills} ({round(no_skills/max(1,len(all_jobs))*100)}%)  <- these score 50 (neutral) on skill match")

    # What the current user would see — mirrors the live feed (shared constants)
    allowed_levels = get_allowed_experience_levels("global", user_seniority)
    incompatible = SENIORITY_INCOMPATIBLE.get(user_seniority, set())

    reachable = [
        j for j in all_jobs
        if (j.get("experience_level") in allowed_levels or j.get("experience_level") is None)
        and j.get("experience_level") not in incompatible
        and (j.get("apply_url") or "").strip().startswith(("http://", "https://"))
    ]
    reachable_with_emb = [j for j in reachable if j.get("description_embedding")]

    print(f"\n  For user seniority '{user_seniority}' (global filters, post-fix):")
    print(f"    Allowed levels     : {allowed_levels}")
    print(f"    Incompatible levels: {sorted(incompatible)}")
    print(f"    Reachable jobs     : {len(reachable)}")
    print(f"    With embedding     : {len(reachable_with_emb)}")
    print(f"    Without embedding  : {len(reachable) - len(reachable_with_emb)}  <- won't appear in feed")

    # Show sample of reachable jobs with no skills (hard to match precisely)
    no_skills_reachable = [j for j in reachable if not j.get("required_skills")]
    print(f"\n  Reachable jobs with no skills listed: {len(no_skills_reachable)}  (score 50 on skill component)")
    if no_skills_reachable[:5]:
        print("  Sample:")
        for j in no_skills_reachable[:5]:
            print(f"    - {(j.get('title') or '')[:55]}  [{j.get('experience_level') or 'null'}]  {j.get('job_region') or ''}")


# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/audit_cv_matching.py <path_to_cv.pdf>")
        print("Example: python scripts/audit_cv_matching.py ../Mouaad_Resume-2.pdf")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not Path(pdf_path).exists():
        print(f"ERROR: File not found: {pdf_path}")
        sys.exit(1)

    # Optional: pass a user prefs JSON as second arg for intent bonus testing
    user_prefs = {}
    if len(sys.argv) >= 3:
        try:
            user_prefs = json.loads(sys.argv[2])
        except Exception:
            print(f"Warning: Could not parse user_prefs JSON: {sys.argv[2]}")

    print("\n" + "=" * 72)
    print("  CV MATCHING QUALITY AUDIT")
    print("=" * 72)

    t_start = time.time()

    cv_text, parsed = await step1_extract_and_parse(pdf_path)
    embedding = step2_embedding(parsed, cv_text)
    scored, all_jobs = step3_score_jobs(parsed, embedding, user_prefs or None)

    if scored:
        step4_rerank(scored, parsed, cv_text)
        step5_coverage(all_jobs, parsed)

    t_total = time.time() - t_start
    sep("AUDIT COMPLETE")
    print(f"  Total time: {t_total:.1f}s")
    print("=" * 72 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
