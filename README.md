# SwipeTurn

[![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-0A84FF?style=flat-square&logo=apple)](https://expo.dev)
[![Expo SDK](https://img.shields.io/badge/expo-~54.0-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/react--native-0.81.5-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev)
[![Python](https://img.shields.io/badge/python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-%E2%89%A50.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Clerk](https://img.shields.io/badge/auth-Clerk%20%28dev%29-6C47FF?style=flat-square&logo=clerk&logoColor=white)](https://clerk.com)
[![EAS Build](https://img.shields.io/badge/EAS%20Build-configured-success?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/eas)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

A mobile-first job discovery app that lets users swipe through job listings — Tinder-style. Built with a focus on the Moroccan market and international remote roles, SwipeTurn combines multilingual AI matching with a clean, gesture-driven UX.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
  - [Frontend](#frontend)
  - [Backend](#backend)
  - [Pipeline](#pipeline)
  - [Infrastructure](#infrastructure)
  - [External Services](#external-services)
- [Repository Structure](#repository-structure)
- [AI & Matching Engine](#ai--matching-engine)
- [Job Sources](#job-sources)
- [Environment Variables](#environment-variables)
  - [Frontend (.env)](#frontend-env)
  - [Backend (.env)](#backend-env)
  - [Pipeline (.env)](#pipeline-env)
- [Getting Started — Local Development](#getting-started--local-development)
  - [Prerequisites](#prerequisites)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Pipeline Setup](#3-pipeline-setup)
  - [4. Frontend Setup](#4-frontend-setup)
  - [5. Running the Full Stack Locally](#5-running-the-full-stack-locally)
- [Production Deployment — Hetzner VPS](#production-deployment--hetzner-vps)
  - [Server Specs](#server-specs)
  - [Initial Server Setup](#initial-server-setup)
  - [Deploying with Docker Compose](#deploying-with-docker-compose)
  - [DNS Configuration](#dns-configuration)
  - [Updating the Production Server](#updating-the-production-server)
- [Mobile App Builds (EAS)](#mobile-app-builds-eas)
  - [Prerequisites](#prerequisites-1)
  - [Development Build](#development-build)
  - [Preview Build](#preview-build)
  - [Production Build](#production-build)
- [API Reference](#api-reference)
- [Authentication & Guest Mode](#authentication--guest-mode)
- [Design System](#design-system)
- [Project Conventions](#project-conventions)

---

## Overview

SwipeTurn is a full-stack mobile application that aggregates job listings from multiple sources (Moroccan boards + global remote platforms), enriches them with LLM-extracted metadata, and serves a personalized swipe feed to users based on their uploaded CV and preferences.

**Core user flow:**

1. User opens the app → lands on onboarding (geography, domain, skills, seniority)
2. Guest users get a generic feed immediately; signed-in users get a personalized one
3. Swipe right to save, swipe left to skip
4. Upload a CV → the AI extracts skills and generates a 384-dim embedding for semantic matching
5. The backend scores and re-ranks jobs using a hybrid keyword + semantic + cross-encoder pipeline

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Expo Mobile App (iOS/Android)          │
│         React Native · Expo Router · Clerk · Zustand     │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS (api.swipeturn.com)
                         ▼
┌─────────────────────────────────────────────────────────┐
│               Caddy (Reverse Proxy + TLS)                │
│             caddy:2-alpine · Auto-HTTPS via ACME         │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                 FastAPI Backend (port 8003)               │
│   Uvicorn · Clerk JWT Auth · Supabase · SentenceXformers │
└────────┬───────────────────────────────────────┬────────┘
         │                                       │
         ▼                                       ▼
┌─────────────────┐                   ┌──────────────────┐
│  Supabase (DB)  │                   │  OpenRouter LLM   │
│  PostgreSQL     │                   │  Gemini 2.5 Flash │
│  + pgvector     │                   └──────────────────┘
└─────────────────┘
         ▲
         │ writes
┌─────────────────────────────────────────────────────────┐
│              Pipeline Worker (Scheduler)                 │
│  Python · scrapling/BS4 · SentenceTransformers · OpenAI  │
│  Sources: Rekrute, Stagiaires, Remotive, RemoteOK, ...  │
└─────────────────────────────────────────────────────────┘
```

All three backend services run in Docker containers on a single Hetzner VPS, orchestrated by Docker Compose.

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **Expo** | ~54.0.33 | Managed React Native framework |
| **React Native** | 0.81.5 | Cross-platform mobile UI |
| **TypeScript** | ~5.9.2 | Type safety |
| **Expo Router** | ~6.0.23 | File-based navigation (Stack + Tabs) |
| **Clerk (`@clerk/clerk-expo`)** | ^2.19.29 | Authentication (Email, Google OAuth) |
| **Zustand** | ^5.0.11 | Global state management (feed, saved jobs) |
| **react-native-reanimated** | ~4.1.1 | GPU-accelerated swipe animations |
| **react-native-gesture-handler** | ~2.28.0 | Swipe gesture recognition |
| **@gorhom/bottom-sheet** | ^5.2.8 | Bottom sheet modals |
| **expo-secure-store** | ~15.0.8 | Secure token caching (Clerk) |
| **AsyncStorage** | 2.2.0 | Onboarding state, feed cache, guest state |
| **expo-document-picker** | ~14.0.8 | CV upload (PDF/DOCX) |
| **expo-image** | ~3.0.11 | Optimized image rendering with caching |
| **expo-haptics** | ~15.0.8 | Tactile feedback on swipe actions |
| **Hugeicons** | ^0.0.2 | Icon library |
| **ClashDisplay / Satoshi** | — | Custom OTF typefaces |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **FastAPI** | >=0.115.0 | REST API framework |
| **Uvicorn** | >=0.32.0 | ASGI server |
| **Python** | 3.12 | Runtime |
| **python-jose** | >=3.3.0 | Clerk RS256 JWT verification |
| **supabase-py** | >=2.10.0 | Database client (Postgres via PostgREST) |
| **sentence-transformers** | >=3.0.0 | Embedding model + cross-encoder reranker |
| **numpy** | >=1.24.0 | Cosine similarity computations |
| **pypdf** | >=4.0.0 | PDF text extraction (CV parsing) |
| **python-docx** | >=1.1.0 | DOCX text extraction (CV parsing) |
| **httpx** | >=0.27.0 | Async HTTP calls to OpenRouter |
| **python-multipart** | >=0.0.12 | File upload handling |

**AI Models (loaded at startup, cached to shared Docker volume):**

| Model | Purpose |
|---|---|
| `efederici/multilingual-e5-small-4096` (384-dim) | User CV + job description embeddings |
| `unicamp-dl/mMiniLM-L6-v2-mmarco-v2` | Cross-encoder reranker (top-15 re-ranking) |
| `google/gemini-2.5-flash` via OpenRouter | CV structured data extraction (backend `cv_parser.py`) |

> **Note on CV parser model:** The backend CV parser calls OpenRouter directly via `httpx` using `google/gemini-2.5-flash` at temperature 0.1. There is no model fallback for this path — if the call fails, the parser returns an empty skills object and logs the error.

### Pipeline

| Technology | Version | Purpose |
|---|---|---|
| **Python** | 3.12 | Runtime |
| **sentence-transformers** | >=3.0.0 | Batch job embedding generation |
| **scrapling** | >=0.2.0 | JS-capable web scraping (Rekrute, Stagiaires) |
| **BeautifulSoup4 + lxml** | >=4.12.0 | HTML parsing |
| **schedule** | >=1.2.0 | Cron-style scheduler (runs every 12 hours) |
| **supabase-py** | >=2.10.0 | Database writes |
| **openai** | >=1.0.0 | OpenRouter-compatible LLM client |
| **python-dateutil** | >=2.8.0 | Robust date parsing for job listings |
| **pika** | >=1.3.0 | RabbitMQ client (available, reserved for async queuing) |

### Infrastructure

| Component | Details |
|---|---|
| **VPS** | Hetzner CX33 — 4 vCPU, 8 GB RAM, 80 GB SSD, eu-central |
| **OS** | Ubuntu 22.04 LTS |
| **Containerization** | Docker + Docker Compose |
| **Reverse Proxy** | Caddy 2 (Alpine) — automatic HTTPS via Let's Encrypt ACME |
| **Deployment** | SSH + `git pull` + `docker compose up -d` |
| **Logging** | JSON file driver, max 10 MB/file, 3 file rotation |
| **Model Cache** | Shared named Docker volume `swipeturn-hf-cache` (HuggingFace) |

### External Services

| Service | Purpose |
|---|---|
| **Supabase** | PostgreSQL database (jobs, users, swipes, job_skills), pgvector for embeddings |
| **Clerk** | User auth — email/password, Google OAuth, JWT tokens. **Currently in development/test mode** (`pk_test_*` key) |
| **OpenRouter** | LLM gateway used in two places — see model details below |
| **Adzuna API** | Job listings API (disabled, reserved for post-launch) |
| **JSearch (RapidAPI)** | LinkedIn/Indeed/Glassdoor aggregator via RapidAPI |

**OpenRouter model usage:**

| Where | Primary model | Fallback 1 | Fallback 2 | Notes |
|---|---|---|---|---|
| **Pipeline** (`llm_enrichment.py`) | `qwen/qwen3.5-flash-02-23` | `google/gemini-3.1-flash-lite-preview` | `anthropic/claude-haiku-4-5` | Auto-rotates on parse error or API failure; results are cached in `llm_enrichment_cache` Supabase table |
| **Backend** (`cv_parser.py`) | `google/gemini-2.5-flash` | — | — | Single model, no rotation; failure returns empty skills object |

> **Clerk note:** To go to production, swap `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` from the `pk_test_*` value to your `pk_live_*` key from the Clerk dashboard, and ensure `CLERK_SECRET_KEY` and `CLERK_PEM_KEY` in the backend `.env` also use the live credentials.

---

## Repository Structure

```
SwipeTurn/
├── frontend/               # Expo React Native app
│   ├── app/
│   │   ├── (auth)/         # Login, Signup screens
│   │   ├── (onboarding)/   # 7-step onboarding flow (geography → preview)
│   │   ├── (tabs)/         # Main tab screens (swipe, saved, profile, etc.)
│   │   ├── welcome.tsx     # Landing screen (entry point for new users)
│   │   ├── job-detail.tsx  # Full job detail view
│   │   └── update-cv.tsx   # CV upload screen
│   ├── components/         # Shared UI components (GuestGate, etc.)
│   ├── constants/          # Colors, fonts, API URL, theme tokens
│   ├── hooks/              # useBootState, useColorScheme, useAuthHeaders
│   ├── lib/                # onboarding-storage, local state utilities
│   ├── store/              # Zustand store (appStore.ts)
│   ├── utils/              # guestId, cache, tokenCache
│   ├── app.json            # Expo config (bundle IDs, EAS project ID)
│   └── eas.json            # EAS build profiles (development/preview/production)
│
├── backend/                # FastAPI API server
│   ├── routers/
│   │   ├── users.py        # Profile management, CV upload, preferences
│   │   ├── jobs.py         # Feed generation, job search, scoring
│   │   ├── swipes.py       # Swipe recording (save/skip/apply)
│   │   └── public.py       # Public pages (account deletion form)
│   ├── services/
│   │   ├── embeddings.py   # User CV embedding generation (e5-small)
│   │   ├── matching.py     # Hybrid scoring (keyword + semantic + recency)
│   │   ├── reranker.py     # Cross-encoder reranker (mMiniLM)
│   │   └── cv_parser.py    # PDF/DOCX extraction + LLM structured parse
│   ├── main.py             # FastAPI app, CORS, lifespan (model preload)
│   ├── config.py           # Environment config loader
│   ├── dependencies.py     # Clerk JWT auth, Supabase client, user fetcher
│   ├── constants.py        # Domain categories, skill lists
│   ├── Dockerfile          # Python 3.12-slim container
│   └── requirements.txt
│
├── pipeline/               # Automated job scraping & enrichment worker
│   ├── sources/
│   │   ├── rekrute.py      # Moroccan job board scraper
│   │   ├── stagiaires.py   # Moroccan internship board scraper
│   │   ├── remotive.py     # Remote tech jobs (API)
│   │   ├── remoteok.py     # Remote tech jobs (API)
│   │   ├── weworkremotely.py
│   │   ├── jsearch.py      # LinkedIn/Indeed/Glassdoor via RapidAPI
│   │   ├── greenhouse.py   # (disabled — post-launch)
│   │   ├── lever.py        # (disabled — post-launch)
│   │   ├── adzuna.py       # (disabled — post-launch)
│   │   └── jobicy.py       # (disabled — post-launch)
│   ├── processor.py        # Dedup, LLM enrichment, embedding, DB insert
│   ├── llm_enrichment.py   # Parallel LLM job classification worker
│   ├── data_cleaning.py    # Location normalization, HTML stripping, dates
│   ├── scheduler.py        # Cron runner — fetches all sources every 12h
│   ├── Dockerfile          # Python 3.12-slim container
│   └── requirements.txt
│
├── docker-compose.yml      # Orchestrates: caddy + api + pipeline
├── Caddyfile               # Caddy config: api.swipeturn.com + swipeturn.com
└── .gitignore
```

---

## AI & Matching Engine

SwipeTurn's feed is powered by a 3-stage matching pipeline:

### Stage 1 — Keyword Scoring (0–100 pts)

Calculated from three dimensions:

| Component | Weight | Logic |
|---|---|---|
| Skill overlap | 0–60 pts | `(user_skills ∩ job_skills) / |job_skills|` |
| Domain match | 0–25 pts | User subcategory → job subcategory match |
| Job type match | 0–15 pts | full-time / part-time / contract preference |

### Stage 2 — Semantic Scoring (Hybrid)

When a user has uploaded a CV (generating a 384-dim embedding), the score is blended:

```
semantic_scaled = (cosine_similarity + 1.0) * 50   # maps [-1,1] to [0,100]
final_score = 0.5 * keyword_score + 0.5 * semantic_scaled
```

Model: `efederici/multilingual-e5-small-4096` — multilingual, supports English and French job text.

### Stage 3 — Cross-Encoder Reranking

The top-15 candidates are re-ranked using `unicamp-dl/mMiniLM-L6-v2-mmarco-v2`, a multilingual cross-encoder trained on mMARCO (MS MARCO translated to 13 languages). This adds fine-grained relevance scoring before results are returned.

### Recency Bonus

| Age | Bonus |
|---|---|
| < 3 days | +2.5 pts |
| < 7 days | +1.5 pts |
| < 14 days | +0.5 pts |
| ≥ 14 days | 0 pts |

---

## Job Sources

| Source | Type | Region | Status |
|---|---|---|---|
| **Rekrute** | Scraper (scrapling) | Morocco | Active |
| **Stagiaires.ma** | Scraper (scrapling) | Morocco (internships) | Active |
| **Remotive** | API | Remote (global) | Active |
| **WeWorkRemotely** | API | Remote (global) | Active |
| **RemoteOK** | API | Remote (global) | Active |
| **JSearch** (RapidAPI) | API — LinkedIn/Indeed | Global | Active |
| Greenhouse | ATS API | Global | Disabled (post-launch) |
| Lever | ATS API | Global | Disabled (post-launch) |
| Adzuna | API | Global | Disabled (post-launch) |
| Jobicy | API | Remote | Disabled (post-launch) |

The pipeline runs every **12 hours**, processing: age filtering (max 14 days old), fuzzy deduplication (93% title similarity threshold per company), parallel LLM enrichment, batch embedding generation, and Supabase upsert.

---

## Environment Variables

### Frontend `.env`

Copy `frontend/.env.example` to `frontend/.env`:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx
EXPO_PUBLIC_API_URL=https://api.swipeturn.com
```

For local development, set `EXPO_PUBLIC_API_URL=http://localhost:8003`.

### Backend `.env`

Copy `backend/.env.example` to `backend/.env`:

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Clerk
CLERK_SECRET_KEY=sk_live_xxxx
CLERK_PEM_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----

# AI / LLM
OPENROUTER_API_KEY=sk-or-xxxx

# CORS (comma-separated)
ALLOWED_ORIGINS=https://swipeturn.com,https://www.swipeturn.com,https://api.swipeturn.com
```

> **Note on `CLERK_PEM_KEY`:** In the `.env` file, newlines must be represented as `\n` literal strings. The config loader automatically converts `\\n` → `\n`.

### Pipeline `.env`

Copy `pipeline/.env.example` to `pipeline/.env`:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Job source API keys
ADZUNA_APP_ID=your_adzuna_app_id
ADZUNA_APP_KEY=your_adzuna_app_key
JSEARCH_API_KEY=your_rapidapi_key
OPENROUTER_API_KEY=sk-or-xxxx

# Pipeline tuning
JOB_MAX_AGE_DAYS=14
LLM_MAX_WORKERS=5
LLM_TIMEOUT_SEC=45
LLM_MAX_RETRIES=2
LLM_DESCRIPTION_MAX_CHARS=6000
LLM_CACHE_ENABLED=true
LLM_CACHE_VERSION=1
LLM_PROGRESS_EVERY_N=10
```

---

## Getting Started — Local Development

### Prerequisites

- **Node.js** ≥ 20 and **Yarn** (for the frontend)
- **Python** 3.12+ (for backend and pipeline)
- **Expo Go** app or a physical device with a dev build installed
- **Docker** + **Docker Compose** (optional — for running services containerized)
- Accounts: **Supabase**, **Clerk**, **OpenRouter**

### 1. Clone the Repository

```bash
git clone https://github.com/mouaad-here/SwipeTurn.git
cd SwipeTurn
```

### 2. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and fill in Supabase, Clerk, and OpenRouter credentials

# Run the API server (development)
python main.py
# Server starts on http://localhost:8003
```

The health check endpoint is available at `http://localhost:8003/health`.

> **First launch note:** The backend lazily loads two HuggingFace models on startup (`efederici/multilingual-e5-small-4096` and `unicamp-dl/mMiniLM-L6-v2-mmarco-v2`) in a background thread. They are downloaded to the HuggingFace cache folder on first run (this takes a few minutes). Subsequent restarts use the local cache.

### 3. Pipeline Setup

```bash
cd pipeline

python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env with Supabase service key and API keys

# Run the pipeline once (fetches from all active sources and inserts into DB)
python run_once.py

# Or start the recurring scheduler (runs every 12 hours automatically)
python scheduler.py
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install

# Configure environment
cp .env.example .env
# Edit .env: set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_API_URL

# Start the development server
yarn dev
# Expo dev server starts on port 8082
```

Open the app using:
- **Expo Go** — scan the QR code (limited, SDK version must match)
- **Development Build** — recommended; see [Mobile App Builds](#mobile-app-builds-eas)
- **Android Emulator** — `yarn android`
- **iOS Simulator** — `yarn ios` (macOS only)
- **Web** — `yarn web` (for quick UI review)

### 5. Running the Full Stack Locally

You can run the backend and pipeline together using Docker Compose for a closer-to-production setup:

```bash
# From the repo root
# Ensure backend/.env and pipeline/.env are filled in

docker compose up --build
```

This starts:
- `caddy` on ports 80/443 (requires valid domain; for local dev, use the backend directly on 8003)
- `api` on internal port 8003
- `pipeline` scheduler

For local dev, skip Caddy and call `http://localhost:8003` directly by setting the frontend's `EXPO_PUBLIC_API_URL=http://localhost:8003`.

---

## Production Deployment — Hetzner VPS

### Server Specs

| Property | Value |
|---|---|
| Provider | Hetzner Cloud |
| Plan | CX33 (x86) |
| vCPU | 4 |
| RAM | 8 GB |
| Disk | 80 GB SSD |
| Region | eu-central (Nuremberg) |
| OS | Ubuntu 22.04 LTS |

### Initial Server Setup

```bash
# 1. SSH into the server
ssh root@<YOUR_SERVER_IP>

# 2. Update system packages
apt update && apt upgrade -y

# 3. Install Docker
curl -fsSL https://get.docker.com | bash

# 4. Install Docker Compose plugin
apt install -y docker-compose-plugin

# 5. Install Git
apt install -y git

# 6. Clone the repository
git clone https://github.com/mouaad-here/SwipeTurn.git /opt/swipeturn
cd /opt/swipeturn

# 7. Create environment files
cp backend/.env.example backend/.env
nano backend/.env   # Fill in all values

cp pipeline/.env.example pipeline/.env
nano pipeline/.env  # Fill in all values

# 8. Build and start all services
docker compose up -d --build
```

### Deploying with Docker Compose

The `docker-compose.yml` at the repo root manages three services:

| Service | Container | Role |
|---|---|---|
| `caddy` | `swipeturn-proxy` | Reverse proxy, automatic TLS (Let's Encrypt), ports 80/443 |
| `api` | `swipeturn-api` | FastAPI backend (internal port 8003) |
| `pipeline` | `swipeturn-pipeline` | 12-hour cron job scheduler |

**Named volumes:**
- `swipeturn-caddy-data` / `swipeturn-caddy-config` — Caddy TLS certificates and config
- `swipeturn-hf-cache` — Shared HuggingFace model cache (shared between `api` and `pipeline` to avoid double-downloading models)

The `Caddyfile` configuration:

```
{
    email support@swipeturn.com
}

api.swipeturn.com {
    encode zstd gzip
    reverse_proxy api:8003
}

swipeturn.com, www.swipeturn.com {
    encode zstd gzip
    reverse_proxy api:8003
}
```

Caddy automatically handles TLS certificate provisioning and renewal via ACME (Let's Encrypt). No manual `certbot` setup is required.

### DNS Configuration

Add the following **A records** at your DNS provider pointing to your Hetzner server's public IP:

| Record | Type | Value |
|---|---|---|
| `swipeturn.com` | A | `<HETZNER_SERVER_IP>` |
| `www.swipeturn.com` | A | `<HETZNER_SERVER_IP>` |
| `api.swipeturn.com` | A | `<HETZNER_SERVER_IP>` |

Allow up to 24–48 hours for DNS propagation. Caddy will automatically issue TLS certificates once the DNS records resolve correctly.

### Updating the Production Server

To deploy code changes to production:

```bash
# SSH into the server
ssh root@<YOUR_SERVER_IP>

cd /opt/swipeturn

# Pull latest changes from GitHub
git pull origin main

# Rebuild and restart containers
docker compose up -d --build

# To verify all services are healthy
docker compose ps

# To check API health
curl https://api.swipeturn.com/health

# To tail logs from a specific service
docker compose logs -f api
docker compose logs -f pipeline
```

> **Model re-download:** If you update the AI model names in `embeddings.py` or `reranker.py`, the `swipeturn-hf-cache` volume will be populated on the first container start with the new model. This can take 5–15 minutes depending on model size. The API healthcheck has a `start_period: 30s` and 5 retries to accommodate this.

---

## Mobile App Builds (EAS)

SwipeTurn uses **Expo Application Services (EAS)** for building and distributing the mobile app. The project is linked to EAS under the account `modo-yo`.

### Prerequisites

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Log in to Expo account
eas login

cd frontend
```

### Development Build

A development build includes the Expo dev client, enabling hot reload and developer tooling on a physical device.

```bash
# iOS (requires an Apple Developer account)
eas build --profile development --platform ios

# Android
eas build --profile development --platform android
```

Install the resulting build on your device, then start the dev server:

```bash
yarn dev
```

### Preview Build

An internal distribution build for testing. Shareable via a direct install link (no App Store required).

```bash
eas build --profile preview --platform all
```

### Production Build

```bash
# Build for both platforms
eas build --profile production --platform all

# Submit to App Store / Play Store
eas submit --platform ios
eas submit --platform android
```

> **Status:** As of June 2025, the app has EAS builds configured but is not yet publicly distributed on the App Store or Play Store.

---

## API Reference

The backend API is available at `https://api.swipeturn.com`. A Swagger UI is available at `https://api.swipeturn.com/docs`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check — returns `{status: "ok", version: "2.0.0"}` |
| `GET` | `/users/me` | Bearer / Guest | Get current user profile |
| `PATCH` | `/users/me` | Bearer | Update preferences, target locations, job type |
| `POST` | `/users/upload-cv` | Bearer | Upload PDF/DOCX CV, triggers parse + embedding |
| `POST` | `/users/merge-guest` | Bearer | Merge a guest session into authenticated account |
| `GET` | `/jobs/feed` | Bearer / Guest | Get personalized swipe feed (paginated) |
| `GET` | `/jobs/search` | Bearer / Guest | Search jobs by query string |
| `GET` | `/jobs/{job_id}` | None | Get single job details |
| `POST` | `/swipes/` | Bearer / Guest | Record a swipe (save/skip/apply) |
| `GET` | `/swipes/saved` | Bearer / Guest | Get saved jobs list |
| `DELETE` | `/swipes/saved/{job_id}` | Bearer / Guest | Remove from saved list |

**Auth headers:**
- Authenticated: `Authorization: Bearer <clerk_jwt>`
- Guest: `X-Guest-Id: <uuid>`

---

## Authentication & Guest Mode

SwipeTurn supports two modes:

**Guest Mode** — No sign-up required. A UUID guest ID is generated on first launch and sent via `X-Guest-Id` header. Guest sessions are isolated per app launch (state is wiped on each fresh start). Swipes and preferences are stored server-side under the guest ID.

**Signed-in Mode** — Via Clerk (email/password or Google OAuth). On sign-in, any pending guest session is automatically merged into the authenticated account (`POST /users/merge-guest`). On sign-out, all guest-only local state (onboarding flags, feed cache, guest ID) is cleared via `clearGuestLocalState()`.

---

## Design System

The app uses a custom design token system defined in `frontend/constants/colors.ts`.

| Token | Value | Usage |
|---|---|---|
| `COLORS.accent` | `#FF4422` | Brand primary, buttons, CTAs |
| `COLORS.accentSuccess` | `#10B981` | Success states, match score |
| `COLORS.textPrimary` | `#111827` | Main headings and body |
| `COLORS.textSecondary` | `#374151` | Subtitles |
| `COLORS.textMuted` | `#6B7280` | Meta info, placeholders |
| `COLORS.background` | `#F8F9FA` | Screen backgrounds |
| `COLORS.surface` | `#FFFFFF` | Cards, modals |
| `COLORS.border` | `#E5E7EB` | Dividers, input borders |

**Typography:**
- **ClashDisplay** (Bold, Semibold) — Headings, logo
- **Satoshi** (Regular, Medium, Bold) — Body text, UI labels

---

## Project Conventions

Full conventions are documented in [`.gemini/config/skills/project-conventions/SKILL.md`](.gemini/config/skills/project-conventions/SKILL.md). Key rules:

- **TypeScript everywhere** — `interface` over `type`, strict mode enabled
- **Functional components only** — no classes
- **State management** — Zustand for global state, local `useState` only for UI-local state
- **Styling** — use `COLORS` tokens only; never hardcode hex values in components
- **Navigation** — use `router.replace()` for auth/onboarding flows (not `push`) to prevent stacking back routes
- **Safe area** — always use `useSafeAreaInsets()` for padding; never hardcode notch/status bar values
- **Performance** — `useMemo` / `useCallback` for expensive operations; `expo-image` with caching for all images
- **Expo managed workflow** — do not introduce bare native dependencies that require manual linking
