"""Structured interviewer action output (architecture.md §J).

This is what the LLM must produce — via forced tool-use / a JSON schema,
never free-text parsing — and what the controller (interview/controller.py,
§L) decides whether to actually execute. A single flat model rather than a
discriminated union: `action` says which thing happened, the other fields
are optional extras that may or may not be populated depending on it
(e.g. a transition_stage action can optionally carry a spoken message
too, matching the PRD's example shape).
"""

from typing import Literal

from pydantic import BaseModel, model_validator

from app.interview.schemas import InterviewStage, RubricCategory

ActionType = Literal["ask_question", "remain_silent", "transition_stage", "give_hint"]


class InterviewerAction(BaseModel):
    action: ActionType
    message: str | None = None
    stage_transition: InterviewStage | None = None
    rubric_updates: dict[RubricCategory, int] | None = None
    rubric_evidence: str | None = None

    @model_validator(mode="after")
    def _rubric_updates_require_evidence(self) -> "InterviewerAction":
        # architecture.md §O: "never a bare number with no traceable cause" —
        # schema-enforced, not a convention the LLM/controller could forget.
        if self.rubric_updates and not (self.rubric_evidence and self.rubric_evidence.strip()):
            raise ValueError(
                "rubric_updates requires a non-empty rubric_evidence string explaining "
                "what was observed"
            )
        return self
