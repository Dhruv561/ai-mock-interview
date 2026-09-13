"""Interview controller (architecture.md §L) — the deterministic gate
between "something happened" and "the interviewer speaks." Owns silence.

No LLM or network calls happen in this file; it only decides whether to
ask the agent for a proposal (can_speak) and whether to accept what comes
back (accept_proposal). Pure, synchronous, fully unit-testable with an
injected clock — same pattern as
extension/src/content/codeChangeDetector.ts.
"""

from __future__ import annotations

import re

from app.interview.actions import InterviewerAction
from app.interview.state import InterviewState, RubricEvidenceEntry

# Minimum gap between interviewer utterances, unless a hint was explicitly
# requested (§L rule 2). Named constant, not scattered magic numbers, so
# it's easy to tune during demo rehearsal (§L risk).
MIN_COOLDOWN_SECONDS = 30.0
MAX_HINT_LEVEL = 3
RUBRIC_SCORE_MIN = 0
RUBRIC_SCORE_MAX = 3


def _fingerprint(text: str) -> str:
    """Normalizes a question for near-duplicate detection (§L rule 4) —
    exact-match-after-normalization (lowercase, punctuation stripped,
    whitespace collapsed), not fuzzy/semantic similarity, which is out of
    scope for a hackathon MVP."""
    normalized = re.sub(r"[^\w\s]", "", text.lower()).strip()
    return re.sub(r"\s+", " ", normalized)


class InterviewController:
    def __init__(self, state: InterviewState) -> None:
        self.state = state
        self._last_spoke_at: float | None = None
        self._asked_fingerprints: set[str] = set()

    def can_speak(
        self, *, now: float, hint_requested: bool = False, is_candidate_speaking: bool = False
    ) -> bool:
        """Gates whether it's even worth asking the LLM for a proposal —
        checked before the LLM call, not just before emitting its result,
        so a cooldown also avoids the cost/latency of an unnecessary call
        (§L rules 1-2)."""
        if is_candidate_speaking:
            return False
        if hint_requested:
            return True
        if self._last_spoke_at is None:
            return True
        return (now - self._last_spoke_at) >= MIN_COOLDOWN_SECONDS

    def accept_proposal(self, action: InterviewerAction, *, now: float) -> InterviewerAction | None:
        """Returns the action to actually execute, or None if rejected.
        Applies rules 4-6; rules 1-2 are already enforced by can_speak
        having gated whether this was ever called."""
        if action.action == "ask_question":
            if not action.message:
                return None
            fingerprint = _fingerprint(action.message)
            if fingerprint in self._asked_fingerprints:
                return None
            self._asked_fingerprints.add(fingerprint)
            self._last_spoke_at = now
            self._apply_rubric_updates(action, now=now)
            return action

        if action.action == "give_hint":
            if self.state.hint_level >= MAX_HINT_LEVEL:
                return None
            self.state.hint_level += 1
            if action.message:
                self._last_spoke_at = now
            self._apply_rubric_updates(action, now=now)
            return action

        if action.action == "transition_stage":
            if action.stage_transition is None or not self.state.can_transition_to(
                action.stage_transition
            ):
                return None
            self.state.transition_to(action.stage_transition)
            if action.message:
                self._last_spoke_at = now
            self._apply_rubric_updates(action, now=now)
            return action

        if action.action == "remain_silent":
            return action

        return None

    def _apply_rubric_updates(self, action: InterviewerAction, *, now: float) -> None:
        """Merges a proposal's rubric_updates into state.rubric (clamped to
        [0,3]) and appends an evidence-history entry (architecture.md §O).
        Only called from branches above that already passed can_speak/
        accept_proposal's gating — rubric updates deliberately have no
        separate trigger of their own, which is what keeps them from being
        noisy (§O risk note), so there is nothing further to gate here."""
        if not action.rubric_updates:
            return
        clamped = {
            category: max(RUBRIC_SCORE_MIN, min(RUBRIC_SCORE_MAX, value))
            for category, value in action.rubric_updates.items()
        }
        self.state.rubric.update(clamped)
        self.state.rubric_history.append(
            RubricEvidenceEntry(
                categories=clamped,
                evidence=action.rubric_evidence or "",
                timestamp=now,
            )
        )
