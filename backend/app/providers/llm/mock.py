"""Mock LLM provider — the default (USE_MOCK_PROVIDERS=true, or no
ANTHROPIC_API_KEY configured).

Deterministic, stage-appropriate canned InterviewerAction responses, so
the agent/controller/WS wiring (Feature 08) is fully exercisable without
an Anthropic API key. Keys off the "Stage: <stage>" and "Trigger: <trigger>"
marker lines that interview/prompts.build_user_prompt always puts first —
a documented part of the prompt contract (see prompts.py), not fragile
free-text parsing.
"""

from app.interview.actions import InterviewerAction
from app.interview.schemas import InterviewStage

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

_HINT_RESPONSE = InterviewerAction(
    action="give_hint",
    message=(
        "Think about what data structure would give you faster lookups than "
        "scanning the list each time."
    ),
)


def _extract_marker(user_prompt: str, prefix: str) -> str | None:
    for line in user_prompt.splitlines():
        if line.startswith(prefix):
            return line.removeprefix(prefix)
    return None


class MockLLMProvider:
    async def propose_action(self, system_prompt: str, user_prompt: str) -> InterviewerAction:
        if _extract_marker(user_prompt, "Trigger: ") == "hint_requested":
            return _HINT_RESPONSE

        stage = _extract_marker(user_prompt, "Stage: ")
        if stage in _CANNED:
            return _CANNED[stage]  # type: ignore[index]
        return InterviewerAction(action="remain_silent")
