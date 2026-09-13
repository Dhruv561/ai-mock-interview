from app.interview.prompts import HINT_LEVEL_GUIDANCE, build_system_prompt, build_user_prompt
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


def test_non_hint_trigger_has_no_hint_level_requested_marker():
    state = InterviewState(problem=PROBLEM, language="python")
    prompt = build_user_prompt(state, trigger="code_update")
    assert "Hint level requested:" not in prompt


def test_hint_requested_trigger_includes_the_next_level_and_its_guidance():
    state = InterviewState(problem=PROBLEM, language="python")
    state.hint_level = 0
    prompt = build_user_prompt(state, trigger="hint_requested")
    assert "Hint level requested: 1" in prompt
    assert HINT_LEVEL_GUIDANCE[1] in prompt


def test_hint_requested_trigger_uses_hint_level_plus_one_not_hint_level():
    state = InterviewState(problem=PROBLEM, language="python")
    state.hint_level = 1
    prompt = build_user_prompt(state, trigger="hint_requested")
    assert "Hint level requested: 2" in prompt
    assert HINT_LEVEL_GUIDANCE[2] in prompt


def test_hint_requested_trigger_caps_at_max_hint_level():
    state = InterviewState(problem=PROBLEM, language="python")
    state.hint_level = 3  # already at the cap
    prompt = build_user_prompt(state, trigger="hint_requested")
    assert "Hint level requested: 3" in prompt
    assert HINT_LEVEL_GUIDANCE[3] in prompt


def test_hint_level_guidance_text_differs_across_all_three_levels():
    texts = {HINT_LEVEL_GUIDANCE[1], HINT_LEVEL_GUIDANCE[2], HINT_LEVEL_GUIDANCE[3]}
    assert len(texts) == 3


def test_user_prompt_includes_current_rubric_scores():
    state = InterviewState(problem=PROBLEM, language="python")
    state.rubric["testing"] = 2
    prompt = build_user_prompt(state)
    assert "testing: 2" in prompt
    assert "clarifying: 0" in prompt
