from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.api.openai_realtime import router as openai_realtime_router
from app.config import get_settings
from app.websocket.interview import router as ws_router

settings = get_settings()

app = FastAPI(title="AI Mock Interview Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(openai_realtime_router)
app.include_router(ws_router)
