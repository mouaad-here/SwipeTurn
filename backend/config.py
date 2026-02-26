import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
CLERK_PEM_KEY = os.getenv("CLERK_PEM_KEY", "").replace("\\n", "\n")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
