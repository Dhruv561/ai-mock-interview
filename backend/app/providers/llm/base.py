"""LLM provider interface (architecture.md §J).

Deliberately a thin "already-built prompt text in, structured action out"
transport — prompt construction lives in interview/prompts.py (shared by
every provider), condensing InterviewState into that prompt lives in
agents/interviewer.py. Keeps this interface reusable and easy to test
independent of interview-domain object shapes.
"""

from typing import Protocol

from app.interview.actions import InterviewerAction
from app.interview.schemas import FinalReview


class LLMProvider(Protocol):
    async def propose_action(self, system_prompt: str, user_prompt: str) -> InterviewerAction: ...

    async def propose_review(self, system_prompt: str, user_prompt: str) -> FinalReview:
        """Feature 14 / architecture.md §P — same "prompt text in,
        structured object out" shape as propose_action, but for the
        end-of-interview evaluator (agents/evaluator.py), which builds
        these prompts from the assembled evidence list rather than live
        InterviewState the way interviewer prompts are built."""
        ...
