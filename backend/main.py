from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import users

app = FastAPI(title="Swipturn API")

# Setup CORS for local testing and mobile requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}
