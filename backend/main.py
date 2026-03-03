import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routers import users, jobs, swipes


def _preload_embedding_model():
    """Load the CV embedding model in the background so first upload is fast."""
    try:
        from services.embeddings import get_embedding_model
        get_embedding_model()
    except Exception as e:
        print(f"Preload embedding model (non-blocking): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload model in a thread so server starts immediately
    t = threading.Thread(target=_preload_embedding_model, daemon=True)
    t.start()
    yield
    # shutdown if needed
    pass


app = FastAPI(title="SwipeTurn API", lifespan=lifespan)

# Setup CORS for local testing and mobile requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"Incoming request: {request.method} {request.url}")
    # print(f"Headers: {request.headers}") # Uncomment to see all headers
    auth_header = request.headers.get("Authorization")
    print(f"Authorization Header present: {bool(auth_header)}")
    
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

app.include_router(users.router)
app.include_router(jobs.router)
app.include_router(swipes.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}


if __name__ == "__main__":
    import os
    import uvicorn
    from dotenv import load_dotenv
    load_dotenv()
    port = int(os.environ.get("PORT", "8000"))
    print(f"Starting backend on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
