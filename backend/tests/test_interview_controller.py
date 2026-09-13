from app.interview.actions import InterviewerAction
from app.interview.controller import (
    MAX_HINT_LEVEL,
    MIN_COOLDOWN_SECONDS,
    RUBRIC_SCORE_MAX,
    RUBRIC_SCORE_MIN,
    InterviewController,
)
from app.interview.state import InterviewState

PROBLEM = {
    "slug": "two-sum",
    "number": "1",
    "title": "Two Sum",
    "difficulty": "Easy",
    "description": "Given an array of integers, return indices of two numbers that sum to target.",
}


def make_controller(stage: str = "coding") -> tuple[InterviewController, InterviewState]:
    state = InterviewState(problem=PROBLEM, language="python")
    state.stage = stage
    return InterviewController(state), state


def test_can_speak_before_ever_speaking():
    controller, _ = make_controller()
    assert controller.can_speak(now=0.0) is True


def test_cannot_speak_while_candidate_is_speaking():
    controller, _ = make_controller()
    assert controller.can_speak(now=0.0, is_candidate_speaking=True) is False


def test_cooldown_blocks_speaking_until_it_elapses():
    controller, _ = make_controller()
    controller.accept_proposal(InterviewerAction(action="ask_question", message="Q1"), now=0.0)

    assert controller.can_speak(now=MIN_COOLDOWN_SECONDS - 1) is False
    assert controller.can_speak(now=MIN_COOLDOWN_SECONDS) is True


def test_hint_requested_bypasses_cooldown():
    controller, _ = make_controller()
    controller.accept_proposal(InterviewerAction(action="ask_question", message="Q1"), now=0.0)

    assert controller.can_speak(now=1.0, hint_requested=True) is True


def test_hint_requested_does_not_bypass_candidate_speaking():
    controller, _ = make_controller()
    assert controller.can_speak(now=0.0, hint_requested=True, is_candidate_speaking=True) is False


def test_duplicate_question_is_rejected_even_after_cooldown():
    controller, _ = make_controller()
    first = controller.accept_proposal(
        InterviewerAction(action="ask_question", message="What is the time complexity?"), now=0.0
    )
    assert first is not None

    second = controller.accept_proposal(
        InterviewerAction(action="ask_question", message="What is the time complexity???"),
        now=MIN_COOLDOWN_SECONDS,
    )
    assert second is None


def test_different_question_is_accepted():
    controller, _ = make_controller()
    controller.accept_proposal(InterviewerAction(action="ask_question", message="Q1"), now=0.0)

    accepted = controller.accept_proposal(
        InterviewerAction(action="ask_question", message="Q2"), now=MIN_COOLDOWN_SECONDS
    )
    assert accepted is not None


def test_ask_question_without_a_message_is_rejected():
    controller, _ = make_controller()
    proposal = InterviewerAction(action="ask_question", message=None)
    accepted = controller.accept_proposal(proposal, now=0.0)
    assert accepted is None


def test_remain_silent_is_always_accepted_and_does_not_reset_the_cooldown():
    controller, _ = make_controller()
    controller.accept_proposal(InterviewerAction(action="ask_question", message="Q1"), now=0.0)

    accepted = controller.accept_proposal(InterviewerAction(action="remain_silent"), now=5.0)
    assert accepted is not None
    # the earlier question's cooldown is unaffected by the silent response
    assert controller.can_speak(now=5.0) is False


def test_hints_are_capped_at_max_level():
    controller, state = make_controller()
    for i in range(MAX_HINT_LEVEL):
        accepted = controller.accept_proposal(
            InterviewerAction(action="give_hint", message=f"hint {i}"), now=float(i) * 100
        )
        assert accepted is not None
    assert state.hint_level == MAX_HINT_LEVEL

    rejected = controller.accept_proposal(
        InterviewerAction(action="give_hint", message="one more"), now=1000.0
    )
    assert rejected is None
    assert state.hint_level == MAX_HINT_LEVEL  # unchanged by the rejection


def test_illegal_stage_transition_is_rejected_and_leaves_state_unchanged():
    controller, state = make_controller(stage="intro")
    accepted = controller.accept_proposal(
        InterviewerAction(action="transition_stage", stage_transition="coding"), now=0.0
    )
    assert accepted is None
    assert state.stage == "intro"


def test_legal_stage_transition_is_accepted_and_applied():
    controller, state = make_controller(stage="intro")
    accepted = controller.accept_proposal(
        InterviewerAction(action="transition_stage", stage_transition="clarification"), now=0.0
    )
    assert accepted is not None
    assert state.stage == "clarification"


