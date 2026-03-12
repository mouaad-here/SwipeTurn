# SwipTurn Architecture (Current State)

As of right now, SwipTurn is split into three main pieces. This separation of concerns means your frontend (`app/`) doesn't talk directly to your database, and your backend (`backend/`) handles all the heavy lifting for security and AI matching.

## 1. Frontend: Mobile App (React Native / Expo)

- **Framework**: Expo (React Native), using Expo Router for file-based navigation (`app/` folder).
- **Role**: Displays the UI, handles user interaction (swipes, clicks), and captures user data (CV uploads, preferences).
- **Authentication**: Uses `Clerk` for managing user logins and JWT tokens.
- **Data Flow**: It NEVER speaks directly to Supabase. Instead, it securely calls your Python Backend API using the Clerk JWT in the `Authorization` header.

## 2. Backend API (Python / FastAPI)

- **Framework**: FastAPI (runs on port `8000` by default).
- **Location**: `backend/` folder.
- **Role**: The brain of the operation.
  - Validates the user's Clerk token.
  - Receives uploaded CVs, parses them, and generates Vector Embeddings using the `efederici/multilingual-e5-small-4096` model.
  - Queries Supabase for jobs, runs the Hybrid Matching Engine (Keyword intersection + Vector Cosine Similarity), and returns the scored feed to the Mobile App.
- **Key Files**:
  - `main.py`: The entry point for the server.
  - `routers/jobs.py`: The endpoint that serves the feed.
  - `services/matching.py`: The algorithm that calculates the `match_score` (0-100).

## 3. Database & Storage (Supabase)

- **Role**: Persistent data storage.
- **Core Tables**:
  - `users`: Stores user profiles, preferences (JSONB), and their CV vector embedding.
  - `jobs`: Stores scrapped jobs and their description vector embedding.
  - `swipes`: Records when a user swipes left or right on a job.
- **Extensions**: Uses `pgvector` to enable fast nearest-neighbor searches for the AI matchings.

## 4. Background Data Pipeline (Python)

- **Location**: `pipeline/` folder.
- **Role**: Asynchronous workers that scrape job boards, clean the data, and insert new `jobs` into Supabase. (Currently runs independently from the FastAPI server).
