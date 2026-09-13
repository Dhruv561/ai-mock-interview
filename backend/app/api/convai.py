"""REST endpoints backing the ElevenLabs Conversational AI spike
(spikes/elevenlabs-convai/README.md, progress.md's "Spike" section,
2026-09-13). Not part of the real interview WebSocket protocol
(architecture.md §G) — this is a parallel, opt-in pipeline the extension
can wire the LeetCode page into instead of the real one, so it gets its
own small router rather than growing api/routes.py or websocket/
interview.py with a second, unrelated protocol.

Two endpoints:
  - GET  /api/convai/signed-url — lets the extension open a WebSocket
    straight to ElevenLabs without ever holding ELEVENLABS_API_KEY
    itself (CLAUDE.md §7), same rule as the real pipeline's TTS key.
  - POST /api/convai/review — this pipeline has no InterviewState of its
    own (no controller, no rubric, no code analysis — see the spike
    README's "Known limitations"), so there is nothing for
    generate_final_review to read at session end unless something
    builds one. This endpoint builds a minimal InterviewState from the
    transcript the extension captured client-side and hands it to the
    *real* evaluator (agents/evaluator.py) — same evidence-based review
    the primary pipeline produces, just fed from this pipeline's own
    thinner record (transcript only, no rubric/hint/code-analysis
    evidence to cite).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.agents.evaluator import FinalReviewGenerationError, generate_final_review
from app.config import Settings, get_settings
from app.interview.schemas import ProblemInfo
from app.interview.state import InterviewState, TranscriptEntry
from app.providers.convai.elevenlabs import ConvaiSignedUrlError, get_signed_url
from app.providers.llm import get_llm_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/convai")


def _check_authorized(token: str | None, settings: Settings) -> None:
    """Same deployment-only shared-secret gate as websocket/interview.py's
    _is_authorized (Feature 19), reimplemented for a plain REST query
    param instead of a WebSocket's query_params. Both read
    settings.session_shared_secrets_list; empty (the local-dev default)
    means auth is off entirely, same as the WS route."""
    allowed = settings.session_shared_secrets_list
    if not allowed:
        return
    if token not in allowed:
        raise HTTPException(403, "Invalid or missing token")


@router.get("/signed-url")
async def signed_url(token: str | None = Query(default=None)) -> dict[str, str]:
    settings = get_settings()
    _check_authorized(token, settings)
    if not settings.elevenlabs_api_key or not settings.elevenlabs_convai_agent_id:
        raise HTTPException(
            500,
            "ELEVENLABS_API_KEY / ELEVENLABS_CONVAI_AGENT_ID not configured on this backend "
            "— see spikes/elevenlabs-convai/README.md",
        )
    try:
        url = await get_signed_url(
            settings.elevenlabs_api_key, settings.elevenlabs_convai_agent_id
        )
    except ConvaiSignedUrlError as error:
        logger.warning("ElevenLabs signed-url request failed: %s", error)
        raise HTTPException(502, str(error)) from error
    return {"signed_url": url}


class ConvaiTranscriptEntry(BaseModel):
    speaker: str
    text: str
    timestamp: float


class ConvaiReviewRequest(BaseModel):
    problem: ProblemInfo
    language: str
    transcript: list[ConvaiTranscriptEntry]
    started_at: float = 0.0


@router.post("/review")
async def review(body: ConvaiReviewRequest, token: str | None = Query(default=None)) -> dict:
    settings = get_settings()
    _check_authorized(token, settings)

    # TranscriptEntry.speaker is a Literal — constructing it below would
    # raise pydantic.ValidationError (an uncaught 500) for a bad value
    # rather than a clear 422, since it happens after FastAPI's own
    # request-body validation has already passed. Check explicitly instead.
    for entry in body.transcript:
        if entry.speaker not in ("candidate", "interviewer"):
            raise HTTPException(422, f"Invalid speaker: {entry.speaker!r}")

    state = InterviewState(
        problem=body.problem,
        language=body.language,
        stage="review",  # constructed directly, not via transition_to — this
        # state never lived through the real stage machine, so there's no
        # transition to validate; see state.py's own IllegalTransitionError.
        transcript=[
            TranscriptEntry(speaker=entry.speaker, text=entry.text, timestamp=entry.timestamp)
            for entry in body.transcript
        ],
        started_at=body.started_at,
    )

    provider = get_llm_provider(settings)
    try:
        final_review = await generate_final_review(state, provider)
    except FinalReviewGenerationError as error:
        logger.warning("Convai spike review generation failed: %s", error)
        raise HTTPException(502, str(error)) from error
    return final_review.model_dump()
