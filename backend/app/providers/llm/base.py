"""LLM provider interface (architecture.md §J).

Deliberately a thin "already-built prompt text in, structured action out"
transport — prompt construction lives in interview/prompts.py (shared by
every provider), condensing InterviewState into that prompt lives in
agents/interviewer.py. Keeps this interface reusable and easy to test
independent of interview-domain object shapes.
"""

from typing import Protocol

from app.interview.actions import InterviewerAction


class LLMProvider(Protocol):
    async def propose_action(self, system_prompt: str, user_prompt: str) -> InterviewerAction: ...
