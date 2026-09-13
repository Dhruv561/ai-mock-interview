"""DEPRECATED FALLBACK (2026-09-13): the extension's default panel
(ConvaiInterviewPanel.tsx) no longer connects here — it talks straight to
an ElevenLabs Conversational AI agent via /api/convai/* (api/convai.py)
instead. This endpoint is kept working and tested, not deleted, reachable
by building the extension with VITE_USE_LEGACY_PIPELINE=true. See
architecture.md's "Default interviewer pipeline" addendum for the full
decision record, including what the default pipeline gives up by not using
this one (tiered hints, live stage tracking, rubric-evidenced review).

WebSocket session transport (Feature 06 — architecture.md §G), the STT
audio relay (Feature 05 — architecture.md §E/§H), the interview state
machine wiring (Feature 07 — architecture.md §I), the AI interviewer
+ controller (Feature 08 — architecture.md §J/§L), and session persistence
(Feature 15 — architecture.md §Q).

Owns connection lifecycle, event validation, the resume/replay protocol,
forwarding binary mic-audio frames to a per-session STT provider, keeping
each session's InterviewState up to date as events arrive, — via
_maybe_speak — asking the interviewer agent for a proposed action and
having the controller decide whether to actually execute it, and (via
`_persist`) writing session lifecycle/events/final review to a
SessionRepository in the background.
screen.recording.*/session.pause are validated and keep the session alive
but don't yet drive any behaviour (Features 08's controller only reacts to
code/transcript/hint events right now; recording state is Feature 12).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections import deque
from collections.abc import Coroutine
from dataclasses import dataclass, field
from typing import TypeVar

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ValidationError
from starlette.websockets import WebSocketState

from app.agents.code_analyser import analyse_code
from app.agents.evaluator import generate_final_review
from app.agents.interviewer import propose_interviewer_action
from app.config import Settings, get_settings
from app.interview.actions import InterviewerAction
from app.interview.controller import InterviewController
from app.interview.prompts import Trigger
from app.interview.schemas import (
    CLIENT_EVENT_ADAPTER,
    CodeUpdateEvent,
    DevSimulateTranscriptEvent,
    ErrorEvent,
    HintRequestedEvent,
    HintResponseEvent,
    InterviewerAudioEndEvent,
    InterviewerAudioStartEvent,
    InterviewerStateEvent,
    InterviewerTranscriptEvent,
    ProblemInfo,
    ReviewReadyEvent,
    RubricUpdatedEvent,
    SessionEndEvent,
    SessionResumeEvent,
    SessionStartedEvent,
    SessionStartEvent,
    TranscriptFinalEvent,
    TranscriptPartialEvent,
)
from app.interview.state import InterviewState, TranscriptEntry
from app.persistence import get_repository
from app.persistence.repository import SessionRepository
from app.providers.llm import get_llm_provider
from app.providers.llm.base import LLMProvider
from app.providers.stt import get_stt_provider
from app.providers.stt.base import STTSession
from app.providers.tts import get_tts_provider
from app.providers.tts.base import TTSProvider

logger = logging.getLogger(__name__)

router = APIRouter()

# Sessions survive a single disconnect so a reconnecting client can resume
# (architecture.md §G) — kept in-memory only, single-process, acceptable
# for a hackathon deployment (documented limitation, §Q).
SESSION_GRACE_SECONDS = 5 * 60
RING_BUFFER_SIZE = 200

# Action types whose accepted proposal can carry rubric_updates
# (architecture.md §O) — everything except remain_silent, which never
# scores anything. Checked once, generically, rather than duplicating the
# rubric_updates check across each of _maybe_speak's three branches below.
_RUBRIC_CARRYING_ACTIONS = frozenset({"ask_question", "give_hint", "transition_stage"})


@dataclass
class SessionRecord:
    session_id: str
    state: InterviewState
    controller: InterviewController
    seq: int = 0
    events: deque[dict] = field(default_factory=lambda: deque(maxlen=RING_BUFFER_SIZE))
    last_seen: float = field(default_factory=time.monotonic)
    created_at: float = field(default_factory=time.monotonic)
    # The connection currently allowed to receive live sends for this
    # session — reassigned on session.start and on every session.resume, so
    # server-initiated events (e.g. STT callbacks firing later, off a
    # background task) reach whichever connection is actually live rather
    # than a stale one captured by closure at session-start time.
    active_ws: WebSocket | None = None
    stt_session: STTSession | None = None
    # Resolved once at session.start (Feature 15 / architecture.md §Q),
    # same lifecycle as stt_session — not re-resolved per event, since a
    # real repository may hold a connection pool.
    repository: SessionRepository | None = None
    # Resolved once at session.start, same lifecycle/reasoning as
    # stt_session and repository above — a real LLMProvider/TTSProvider
    # (e.g. AnthropicLLMProvider) owns its own HTTP client/connection pool,
    # so rebuilding one on every qualifying turn threw that pool away and
    # paid connection-setup cost on the hot path (Feature 20 cleanup).
    llm_provider: LLMProvider | None = None
    tts_provider: TTSProvider | None = None
    # Guards the check-LLM-call-accept sequence in `_maybe_speak` so two
    # near-simultaneous triggers (the main receive loop and, with a real
    # STT provider, its background relay task's on_final callback) can't
    # both pass `can_speak`'s cooldown/dedup gate before either has written
    # back (Feature 20 cleanup — see `_maybe_speak`'s docstring).
    speak_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # Set from STT partial/final callbacks (and the dev.simulate_transcript
    # stand-in) so `_maybe_speak` can enforce architecture.md §L rule 1
    # ("never speak while the candidate is mid-utterance") — previously
    # declared as a `can_speak` parameter but never actually set anywhere
    # (Feature 20 cleanup).
    is_candidate_speaking: bool = False

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq


class SessionRegistry:
    """Module-level singleton so a session outlives the connection object
    it was created on — a fresh WebSocket from a reconnecting client looks
    it up by id, not by which socket created it."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionRecord] = {}

    def create(self, problem: ProblemInfo, language: str, *, started_at: float) -> SessionRecord:
        session_id = str(uuid.uuid4())
        state = InterviewState(problem=problem, language=language, started_at=started_at)
        controller = InterviewController(state)
        record = SessionRecord(session_id=session_id, state=state, controller=controller)
        self._sessions[session_id] = record
        return record

    def get(self, session_id: str) -> SessionRecord | None:
        record = self._sessions.get(session_id)
        if record is None:
            return None
        if time.monotonic() - record.last_seen > SESSION_GRACE_SECONDS:
            del self._sessions[session_id]
            return None
        return record

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def active_count(self) -> int:
        """Count of sessions not yet past their grace window — purges
        expired entries first so a cap check never counts sessions nobody
        can resume anymore."""
        now = time.monotonic()
        expired = [
            sid
            for sid, record in self._sessions.items()
            if now - record.last_seen > SESSION_GRACE_SECONDS
        ]
        for sid in expired:
            del self._sessions[sid]
        return len(self._sessions)


