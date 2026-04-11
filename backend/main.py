import os
import sys
import asyncio
import threading

if sys.platform == 'win32':
    # This prevents WinError 10035 when using sync http clients in async threadpools
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers import users, jobs, swipes, public


def _preload_models():
    """Load embedding and reranker models in the background so first requests are fast."""
    try:
        from services.embeddings import get_embedding_model
        from services.reranker import warmup
        get_embedding_model()
        warmup()
    except Exception as e:
        print(f"Preload embedding/reranker models (non-blocking): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    t = threading.Thread(target=_preload_models, daemon=True)
    t.start()
    yield


app = FastAPI(title="SwipeTurn API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"Incoming request: {request.method} {request.url}")
    auth_header = request.headers.get("Authorization")
    print(f"Authorization Header present: {bool(auth_header)}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

app.include_router(users.router)
app.include_router(jobs.router)
app.include_router(swipes.router)
app.include_router(public.router)  # Public pages (no auth) — delete-request form

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "2.0.0"}


if __name__ == "__main__":
    import os
    import uvicorn
    from dotenv import load_dotenv
    load_dotenv()
    port = int(os.environ.get("PORT", "8000"))
    print(f"Starting backend on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
