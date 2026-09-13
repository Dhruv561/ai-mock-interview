"""Mock LLM provider — the default (USE_MOCK_PROVIDERS=true, or no
ANTHROPIC_API_KEY configured).

Deterministic, stage-appropriate canned InterviewerAction responses, so
the agent/controller/WS wiring (Feature 08) is fully exercisable without
an Anthropic API key. Keys off the "Stage: <stage>" and "Trigger: <trigger>"
marker lines that interview/prompts.build_user_prompt always puts first —
a documented part of the prompt contract (see prompts.py), not fragile
free-text parsing.
"""

import re

from app.interview.actions import InterviewerAction
from app.interview.schemas import (
    EvidenceItem,
    FinalReview,
    InterviewStage,
    ReviewPoint,
    TimelineEvent,
)

_CANNED: dict[InterviewStage, InterviewerAction] = {
    "intro": InterviewerAction(
        action="ask_question",
        message=(
            "Before we start — have you seen this problem before, or is this your first attempt?"
        ),
    ),
    "clarification": InterviewerAction(
        action="ask_question",
        message=(
            "What assumptions are you making about the input — could it contain "
            "duplicates or negative numbers?"
        ),
    ),
    "approach": InterviewerAction(
        action="ask_question",
        message="Can you walk me through your intended approach before you start coding?",
    ),
    "coding": InterviewerAction(action="remain_silent"),
    "complexity": InterviewerAction(
        action="ask_question",
        message="What's the time and space complexity of your solution?",
        # Deterministically exercises the rubric_updates/rubric_evidence
        # path (Feature 13) without a real Anthropic key — see mock.py's
        # module docstring and test_websocket_interview.py.
        rubric_updates={"complexity": 1},
        rubric_evidence="Candidate was asked to justify time/space complexity.",
    ),
    "testing": InterviewerAction(
        action="ask_question",
        message="What test cases would you run against this, including edge cases?",
    ),
    "optimisation": InterviewerAction(
        action="ask_question",
        message="Do you see any way to optimise this further?",
    ),
    "review": InterviewerAction(action="remain_silent"),
}

_HINT_RESPONSES: dict[int, InterviewerAction] = {
    1: InterviewerAction(
        action="give_hint",
        message=(
            "Think about whether scanning the list again for every element is really necessary."
        ),
    ),
    2: InterviewerAction(
        action="give_hint",
        message=(
            "What data structure would give you faster lookups than scanning the list "
            "each time?"
        ),
    ),
    3: InterviewerAction(
        action="give_hint",
        message=(
            "Consider storing each value you've already seen in a hash map keyed by that "
            "value, so you can check for its complement in constant time."
        ),
    ),
}


def _extract_marker(user_prompt: str, prefix: str) -> str | None:
    for line in user_prompt.splitlines():
        if line.startswith(prefix):
            return line.removeprefix(prefix)
    return None


class MockLLMProvider:
    async def propose_action(self, system_prompt: str, user_prompt: str) -> InterviewerAction:
        if _extract_marker(user_prompt, "Trigger: ") == "hint_requested":
            level_marker = _extract_marker(user_prompt, "Hint level requested: ")
            level = int(level_marker) if level_marker else 1
            return _HINT_RESPONSES.get(level, _HINT_RESPONSES[3])

        stage = _extract_marker(user_prompt, "Stage: ")
        if stage in _CANNED:
            return _CANNED[stage]  # type: ignore[index]
        return InterviewerAction(action="remain_silent")

    async def propose_review(self, system_prompt: str, user_prompt: str) -> FinalReview:
        """Deterministically derives a FinalReview from whatever the
        evaluator prompt actually contains (interview/evaluator_prompts.py's
        "Evidence"/"Stage timeline"/"Rubric so far" sections) rather than
        returning a hardcoded review — the whole point of Feature 14 is
        that the review is grounded in that specific session's record, so
        even the mock provider must only cite evidence ids that were
        actually handed to it."""
        evidence = _parse_evidence(user_prompt)
        timeline = _parse_timeline(user_prompt)
        rubric = _parse_rubric(user_prompt)

        strength_item = _pick_evidence(evidence, ("rubric", "transcript", "code_analysis", "stage"))
        improve_item = _pick_evidence(evidence, ("hint", "code_analysis", "rubric", "stage"))

        strengths = (
            [
                ReviewPoint(
                    text=f"Evidence-grounded strength: {strength_item.text}",
                    evidence_ids=[strength_item.id],
                )
            ]
            if strength_item is not None
            else []
        )
        areas_to_improve = (
            [
                ReviewPoint(
                    text=f"Evidence-grounded area to improve: {improve_item.text}",
                    evidence_ids=[improve_item.id],
                )
            ]
            if improve_item is not None
            else []
        )

        overall_score = round(10 * sum(rubric.values()) / (3 * len(rubric)), 1) if rubric else 0.0

        return FinalReview(
            overall_score=overall_score,
            rubric=rubric,  # type: ignore[arg-type]
            strengths=strengths,
            areas_to_improve=areas_to_improve,
            timeline=timeline,
            evidence=evidence,
        )


_EVIDENCE_LINE_RE = re.compile(r'^\s*id=(?P<id>\S+) kind=(?P<kind>\S+) text="(?P<text>.*)"\s*$')
_TIMELINE_LINE_RE = re.compile(
    r"^\s*evidence_id=(?P<evidence_id>\S+) stage=(?P<stage>\S+) "
    r"elapsed_seconds=(?P<elapsed>-?[\d.]+)\s*$"
)
_RUBRIC_LINE_RE = re.compile(r"^\s*(?P<category>\w+): (?P<score>-?\d+)\s*$")


def _parse_evidence(user_prompt: str) -> list[EvidenceItem]:
    """Parses the "Evidence" section lines emitted by
    interview/evaluator_prompts.build_user_prompt back into EvidenceItems —
    the mock equivalent of _extract_marker above, just for a multi-line
    section instead of a single marker line."""
    items = []
    for line in user_prompt.splitlines():
        match = _EVIDENCE_LINE_RE.match(line)
        if match:
            items.append(
                EvidenceItem(id=match["id"], kind=match["kind"], text=match["text"])  # type: ignore[arg-type]
            )
    return items


def _parse_timeline(user_prompt: str) -> list[TimelineEvent]:
    events = []
    for line in user_prompt.splitlines():
        match = _TIMELINE_LINE_RE.match(line)
        if match:
            events.append(
                TimelineEvent(label=match["stage"], elapsed_seconds=float(match["elapsed"]))
            )
    return events


def _parse_rubric(user_prompt: str) -> dict[str, int]:
    rubric: dict[str, int] = {}
    in_rubric_section = False
    for line in user_prompt.splitlines():
        if line.startswith("Rubric so far"):
            in_rubric_section = True
            continue
        if not in_rubric_section:
            continue
        match = _RUBRIC_LINE_RE.match(line)
        if match:
            rubric[match["category"]] = int(match["score"])
    return rubric


def _pick_evidence(
    evidence: list[EvidenceItem], preferred_kinds: tuple[str, ...]
) -> EvidenceItem | None:
    """Picks one evidence item to cite, preferring the given kinds in
    order (so, e.g., a hint is preferentially cited as an
    area-to-improve) and falling back to whatever is available so a
    session with only one kind of evidence still produces a valid,
    non-empty review point rather than nothing at all."""
    for kind in preferred_kinds:
        for item in evidence:
            if item.kind == kind:
                return item
    return evidence[0] if evidence else None