sessions = SessionRegistry()

# Fire-and-forget persistence tasks (see `_persist`) must be kept alive
# somewhere — asyncio only holds a weak reference to a task created via
# `create_task`, so a task with nothing else referencing it can be
# garbage-collected mid-flight. This module-level set is that "somewhere",
# with each task removing itself once done.
_background_tasks: set[asyncio.Task[None]] = set()


async def _run_persistence(coro: Coroutine[None, None, None], description: str) -> None:
    try:
        await coro
    except Exception:
        # Persistence must never break a live interview (Feature 15 design
        # decision — see `_persist`'s docstring). Same swallow-and-log
        # posture as _speak_audio's TTS failure handling below.
        logger.exception("Persistence write failed (%s); interview continues", description)


def _persist(coro: Coroutine[None, None, None], description: str) -> None:
    """Fire-and-forget a persistence write.

    Design decision (Feature 15): persistence writes run as a background
    task rather than being awaited inline. `_emit` is the hot path every
    single interviewer/candidate event passes through, and CLAUDE.md
    principle 4 / this file's own latency discipline (see _speak_audio's
    docstring, and the STT-failure handling in the binary-frame branch)
    already treats "external I/O must never block or add latency to the
    live interview" as a hard rule for TTS and STT. A database write
    (especially a real Postgres round-trip) is exactly that kind of
    external I/O, so it gets the same treatment: scheduled, not awaited,
    with failures logged and swallowed rather than raised — a lost write
    must degrade to "this session has a gap in its persisted history", not
    to a dropped WebSocket message or a delayed interviewer response.
    """
    task = asyncio.create_task(_run_persistence(coro, description))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _emit(record: SessionRecord, event: dict) -> None:
    """Stamps + buffers an event for a session, and sends it live if a
    connection is currently attached. Buffering happens unconditionally so
    a reconnecting client can still replay it even if nothing was attached
    to receive it live (e.g. an STT result that arrives mid-reconnect)."""
    stamped = {**event, "seq": record.next_seq()}
    record.events.append(stamped)
    record.last_seen = time.monotonic()

    if record.repository is not None:
        # Every event a session ever emits (transcript, code-triggered
        # reactions, hints, rubric updates, stage transitions, review.ready)
        # already funnels through this one chokepoint — persisting here
        # keeps persistence orthogonal to business logic instead of
        # scattering append_event calls across every branch that emits.
        _persist(record.repository.append_event(record.session_id, stamped), "append_event")

    ws = record.active_ws
    if ws is not None and ws.client_state == WebSocketState.CONNECTED:
        try:
            await ws.send_json(stamped)
        except RuntimeError:
            pass  # connection dropped between the state check and the send


