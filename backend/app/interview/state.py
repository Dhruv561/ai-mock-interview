"""Interview state machine (architecture.md §I) — the single source of
truth for interview progress. Everything else (the WS layer today; the
controller and LLM in Feature 08) reads and writes through this object;
nothing bypasses it. Deliberately pure Python/Pydantic: no I/O, no LLM
calls, no network — that's what makes the transition table exhaustively
unit-testable without mocking anything.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.interview.schemas import InterviewStage, ProblemInfo, RubricCategory

# intro -> clarification -> approach -> coding, then coding/complexity/
# testing/optimisation form a loop the controller can revisit (real
# interviews go back and forth, not a straight line) - architecture.md §I.
# `review` is additionally reachable from every stage, not just the coding
# loop: a candidate can end the interview early (time runs out, gives up)
# at any point, and session.end must always be able to land on it.
_TRANSITIONS: dict[InterviewStage, frozenset[InterviewStage]] = {
    "intro": frozenset({"clarification", "review"}),
    "clarification": frozenset({"approach", "review"}),
    "approach": frozenset({"coding", "review"}),
    "coding": frozenset({"complexity", "testing", "optimisation", "review"}),
    "complexity": frozenset({"coding", "testing", "optimisation", "review"}),
    "testing": frozenset({"coding", "complexity", "optimisation", "review"}),
    "optimisation": frozenset({"coding", "complexity", "testing", "review"}),
    "review": frozenset(),
}


class IllegalTransitionError(ValueError):
    def __init__(self, current: InterviewStage, target: InterviewStage) -> None:
        super().__init__(f"Cannot transition from {current!r} to {target!r}")
        self.current = current
        self.target = target


class TranscriptEntry(BaseModel):
    speaker: Literal["candidate", "interviewer"]
    text: str
    timestamp: float


def _empty_rubric() -> dict[RubricCategory, int]:
    return {
        "clarifying": 0,
        "approach": 0,
        "code_quality": 0,
        "complexity": 0,
        "communication": 0,
        "testing": 0,
    }


class InterviewState(BaseModel):
    """The object handed to the LLM and to the evaluator once those exist
    (Features 08/14). Most fields here are only ever written to by
    features not built yet (rubric scoring: 13, code analysis: 09,
    interviewer actions: 08) and stay at their empty defaults until then —
    that's expected, not a bug; see FEATURE_PROGRESS.md Feature 07."""

    problem: ProblemInfo
    language: str
    stage: InterviewStage = "intro"
    current_code: str = ""
    transcript: list[TranscriptEntry] = Field(default_factory=list)
    rubric: dict[RubricCategory, int] = Field(default_factory=_empty_rubric)
    hint_level: int = 0
    recent_interviewer_actions: list[str] = Field(default_factory=list)
    code_analysis_observations: list[str] = Field(default_factory=list)

    def can_transition_to(self, target: InterviewStage) -> bool:
        return target in _TRANSITIONS[self.stage]

    def transition_to(self, target: InterviewStage) -> None:
        if not self.can_transition_to(target):
            raise IllegalTransitionError(self.stage, target)
        self.stage = target