def test_stage_transition_with_a_message_resets_the_cooldown():
    controller, _ = make_controller(stage="intro")
    controller.accept_proposal(
        InterviewerAction(
            action="transition_stage",
            stage_transition="clarification",
            message="Let's talk it through.",
        ),
        now=0.0,
    )
    assert controller.can_speak(now=1.0) is False


def test_stage_transition_without_a_message_does_not_reset_the_cooldown():
    controller, _ = make_controller(stage="intro")
    controller.accept_proposal(
        InterviewerAction(action="transition_stage", stage_transition="clarification"), now=0.0
    )
    assert controller.can_speak(now=1.0) is True


# --- rubric_updates (Feature 13, architecture.md §O) ---


def test_rubric_updates_on_ask_question_are_merged_into_state_rubric():
    controller, state = make_controller()
    controller.accept_proposal(
        InterviewerAction(
            action="ask_question",
            message="What test cases would you run?",
            rubric_updates={"testing": 2},
            rubric_evidence="Candidate proposed edge-case tests unprompted.",
        ),
        now=0.0,
    )
    assert state.rubric["testing"] == 2
    # every other category is untouched — a merge, not a replace
    assert state.rubric["approach"] == 0
    assert state.rubric["clarifying"] == 0


def test_rubric_updates_on_give_hint_are_applied():
    controller, state = make_controller()
    controller.accept_proposal(
        InterviewerAction(
            action="give_hint",
            message="Think about hash maps.",
            rubric_updates={"approach": 1},
            rubric_evidence="Candidate needed a hint to move past brute force.",
        ),
        now=0.0,
    )
    assert state.rubric["approach"] == 1


def test_rubric_updates_on_transition_stage_are_applied():
    controller, state = make_controller(stage="intro")
    controller.accept_proposal(
        InterviewerAction(
            action="transition_stage",
            stage_transition="clarification",
            rubric_updates={"clarifying": 1},
            rubric_evidence="Candidate asked a relevant clarifying question.",
        ),
        now=0.0,
    )
    assert state.rubric["clarifying"] == 1


def test_rubric_updates_are_clamped_to_valid_range():
    controller, state = make_controller()
    controller.accept_proposal(
        InterviewerAction(
            action="ask_question",
            message="Q1",
            rubric_updates={"testing": 99, "approach": -5},
            rubric_evidence="out-of-range values must be clamped",
        ),
        now=0.0,
    )
    assert state.rubric["testing"] == RUBRIC_SCORE_MAX
    assert state.rubric["approach"] == RUBRIC_SCORE_MIN


def test_rubric_updates_accumulate_an_append_only_evidence_history():
    controller, state = make_controller()
    controller.accept_proposal(
        InterviewerAction(
            action="ask_question",
            message="Q1",
            rubric_updates={"testing": 1},
            rubric_evidence="first observation",
        ),
        now=10.0,
    )
    controller.accept_proposal(
        InterviewerAction(
            action="ask_question",
            message="Q2",
            rubric_updates={"testing": 2, "approach": 1},
            rubric_evidence="second observation",
        ),
        now=MIN_COOLDOWN_SECONDS + 10.0,
    )

    assert len(state.rubric_history) == 2
    first, second = state.rubric_history
    assert first.categories == {"testing": 1}
    assert first.evidence == "first observation"
    assert first.timestamp == 10.0
    assert second.categories == {"testing": 2, "approach": 1}
    assert second.evidence == "second observation"
    assert second.timestamp == MIN_COOLDOWN_SECONDS + 10.0

    # queryable by category — every entry that touched "testing"
    testing_entries = [entry for entry in state.rubric_history if "testing" in entry.categories]
    assert len(testing_entries) == 2


def test_no_rubric_updates_means_no_history_entry():
    controller, state = make_controller()
    controller.accept_proposal(InterviewerAction(action="ask_question", message="Q1"), now=0.0)
    assert state.rubric_history == []


def test_rejected_proposal_does_not_apply_rubric_updates():
    controller, state = make_controller(stage="intro")
    accepted = controller.accept_proposal(
        InterviewerAction(
            action="transition_stage",
            stage_transition="coding",  # illegal from intro
            rubric_updates={"approach": 3},
            rubric_evidence="should never be applied",
        ),
        now=0.0,
    )
    assert accepted is None
    assert state.rubric["approach"] == 0
    assert state.rubric_history == []