_EventT = TypeVar("_EventT", bound=BaseModel)


async def _emit_new(record: SessionRecord, event_cls: type[_EventT], **fields: object) -> None:
    """Builds `event_cls(seq=0, **fields)` and emits it. `_emit` always
    overwrites the placeholder `seq=0` with the session's real next
    sequence number, so every call site below was otherwise repeating this
    same "construct with seq=0, model_dump, emit" shape (Feature 20
    cleanup) — this is just that shape, named once."""
    event = event_cls(seq=0, **fields)
    await _emit(record, event.model_dump())


async def _transition_to_review(record: SessionRecord, *, now: float = 0.0) -> None:
    """Transitions into "review" and emits the resulting stage event.
    Shared by session.end and the forced-time-limit-end path (Feature 20
    cleanup) — both did this identically, previously duplicated inline and
    only cross-referenced via docstring ("mirrors SessionEndEvent's
    cleanup")."""
    record.state.transition_to("review", now=now)
    await _emit_new(record, InterviewerStateEvent, stage=record.state.stage)


async def _send_error(ws: WebSocket, seq: int, code: str, message: str, recoverable: bool) -> None:
    event = ErrorEvent(seq=seq, code=code, message=message, recoverable=recoverable)
    await ws.send_json(event.model_dump())


async def _close_stt_session_on_disconnect(record: SessionRecord | None) -> None:
    """Closes the session's live STT connection when its WebSocket drops
    (Feature 20 cleanup — previously nothing closed this on a raw
    disconnect, leaking one open upstream STT connection per abandoned tab
    for up to SESSION_GRACE_SECONDS). Only the STT connection is closed
    here, not the session record itself: the record deliberately survives
    the grace window so a reconnecting client can `session.resume`
    (architecture.md §G) — `SessionResumeEvent` below re-opens a fresh STT
    session in that case, the same way `SessionStartEvent` opens the first
    one. `record.repository` needs no matching cleanup: it no longer owns
    a per-session resource once `PostgresRepository` shares one module-
    level pool (see persistence/postgres.py)."""
    if record is None or record.stt_session is None:
        return
    try:
        await record.stt_session.close()
    except Exception:
        logger.exception("Failed to close STT session during disconnect cleanup")
    record.stt_session = None


