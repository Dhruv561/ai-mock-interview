"""Gemini Live API endpoints (spike).

This router provides two endpoints:
1. GET /token — mints an ephemeral token for the client to connect to Gemini Live WebSocket
2. POST /review — accepts interview transcript and generates final review using the real evaluator

Gate both endpoints with the same judges-only auth check used elsewhere in the backend
(shared-secret token parameter), per CLAUDE.md §7 and architecture.md §U.
"""

from __future__ import annotations

import logging
import time
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, field_validator

from app.agents.evaluator import build_evidence, generate_final_review
from app.config import get_settings
from app.interview.schemas import ProblemInfo
from app.interview.state import InterviewState
from app.providers.llm import get_llm_provider
from app.providers.realtime.gemini import GeminiLiveTokenError, get_ephemeral_token, get_ws_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/gemini-live")


def _is_authorized(token: str | None) -> bool:
    """Check if the provided token is in the authorized list.
    Mirrors websocket/interview.py's _is_authorized pattern."""
    settings = get_settings()
    if not settings.session_shared_secrets_list:
        return True  # No auth gate configured
    return token in settings.session_shared_secrets_list


@router.get("/token")
async def mint_ephemeral_token(
    token: Annotated[str | None, Query(...)] = None,
) -> dict[str, str]:
    """Mint an ephemeral token for Gemini Live WebSocket connection.

    Query params:
        token: shared-secret authentication token (required if auth is gated)

    Returns:
        {
            "access_token": "...",  # ephemeral token for WebSocket
            "ws_url": "wss://...",  # WebSocket endpoint with token appended
            "model": "gemini-3.1-flash-live-preview"  # model name
        }
    """
    if not _is_authorized(token):
        raise HTTPException(status_code=403, detail="Unauthorized")

    settings = get_settings()

    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured — see .env.example",
        )

    try:
        access_token = await get_ephemeral_token(settings.gemini_api_key, settings.gemini_live_model)
        ws_url = get_ws_url(access_token)
        return {
            "access_token": access_token,
            "ws_url": ws_url,
            "model": settings.gemini_live_model,
        }
    except GeminiLiveTokenError as e:
        logger.error("Failed to mint ephemeral token: %s", e)
        raise HTTPException(status_code=500, detail="Failed to mint ephemeral token") from e


class TranscriptEntryRequest(BaseModel):
    """Single transcript entry from the client."""

    speaker: Literal["candidate", "interviewer"]
    text: str
    timestamp: float

    @field_validator("speaker")
    @classmethod
    def validate_speaker(cls, v: str) -> str:
        if v not in ("candidate", "interviewer"):
            raise ValueError("speaker must be 'candidate' or 'interviewer'")
        return v


class ReviewRequest(BaseModel):
    """Transcript + context for final review generation."""

    problem: ProblemInfo
    language: str
    transcript: list[TranscriptEntryRequest]
    started_at: float


@router.post("/review")
async def generate_review(
    request: ReviewRequest,
    token: Annotated[str | None, Query(...)] = None,
) -> dict:
    """Generate final review from transcript.

    Query params:
        token: shared-secret authentication token (required if auth is gated)

    Body:
        ProblemInfo, language, transcript entries, started_at timestamp

    Returns:
        FinalReview object (from agents/evaluator.py)
    """
    if not _is_authorized(token):
        raise HTTPException(status_code=403, detail="Unauthorized")

    settings = get_settings()

    # Build minimal interview state from transcript (no code analysis, rubric, etc.)
    transcript_entries = [
        {
            "speaker": entry.speaker,
            "text": entry.text,
            "timestamp": entry.timestamp,
        }
        for entry in request.transcript
    ]

    state = InterviewState(
        problem=request.problem,
        language=request.language,
        stage="review",
        timestamp_started=request.started_at,
        timestamp_ended=time.time(),
        transcript=transcript_entries,  # type: ignore
        code_analysis_observations=[],
        hints_available_count=3,
        hint_level=0,
        recent_interviewer_actions=[],
        rubric={},
        rubric_history=[],
        stage_history=[],
    )

    try:
        provider = get_llm_provider(settings)
        review = await generate_final_review(state, provider)
        return review.model_dump(mode="json")
    except Exception as e:
        logger.error("Failed to generate review: %s", e)
        raise HTTPException(status_code=500, detail="Failed to generate review") from e
