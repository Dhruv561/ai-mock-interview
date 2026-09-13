from app.interview.prompts import build_system_prompt, build_user_prompt
from app.interview.state import InterviewState, TranscriptEntry

PROBLEM = {
    "slug": "two-sum",
    "number": "1",
    "title": "Two Sum",
    "difficulty": "Easy",
    "description": "Given an array of integers, return indices of two numbers that sum to target.",
}


def test_system_prompt_includes_problem_and_stage_guidance():
    state = InterviewState(problem=PROBLEM, language="python")
    prompt = build_system_prompt(state)
    assert "Two Sum" in prompt
    assert "Easy" in prompt
    assert "intro" in prompt


def test_system_prompt_changes_with_stage():
    state = InterviewState(problem=PROBLEM, language="python")
    intro_prompt = build_system_prompt(state)
    state.stage = "review"
    review_prompt = build_system_prompt(state)
    assert intro_prompt != review_prompt
    assert "remain silent" in review_prompt.lower()


def test_user_prompt_first_two_lines_are_the_stage_and_trigger_markers():
    state = InterviewState(problem=PROBLEM, language="python")
    prompt = build_user_prompt(state, trigger="hint_requested")
    lines = prompt.splitlines()
    assert lines[0] == "Stage: intro"
    assert lines[1] == "Trigger: hint_requested"


def test_user_prompt_includes_current_code_and_recent_transcript():
    state = InterviewState(problem=PROBLEM, language="python")
    state.current_code = "def two_sum(nums, target): ..."
    entry = TranscriptEntry(speaker="candidate", text="I'll use a hash map", timestamp=1.0)
    state.transcript.append(entry)

    prompt = build_user_prompt(state)

    assert "def two_sum(nums, target): ..." in prompt
    assert "I'll use a hash map" in prompt


def test_user_prompt_lists_already_asked_actions_to_avoid_repetition():
    state = InterviewState(problem=PROBLEM, language="python")
    state.recent_interviewer_actions.append("asked: What is the time complexity?")

    prompt = build_user_prompt(state)

    assert "What is the time complexity?" in prompt


def test_user_prompt_shows_placeholder_when_no_code_analysis_observations():
    state = InterviewState(problem=PROBLEM, language="python")
    prompt = build_user_prompt(state)
    assert "Code analysis observations:" in prompt
    assert "(none)" in prompt


def test_user_prompt_includes_code_analysis_observations():
    state = InterviewState(problem=PROBLEM, language="python")
    state.code_analysis_observations.append("Nested loop detected (outer loop at line 2).")

    prompt = build_user_prompt(state)

    assert "Code analysis observations:" in prompt
    assert "Nested loop detected (outer loop at line 2)." in prompt