async def _speak_audio(record: SessionRecord, settings: Settings, text: str) -> None:
    """Synthesizes `text` to speech and streams it to the client, per the
    wire contract in architecture.md §M: interviewer.audio.start, zero or
    more raw PCM binary frames, interviewer.audio.end.

    Best-effort and purely additive — the interviewer's text has already
    been emitted by the caller before this is ever called. Any failure
    here (provider unreachable, key revoked, stream drops mid-utterance)
    is logged and swallowed; it must never raise out of here and disrupt
    the interview session (architecture.md §M risk: "TTS failure must not
    block the interview").

    Design choice: interviewer.audio.start/end always bracket the attempt,
    even when the provider yields zero chunks (the mock provider, or a
    real provider call that fails before producing any audio). This keeps
    exactly one code path on the client — open a player on start, feed it
    whatever binary frames arrive (maybe none), close it on end — rather
    than needing a second case for "no audio was even attempted for this
    utterance."

    Binary frames are sent directly on record.active_ws, bypassing _emit's
    ring buffer/replay (same as the existing candidate-to-server mic audio
    path): audio is live-only, and a client that reconnects mid-utterance
    simply misses whatever audio it already missed, which is acceptable
    per architecture.md §M's own risk note.

    Mute is a client-only concern (architecture.md §M / §G describe
    playback, with no server-side mute event in the typed contract) — the
    server keeps synthesizing and sending regardless of client-side UI
    state, same as other client-only toggles elsewhere in this codebase.
    """
    started = False
    try:
        provider = record.tts_provider or get_tts_provider(settings)
        await _emit_new(record, InterviewerAudioStartEvent, format="pcm_s16le_16000")
        started = True

        async for chunk in provider.synthesize(text):
            ws = record.active_ws
            if ws is not None and ws.client_state == WebSocketState.CONNECTED:
                try:
                    await ws.send_bytes(chunk)
                except RuntimeError:
                    pass  # connection dropped mid-stream; drop this chunk and continue
    except Exception:
        logger.exception("TTS synthesis failed; continuing with text-only interviewer response")
    finally:
        if started:
            await _emit_new(record, InterviewerAudioEndEvent)


def _is_authorized(ws: WebSocket, settings: Settings) -> bool:
    """No secrets configured (the default) means auth is off — this is a
    deployment-only safeguard (Feature 19), not something local dev should
    ever need to think about."""
    allowed = settings.session_shared_secrets_list
    if not allowed:
        return True
    return ws.query_params.get("token") in allowed


def _duration_exceeded(record: SessionRecord, settings: Settings) -> bool:
    limit = settings.session_max_duration_seconds
    if limit <= 0:
        return False
    return time.monotonic() - record.created_at > limit


async def _force_end_for_time_limit(ws: WebSocket, record: SessionRecord) -> None:
    """Mirrors SessionEndEvent's cleanup (close STT, move to review) plus an
    explicit, non-recoverable error so the client knows *why* the session
    ended rather than reading it as a dropped connection, then closes the
    socket and forgets the session — it must not be resumable past its own
    hard limit."""
    if record.stt_session is not None:
        await record.stt_session.close()
        record.stt_session = None
    if record.state.stage != "review":
        await _transition_to_review(record)
    await _send_error(
        ws, 0, "session_time_limit", "Session ended: maximum duration reached.", False
    )
    sessions.remove(record.session_id)
    await ws.close()


