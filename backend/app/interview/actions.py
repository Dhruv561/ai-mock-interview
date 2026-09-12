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

from pydantic import BaseModel

from app.interview.schemas import InterviewStage, RubricCategory

ActionType = Literal["ask_question", "remain_silent", "transition_stage", "give_hint"]


class InterviewerAction(BaseModel):
    action: ActionType
    message: str | None = None
    stage_transition: InterviewStage | None = None
    rubric_updates: dict[RubricCategory, int] | None = None
