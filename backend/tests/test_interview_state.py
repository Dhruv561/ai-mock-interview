import pytest

from app.interview.schemas import InterviewStage
from app.interview.state import _TRANSITIONS, IllegalTransitionError, InterviewState

ALL_STAGES: tuple[InterviewStage, ...] = (
    "intro",
    "clarification",
    "approach",
    "coding",
    "complexity",
    "testing",
    "optimisation",
    "review",
)

PROBLEM = {
    "slug": "two-sum",
    "number": "1",
    "title": "Two Sum",
    "difficulty": "Easy",
    "description": "Given an array of integers, return indices of two numbers that sum to target.",
}


def make_state(stage: InterviewStage = "intro") -> InterviewState:
    state = InterviewState(problem=PROBLEM, language="python")
    if stage != "intro":
        # jump directly into the target stage for test setup, bypassing
        # transition legality — this is a test fixture helper, not
        # something production code does
        state.stage = stage
    return state


@pytest.mark.parametrize("current", ALL_STAGES)
@pytest.mark.parametrize("target", ALL_STAGES)
def test_every_transition_matches_the_table(current: InterviewStage, target: InterviewStage):
    state = make_state(current)
    should_succeed = target in _TRANSITIONS[current]

    assert state.can_transition_to(target) is should_succeed

    if should_succeed:
        state.transition_to(target)
        assert state.stage == target
    else:
        with pytest.raises(IllegalTransitionError) as exc_info:
            state.transition_to(target)
        assert exc_info.value.current == current
        assert exc_info.value.target == target
        assert state.stage == current  # rejected transition leaves state unchanged


def test_review_is_terminal():
    state = make_state("review")
    for target in ALL_STAGES:
        assert state.can_transition_to(target) is False


def test_review_is_reachable_from_every_non_terminal_stage():
    for stage in ALL_STAGES:
        if stage == "review":
            continue
        assert "review" in _TRANSITIONS[stage]


def test_default_state_starts_at_intro_with_empty_fields():
    state = InterviewState(problem=PROBLEM, language="python")
    assert state.stage == "intro"
    assert state.current_code == ""
    assert state.transcript == []
    assert state.hint_level == 0
    assert state.recent_interviewer_actions == []
    assert state.code_analysis_observations == []
    assert state.rubric == {
        "clarifying": 0,
        "approach": 0,
        "code_quality": 0,
        "complexity": 0,
        "communication": 0,
        "testing": 0,
    }
    assert state.started_at == 0.0
    assert state.stage_history == []


# --- started_at / stage_history (Feature 14, architecture.md §P) ---


def test_started_at_is_set_explicitly_by_the_caller():
    state = InterviewState(problem=PROBLEM, language="python", started_at=1000.0)
    assert state.started_at == 1000.0


def test_transition_to_appends_a_stage_history_entry_with_the_given_timestamp():
    state = make_state("intro")
    state.transition_to("clarification", now=42.0)
    assert len(state.stage_history) == 1
    assert state.stage_history[0].stage == "clarification"
    assert state.stage_history[0].timestamp == 42.0


def test_transition_to_accumulates_stage_history_in_order():
    state = make_state("intro")
    state.transition_to("clarification", now=10.0)
    state.transition_to("approach", now=20.0)
    assert [entry.stage for entry in state.stage_history] == ["clarification", "approach"]
    assert [entry.timestamp for entry in state.stage_history] == [10.0, 20.0]


def test_rejected_transition_does_not_append_stage_history():
    state = make_state("intro")
    with pytest.raises(IllegalTransitionError):
        state.transition_to("coding", now=5.0)
    assert state.stage_history == []


def test_transition_to_defaults_now_to_zero_for_callers_that_do_not_care():
    state = make_state("intro")
    state.transition_to("clarification")
    assert state.stage_history[0].timestamp == 0.0