async def _maybe_speak(
    record: SessionRecord,
    settings: Settings,
    *,
    trigger: Trigger = "code_update",
    hint_requested: bool = False,
) -> None:
    """Asks the interviewer agent for a proposal and, if the controller
    accepts it, emits whatever event that proposal implies. Silence
    (remain_silent, or any rejected proposal) emits nothing at all — that
    is the intended behaviour (CLAUDE.md: "the interviewer should not
    speak on every event"), not a missing code path.

    The whole check-LLM-call-accept sequence runs under `record.speak_lock`
    (Feature 20 cleanup): this is called from more than one trigger source
    on the same session — the main WS receive loop (code.update, hint
    requests, dev.simulate_transcript) and, once a real STT provider is
    wired up, its background relay task's on_final callback — and
    `can_speak`/`accept_proposal` only read/write `_last_spoke_at` around
    an `await` to the LLM. Without a lock, two near-simultaneous triggers
    could both observe the cooldown as open, both await the LLM
    concurrently, and both get accepted — a double-speak inside what
    should be one cooldown window. Held for the whole LLM round-trip
    (and the TTS synthesis after it), not just the check, which is
    correct here: the interviewer should only ever be "composing" one
    utterance at a time for a given session."""
    async with record.speak_lock:
        now = time.time()
        if not record.controller.can_speak(
            now=now,
            hint_requested=hint_requested,
            is_candidate_speaking=record.is_candidate_speaking,
        ):
            return

        provider = record.llm_provider or get_llm_provider(settings)
        proposal = await propose_interviewer_action(record.state, provider, trigger=trigger)
        accepted = record.controller.accept_proposal(proposal, now=now)
        if accepted is None:
            return

        await _act_on_accepted_proposal(record, settings, accepted, now=now)


async def _act_on_accepted_proposal(
    record: SessionRecord, settings: Settings, accepted: InterviewerAction, *, now: float
) -> None:
    """Emits whatever event(s) an accepted proposal implies. Split out of
    `_maybe_speak` only so that function's body reads as "gate, then act"
    without also holding indentation for every action branch under the
    lock — this is still called from inside `_maybe_speak`'s `speak_lock`."""
    if accepted.action == "ask_question" and accepted.message:
        record.state.recent_interviewer_actions.append(f"asked: {accepted.message}")
        entry = TranscriptEntry(speaker="interviewer", text=accepted.message, timestamp=now)
        record.state.transcript.append(entry)
        await _emit_new(record, InterviewerTranscriptEvent, text=accepted.message)
        await _speak_audio(record, settings, accepted.message)

    elif accepted.action == "give_hint" and accepted.message:
        level = record.state.hint_level
        record.state.recent_interviewer_actions.append(f"hint (level {level}): {accepted.message}")
        await _emit_new(record, HintResponseEvent, level=level, text=accepted.message)
        await _speak_audio(record, settings, accepted.message)

    elif accepted.action == "transition_stage":
        await _emit_new(record, InterviewerStateEvent, stage=record.state.stage)
        if accepted.message:
            entry = TranscriptEntry(speaker="interviewer", text=accepted.message, timestamp=now)
            record.state.transcript.append(entry)
            await _emit_new(record, InterviewerTranscriptEvent, text=accepted.message)
            await _speak_audio(record, settings, accepted.message)

    # Rubric updates ride along with an already-gated, accepted action —
    # they never get a second, separate trigger of their own (that's what
    # keeps them "not excessively noisy", architecture.md §O risk note).
    # `record.state.rubric` is already updated by this point (controller.
    # accept_proposal applies it before returning), so this always sends
    # the full current rubric, not just the delta — matching
    # RubricUpdatedEvent's schema shape.
    if accepted.action in _RUBRIC_CARRYING_ACTIONS and accepted.rubric_updates:
        await _emit_new(
            record,
            RubricUpdatedEvent,
            rubric=record.state.rubric,
            evidence=accepted.rubric_evidence or "",
        )


