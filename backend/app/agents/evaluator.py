"""Evaluator agent (architecture.md §P, Feature 14) — assembles the
evidence-grounded final review once an interview ends. Mirrors agents/
interviewer.py's shape (condense domain state into prompt inputs, ask the
configured LLM provider, hand back a structured object) but for a
one-shot end-of-session grade rather than an ongoing turn-by-turn action.

Doesn't decide *when* to run — that's websocket/interview.py's
SessionEndEvent handler, same separation as interviewer.py/controller.py.
"""

from __future__ import annotations

import logging

from pydantic import ValidationError

from app.interview import evaluator_prompts
from app.interview.schemas import EvidenceItem, FinalReview
from app.interview.state import InterviewState
from app.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)


class FinalReviewGenerationError(Exception):
    """Raised when both the initial attempt and the single retry
    (architecture.md §P risk mitigation: "reject/retry once if a cited id
    doesn't exist") fail FinalReview's evidence-id validation. Callers
    (websocket/interview.py) catch this and degrade gracefully rather than
    letting a persistently-bad LLM citation crash the WS handler — the
    interview must still end cleanly even when review generation fails."""


def build_evidence(state: InterviewState) -> list[EvidenceItem]:
    """Deterministically flattens the interview record into the one
    evidence list the evaluator LLM (and FinalReview's own evidence-id
    validator) can cite. Id scheme: `f"{kind}-{index}"`, indexed
    independently per kind in the record's own natural order (transcript
    order, code-analysis-observation order, hint order within
    recent_interviewer_actions, rubric_history order, stage_history
    order) — simple, stable across re-generation of the same state, and
    lets evaluator_prompts._stage_and_elapsed recover a stage entry's
    original index (and hence its elapsed_seconds) straight from its id
    without re-parsing prose.

    Only the *current* code_analysis_observations snapshot is used, not a
    running history — matching Feature 09's own design (observations
    describe the current code, not an accumulated log; see state.py's
    InterviewState docstring)."""
    evidence: list[EvidenceItem] = []

    for index, entry in enumerate(state.transcript):
        evidence.append(
            EvidenceItem(
                id=f"transcript-{index}",
                kind="transcript",
                text=f"{entry.speaker}: {entry.text}",
            )
        )

    for index, observation in enumerate(state.code_analysis_observations):
        evidence.append(
            EvidenceItem(id=f"code_analysis-{index}", kind="code_analysis", text=observation)
        )

    # Hints are recorded into recent_interviewer_actions with a
    # "hint (level N): ..." prefix (websocket/interview.py's _maybe_speak) —
    # no separate structured hint log exists yet, so this prefix is the
    # actual available signal for "a hint was given."
    hint_texts = [
        action for action in state.recent_interviewer_actions if action.startswith("hint (level")
    ]
    for index, text in enumerate(hint_texts):
        evidence.append(EvidenceItem(id=f"hint-{index}", kind="hint", text=text))

    for index, entry in enumerate(state.rubric_history):
        categories_text = ", ".join(
            f"{category}={value}" for category, value in entry.categories.items()
        )
        evidence.append(
            EvidenceItem(
                id=f"rubric-{index}",
                kind="rubric",
                text=f"{entry.evidence} (rubric updated: {categories_text})",
            )
        )

    for index, entry in enumerate(state.stage_history):
        evidence.append(
            EvidenceItem(id=f"stage-{index}", kind="stage", text=f"Moved to stage: {entry.stage}")
        )

    return evidence


async def generate_final_review(state: InterviewState, provider: LLMProvider) -> FinalReview:
    """Builds the evidence list + evaluator prompt from `state` and asks
    `provider` for a FinalReview, retrying once (with an added note) if
    the first attempt cited an evidence id that doesn't exist —
    FinalReview's own model_validator raises ValidationError for that
    case (schemas.py), so this is the "retry once" half of architecture.md
    §P's reject/retry risk mitigation; the schema validator is the
    "reject" half.

    Raises FinalReviewGenerationError if the retry also fails validation.
    Any other exception (e.g. the provider being unreachable) is not
    retried here and propagates directly — retrying is specifically for
    correcting a bad citation, not for transient provider failures."""
    evidence = build_evidence(state)
    system_prompt = evaluator_prompts.build_system_prompt(state)
    user_prompt = evaluator_prompts.build_user_prompt(state, evidence)

    try:
        return await provider.propose_review(system_prompt, user_prompt)
    except ValidationError as first_error:
        logger.warning(
            "Evaluator LLM produced a review with an invalid evidence citation; "
            "retrying once: %s",
            first_error,
        )
        retry_prompt = evaluator_prompts.build_user_prompt(
            state,
            evidence,
            retry_note=(
                "Your previous response cited an evidence id that is not in the list "
                "below. Only cite ids exactly as they appear here."
            ),
        )
        try:
            return await provider.propose_review(system_prompt, retry_prompt)
        except ValidationError as second_error:
            raise FinalReviewGenerationError(
                "Evaluator LLM failed evidence-id validation on both attempts"
            ) from second_error
