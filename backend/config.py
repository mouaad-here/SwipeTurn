import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
CLERK_PEM_KEY = os.getenv("CLERK_PEM_KEY", "").replace("\\n", "\n")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")

# Origins allowed for CORS (comma-separated string in .env)
_origins = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [o.strip() for o in _origins.split(",") if o] or ["http://localhost:8081"]