async def _generate_and_emit_review(record: SessionRecord, settings: Settings) -> None:
    """Feature 14 / architecture.md §P: generates the evidence-grounded
    final review and emits it as review.ready. Called once, right after
    session.end transitions the session into "review" (see the
    SessionEndEvent branch above).

    Failure handling deliberately mirrors the STT-failure pattern
    elsewhere in this file (log + send an explicit, recoverable ErrorEvent)
    rather than _speak_audio's silent-swallow pattern: TTS can degrade
    silently because the interviewer's text has already reached the client
    by the time synthesis is attempted, so there's already a usable
    fallback (text without audio). Here there is no fallback content
    already delivered — if review generation fails outright (both
    evaluator attempts invalid, or the provider unreachable), the client's
    Review UI would otherwise wait forever for a review.ready that never
    arrives. The interview must still end cleanly (architecture.md §P /
    CLAUDE.md STOP-safety), so this logs and notifies rather than raising
    out of the WS handler."""
    try:
        provider = record.llm_provider or get_llm_provider(settings)
        final_review = await generate_final_review(record.state, provider)
    except Exception:
        # Broad on purpose (same as the STT-send failure handler above):
        # FinalReviewGenerationError (both evaluator attempts invalid) and
        # any provider-transport failure must both degrade the same way —
        # the interview session must survive either.
        logger.exception("Final review generation failed; interview still ends")
        await _emit_new(
            record,
            ErrorEvent,
            code="review_generation_failed",
            message="Could not generate the final review for this session.",
            recoverable=True,
        )
        return

    if record.repository is not None:
        _persist(
            record.repository.save_final_review(record.session_id, final_review),
            "save_final_review",
        )

    await _emit_new(record, ReviewReadyEvent, review=final_review)


def _make_transcript_callbacks(session_id: str, settings: Settings):
    """STT provider callbacks close over a session_id, not a SessionRecord
    or WebSocket, so they keep working correctly even if the session has
    since been resumed on a different connection (or none at all).

    Also the single place `record.is_candidate_speaking` is maintained for
    a real (non-mock) STT provider (architecture.md §L rule 1 — Feature 20
    cleanup, this flag previously had no writer anywhere): a partial
    result means the candidate is still mid-utterance, a final result
    means it just ended. `dev.simulate_transcript` (websocket/interview.py,
    mock-mode only) mirrors this same set/clear around its own synthetic
    partial+final pair for the same reason."""

    async def on_partial(text: str) -> None:
        record = sessions.get(session_id)
        if record is None:
            return
        record.is_candidate_speaking = True
        await _emit_new(record, TranscriptPartialEvent, text=text)

    async def on_final(text: str) -> None:
        record = sessions.get(session_id)
        if record is None:
            return
        record.is_candidate_speaking = False
        timestamp = time.time()
        entry = TranscriptEntry(speaker="candidate", text=text, timestamp=timestamp)
        record.state.transcript.append(entry)
        await _emit_new(record, TranscriptFinalEvent, text=text, timestamp=timestamp)
        await _maybe_speak(record, settings, trigger="transcript_final")

    return on_partial, on_final


