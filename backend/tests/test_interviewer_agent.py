from app.agents.interviewer import propose_interviewer_action
from app.interview.state import InterviewState
from app.providers.llm.mock import MockLLMProvider

PROBLEM = {
    "slug": "two-sum",
    "number": "1",
    "title": "Two Sum",
    "difficulty": "Easy",
    "description": "Given an array of integers, return indices of two numbers that sum to target.",
}


async def test_propose_interviewer_action_asks_a_question_at_intro():
    state = InterviewState(problem=PROBLEM, language="python")
    action = await propose_interviewer_action(state, MockLLMProvider())
    assert action.action == "ask_question"
    assert action.message


async def test_propose_interviewer_action_remains_silent_in_review():
    state = InterviewState(problem=PROBLEM, language="python")
    state.stage = "review"
    action = await propose_interviewer_action(state, MockLLMProvider())
    assert action.action == "remain_silent"


async def test_hint_requested_trigger_produces_a_hint_regardless_of_stage():
    state = InterviewState(problem=PROBLEM, language="python")
    state.stage = "coding"  # coding's default canned response is remain_silent
    action = await propose_interviewer_action(state, MockLLMProvider(), trigger="hint_requested")
    assert action.action == "give_hint"
    assert action.message
