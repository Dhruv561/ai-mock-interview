"""Real interviewer LLM provider (architecture.md §J) — Anthropic Messages
API with tool-use forced to the InterviewerAction schema, so the response
is always valid structured output, never free-text to parse.

Not exercised against a real Anthropic connection this session — no API
key available in this environment. Manually verify with a real key before
relying on this for a demo — see FEATURE_PROGRESS.md Feature 08.
"""

from __future__ import annotations

from anthropic import AsyncAnthropic

from app.interview.actions import InterviewerAction

# Per this session's own model guidance: default to the latest and most
# capable Claude model for an AI application like this one.
MODEL = "claude-sonnet-5"
MAX_TOKENS = 1024

_TOOL_NAME = "propose_interviewer_action"
_TOOL_SCHEMA = {
    "name": _TOOL_NAME,
    "description": "Propose the interviewer's next action in this coding interview.",
    "input_schema": InterviewerAction.model_json_schema(),
}


class AnthropicLLMProvider:
    def __init__(self, api_key: str) -> None:
        self._client = AsyncAnthropic(api_key=api_key)

    async def propose_action(self, system_prompt: str, user_prompt: str) -> InterviewerAction:
        response = await self._client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            tools=[_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": _TOOL_NAME},
        )
        for block in response.content:
            if block.type == "tool_use":
                return InterviewerAction.model_validate(block.input)
        raise RuntimeError("Anthropic response did not include a tool_use block")