@router.websocket("/ws/interview")
async def interview_socket(ws: WebSocket) -> None:
    settings = get_settings()
    if not _is_authorized(ws, settings):
        # Rejected before accept() — an unauthorized client never completes
        # the handshake, so it can't hold a connection open or trigger any
        # session-creation work at all. 4401 is an app-defined close code in
        # the 4000-4999 (private use) range; there is no standard WS code
        # for "unauthorized".
        await ws.close(code=4401)
        return

    await ws.accept()
    record: SessionRecord | None = None

    try:
        while True:
            message = await ws.receive()

            if message["type"] == "websocket.disconnect":
                await _close_stt_session_on_disconnect(record)
                return

            if record is not None and _duration_exceeded(record, settings):
                await _force_end_for_time_limit(ws, record)
                return

            if message.get("bytes") is not None:
                if record is None:
                    await _send_error(ws, 0, "no_active_session", "Send session.start first.", True)
                    continue
                if record.stt_session is not None:
                    try:
                        await record.stt_session.send_audio(message["bytes"])
                    except Exception:
                        # A dead STT upstream must never kill the interview
                        # (architecture.md §H). Before this guard existed, a
                        # Deepgram close raised straight out of the ASGI
                        # handler, dropped the client's WebSocket, and the
                        # client's own reconnect/resume re-entered the same
                        # failure — an infinite crash-reconnect loop observed
                        # live on 2026-09-13.
                        logger.exception("STT send failed; continuing without transcription")
                        try:
                            await record.stt_session.close()
                        except Exception:
                            pass
                        record.stt_session = None
                        await _send_error(
                            ws,
                            0,
                            "stt_unavailable",
                            "Transcription stopped; the interview continues without it.",
                            True,
                        )
                record.last_seen = time.monotonic()
                continue

            raw = message.get("text")
            if raw is None:
                continue

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await _send_error(ws, 0, "invalid_json", "Message was not valid JSON.", True)
                continue

            try:
                client_event = CLIENT_EVENT_ADAPTER.validate_python(data)
            except ValidationError as exc:
                first_error = exc.errors()[0]
                loc = ".".join(str(part) for part in first_error["loc"])
                await _send_error(
                    ws,
                    0,
                    "invalid_event",
                    f"Event failed validation at '{loc}': {first_error['msg']}",
                    True,
                )
                continue

            if isinstance(client_event, SessionStartEvent):
                cap = settings.max_concurrent_sessions
                if cap > 0 and sessions.active_count() >= cap:
                    message_text = "Interview capacity reached; try again shortly."
                    await _send_error(ws, 0, "capacity_reached", message_text, True)
                    continue

                record = sessions.create(
                    client_event.problem, client_event.language, started_at=time.time()
                )
                record.active_ws = ws
                record.repository = get_repository(settings)
                # LLM/TTS providers, like the repository and STT session
                # above, are resolved once per session rather than fresh on
                # every call (Feature 20 cleanup) — a real provider (e.g.
                # AnthropicLLMProvider) owns its own HTTP client/connection
                # pool, so rebuilding one on every qualifying turn threw
                # that pool away and paid connection-setup cost on the hot
                # path for no benefit (both providers are cheap, stateless
                # wrappers otherwise — safe to share across the session).
                # Construction failures degrade the same way a per-call
                # factory failure already did (caught inside _speak_audio/
                # _maybe_speak, which fall back to calling the factory again
                # when nothing is cached) rather than aborting session.start.
                try:
                    record.llm_provider = get_llm_provider(settings)
                except Exception:
                    logger.exception("LLM provider construction failed at session.start")
                    record.llm_provider = None
                try:
                    record.tts_provider = get_tts_provider(settings)
                except Exception:
                    logger.exception("TTS provider construction failed at session.start")
                    record.tts_provider = None
                _persist(
                    record.repository.create_session(
                        record.session_id,
                        client_event.problem,
                        client_event.language,
                        record.state.started_at,
                    ),
                    "create_session",
                )
                on_partial, on_final = _make_transcript_callbacks(record.session_id, settings)
                try:
                    record.stt_session = await get_stt_provider(settings).start_session(
                        on_partial, on_final
                    )
                except Exception:
                    # STT connection failure must degrade gracefully, not
                    # kill the interview session (architecture.md §H risk).
                    record.stt_session = None
                await _emit_new(record, SessionStartedEvent, session_id=record.session_id)
                await _emit_new(record, InterviewerStateEvent, stage=record.state.stage)
                continue

            if isinstance(client_event, SessionResumeEvent):
                found = sessions.get(client_event.session_id)
                if found is None:
                    message_text = "Session expired or does not exist."
                    await _send_error(ws, 0, "session_not_found", message_text, False)
                    continue
                record = found
                record.active_ws = ws
                record.last_seen = time.monotonic()
                if record.stt_session is None:
                    # The previous connection's STT session was closed on
                    # disconnect (_close_stt_session_on_disconnect,
                    # Feature 20 cleanup) — re-open one the same way
                    # session.start does, so a resumed session keeps
                    # transcribing rather than silently losing STT for the
                    # rest of the interview. Callbacks close over
                    # session_id (not this ws), so they keep working
                    # correctly regardless of which connection is live.
                    on_partial, on_final = _make_transcript_callbacks(
                        record.session_id, settings
                    )
                    try:
                        record.stt_session = await get_stt_provider(settings).start_session(
                            on_partial, on_final
                        )
                    except Exception:
                        record.stt_session = None
                for buffered in record.events:
                    if buffered["seq"] > client_event.last_seq:
                        await ws.send_json(buffered)
                continue

            if record is None:
                message_text = "Send session.start or session.resume first."
                await _send_error(ws, 0, "no_active_session", message_text, True)
                continue

            if isinstance(client_event, DevSimulateTranscriptEvent):
                if not settings.use_mock_providers:
                    message_text = "dev.simulate_transcript is mock-mode only."
                    await _send_error(ws, 0, "mock_only", message_text, True)
                    continue
                # Mirrors _make_transcript_callbacks' on_partial/on_final
                # set/clear of is_candidate_speaking, so this mock-mode
                # stand-in exercises the same §L rule 1 gating a real STT
                # provider's callbacks would (Feature 20 cleanup).
                record.is_candidate_speaking = True
                await _emit_new(record, TranscriptPartialEvent, text=client_event.text)
                timestamp = time.time()
                text = client_event.text
                record.state.transcript.append(
                    TranscriptEntry(speaker="candidate", text=text, timestamp=timestamp)
                )
                record.is_candidate_speaking = False
                await _emit_new(
                    record, TranscriptFinalEvent, text=client_event.text, timestamp=timestamp
                )
                await _maybe_speak(record, settings, trigger="transcript_final")
                continue

            if isinstance(client_event, CodeUpdateEvent):
                # code.update only ever arrives after the extension's own
                # debounced meaningful-change detection
                # (extension/src/content/codeChangeDetector.ts) — no
                # additional backend-side debouncing belongs here (Feature
                # 09 acceptance criteria: "analysis is not triggered on
                # every keystroke"). This guard only skips the separate,
                # free case of the same snapshot arriving twice in a row.
                if client_event.code != record.state.current_code:
                    # Replace, don't accumulate: these observations
                    # describe the *current* code snapshot, not a running
                    # log of every past one — an ever-growing list would
                    # tell the interviewer stale things about code that no
                    # longer exists. Contrast with recent_interviewer_actions,
                    # which is deliberately append-only (it exists to avoid
                    # repeating past questions, so history is the point).
                    record.state.code_analysis_observations = analyse_code(
                        client_event.code, client_event.language
                    )
                record.state.current_code = client_event.code
                record.state.language = client_event.language
                record.last_seen = time.monotonic()
                await _maybe_speak(record, settings, trigger="code_update")
                continue

            if isinstance(client_event, HintRequestedEvent):
                # hint_level itself is incremented inside accept_proposal
                # (interview/controller.py) only once a give_hint action is
                # actually accepted — that's the single source of truth for
                # the level-3 cap (architecture.md §L rule 6), whether the
                # hint was explicitly requested (here) or proposed by the
                # LLM on its own initiative from another trigger.
                await _maybe_speak(record, settings, trigger="hint_requested", hint_requested=True)
                record.last_seen = time.monotonic()
                continue

            if isinstance(client_event, SessionEndEvent):
                if record.stt_session is not None:
                    await record.stt_session.close()
                    record.stt_session = None
                # Guarded by the same "not already in review" check as the
                # transition itself: a repeated session.end must stay
                # idempotent (test_session_end_transitions_to_review_and_is_idempotent),
                # so the final review is generated and emitted at most once
                # per session, not regenerated on every extra session.end.
                if record.state.stage != "review":
                    await _transition_to_review(record, now=time.time())
                    await _generate_and_emit_review(record, settings)
                record.last_seen = time.monotonic()
                continue

            # screen.recording.*, session.pause: accepted and keep the
            # session alive, but no interview-domain logic exists yet to
            # act on them (Features 08/12).
            record.last_seen = time.monotonic()

    except WebSocketDisconnect:
        await _close_stt_session_on_disconnect(record)
        return
