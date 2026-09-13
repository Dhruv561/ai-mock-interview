"""OpenAI Realtime API spike endpoints (alternative interviewer pipeline).

Two endpoints:
1. GET /session — mints ephemeral credentials for direct client→OpenAI connection
2. POST /review — accepts interview transcript, generates final review using
   the real evaluator (evidence-grounded, CLAUDE.md §10)

Both are gated with the same shared-secret-token pattern used elsewhere in this
codebase for deployed judges-only auth (see websocket/interview.py).
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.agents.evaluator import generate_final_review
from app.config import get_settings
from app.interview.schemas import FinalReview, ProblemInfo
from app.interview.state import InterviewState, TranscriptEntry
from app.providers.llm import get_llm_provider
from app.providers.realtime.openai import mint_ephemeral_session, OpenAIRealtimeSessionError

router = APIRouter(prefix="/api/openai-realtime")


def _is_authorized(token: str | None) -> bool:
    """Check if the request has a valid shared-secret token (empty token list = no auth required)."""
    settings = get_settings()
    if not settings.session_shared_secrets_list:
        return True
    return token in settings.session_shared_secrets_list


@router.get("/session")
async def get_session(
    token: str | None = Query(None),
) -> dict:
    """Mint an ephemeral session token for OpenAI Realtime API client connection.

    Response contains:
    - session_id: OpenAI session UUID
    - ephemeral_key: Short-lived token for WebSocket auth
    - model: The realtime model being used
    - ws_url: OpenAI's Realtime WebSocket URL

    Gated with shared-secret token auth (see CONFIG: session_shared_secrets).
    """
    if not _is_authorized(token):
        raise HTTPException(status_code=401, detail="Unauthorized")

    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY not configured — see .env.example",
        )

    try:
        session = await mint_ephemeral_session(
            settings.openai_api_key,
            settings.openai_realtime_model,
        )
    except OpenAIRealtimeSessionError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "session_id": session["id"],
        "ephemeral_key": session["client_secret"]["value"],
        "model": settings.openai_realtime_model,
        "ws_url": "wss://api.openai.com/v1/realtime",
    }


class TranscriptEntryRequest(BaseModel):
    """One line of interview transcript (request format)."""
    speaker: Literal["candidate", "interviewer"]
    text: str
    timestamp: float = Field(default_factory=lambda: 0.0)


class ReviewRequest(BaseModel):
    """Request to generate a final review from transcript + problem context."""
    problem: ProblemInfo
    language: str
    transcript: list[TranscriptEntryRequest]
    started_at: float


@router.post("/review")
async def post_review(
    request: ReviewRequest,
    token: str | None = Query(None),
) -> dict:
    """Generate a final review for the completed interview.

    Takes transcript (speaker, text, timestamp) + problem context, uses the real
    evaluator agent to produce an evidence-grounded FinalReview (CLAUDE.md §10).

    Gated with shared-secret token auth (see CONFIG: session_shared_secrets).
    """
    if not _is_authorized(token):
        raise HTTPException(status_code=401, detail="Unauthorized")

    settings = get_settings()
    llm_provider = get_llm_provider(settings)

    # Build minimal InterviewState for the evaluator.
    # This pipeline has no server-side state machine, so we construct just enough.
    # Validate speaker is one of the allowed values before constructing TranscriptEntry.
    state_transcript = [
        TranscriptEntry(
            speaker=entry.speaker,  # type: ignore (already validated by Pydantic)
            text=entry.text,
            timestamp=entry.timestamp,
        )
        for entry in request.transcript
    ]

    state = InterviewState(
        session_id="openai-realtime-spike",
        stage="review",
        problem=request.problem,
        language=request.language,
        transcript=state_transcript,
        started_at=request.started_at,
        code="",
        hint_level=0,
    )

    try:
        review: FinalReview = await generate_final_review(state, llm_provider)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Review generation failed: {e}",
        )

    # Handle both Pydantic model and dict returns (for testing)
    if isinstance(review, dict):
        return review
    return review.model_dump(mode="json")
