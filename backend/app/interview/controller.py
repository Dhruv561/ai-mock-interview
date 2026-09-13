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

# Two-speed cooldown (§L rule 2), not one fixed gap — 2026-09-13, replacing
# the single MIN_COOLDOWN_SECONDS=30.0 original after live demo feedback in
# two rounds:
#
# 1. A flat 30s floor produced 35-50s silences between an answer and the
#    interviewer's reply ("not conversational, unlike Claude/Gemini live
#    chat"). Lowering it to a flat 2s fixed *that* but then meant the
#    interviewer was just as quick to jump in while the candidate was mid
#    monologue narrating their solution — the opposite complaint ("if
#    they're just describing their solution, the interviewer shouldn't say
#    anything, but a real back-and-forth should be instant").
# 2. So this is now dynamic: REACTIVE_COOLDOWN_SECONDS applies when the
#    candidate's utterance is genuinely this turn's conversational reply
#    (the interviewer just asked something and is waiting, or the candidate
#    is plainly addressing the interviewer directly, e.g. "can you hear
#    me?"); OBSERVATION_COOLDOWN_SECONDS applies otherwise (candidate
#    narrating/coding, nothing addressed to the interviewer) so it stays
#    quiet and lets them work, per CLAUDE.md principle 4. See
#    is_conversational_turn's call site in websocket/interview.py's
#    _maybe_speak for how the two heuristics (awaiting_response / a
#    question-shaped utterance) decide which speed applies. Both remain
#    named constants, not scattered magic numbers, for easy demo-time
#    tuning.
REACTIVE_COOLDOWN_SECONDS = 2.0
OBSERVATION_COOLDOWN_SECONDS = 15.0
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
        # True right after the interviewer asks a direct question, cleared
        # once any other kind of accepted action follows (see
        # accept_proposal). Lets can_speak apply the fast reactive cooldown
        # to the candidate's very next utterance — the reply this question
        # was waiting for — without needing a question mark in it.
        self._awaiting_response = False

    @property
    def awaiting_response(self) -> bool:
        return self._awaiting_response

    def can_speak(
        self,
        *,
        now: float,
        hint_requested: bool = False,
        is_candidate_speaking: bool = False,
        is_conversational_turn: bool = False,
    ) -> bool:
        """Gates whether it's even worth asking the LLM for a proposal —
        checked before the LLM call, not just before emitting its result,
        so a cooldown also avoids the cost/latency of an unnecessary call
        (§L rules 1-2).

        `is_conversational_turn` (set by the caller from
        `awaiting_response` and/or the candidate's utterance looking like a
        direct address — see websocket/interview.py's _maybe_speak) picks
        which of the two cooldowns applies; it never bypasses the cooldown
        entirely the way hint_requested does."""
        if is_candidate_speaking:
            return False
        if hint_requested:
            return True
        if self._last_spoke_at is None:
            return True
        if is_conversational_turn:
            cooldown = REACTIVE_COOLDOWN_SECONDS
        else:
            cooldown = OBSERVATION_COOLDOWN_SECONDS
        return (now - self._last_spoke_at) >= cooldown

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
            self._awaiting_response = True
            self._apply_rubric_updates(action, now=now)
            return action

        if action.action == "give_hint":
            if self.state.hint_level >= MAX_HINT_LEVEL:
                return None
            self.state.hint_level += 1
            if action.message:
                self._last_spoke_at = now
                self._awaiting_response = False
            self._apply_rubric_updates(action, now=now)
            return action

        if action.action == "transition_stage":
            if action.stage_transition is None or not self.state.can_transition_to(
                action.stage_transition
            ):
                return None
            self.state.transition_to(action.stage_transition, now=now)
            if action.message:
                self._last_spoke_at = now
                self._awaiting_response = False
            self._apply_rubric_updates(action, now=now)
            return action

        if action.action == "remain_silent":
            # Deliberately does not touch _awaiting_response either way: a
            # question left unanswered is still pending, and this is also
            # the case a candidate's non-conversational narration hits on
            # every turn, so it must not itself start (or reset) the
            # awaiting-response window.
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
