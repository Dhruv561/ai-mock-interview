"""Interviewer agent (architecture.md §J) — condenses InterviewState into
prompt inputs and asks the configured LLM provider for the next action.
Doesn't decide whether to actually execute the proposal — that's the
controller's job (interview/controller.py, §L).
"""

from app.interview import prompts
from app.interview.actions import InterviewerAction
from app.interview.prompts import Trigger
from app.interview.state import InterviewState
from app.providers.llm.base import LLMProvider


async def propose_interviewer_action(
    state: InterviewState, provider: LLMProvider, *, trigger: Trigger = "code_update"
) -> InterviewerAction:
    system_prompt = prompts.build_system_prompt(state)
    user_prompt = prompts.build_user_prompt(state, trigger=trigger)
    return await provider.propose_action(system_prompt, user_prompt)
