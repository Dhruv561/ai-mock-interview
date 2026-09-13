import pytest
from pydantic import ValidationError

from app.interview.actions import InterviewerAction


def test_rubric_updates_without_evidence_is_rejected():
    with pytest.raises(ValidationError):
        InterviewerAction(action="ask_question", message="Q1", rubric_updates={"testing": 2})


def test_rubric_updates_with_blank_evidence_is_rejected():
    with pytest.raises(ValidationError):
        InterviewerAction(
            action="ask_question",
            message="Q1",
            rubric_updates={"testing": 2},
            rubric_evidence="   ",
        )


def test_rubric_updates_with_evidence_is_accepted():
    action = InterviewerAction(
        action="ask_question",
        message="Q1",
        rubric_updates={"testing": 2},
        rubric_evidence="Candidate walked through two edge cases unprompted.",
    )
    assert action.rubric_updates == {"testing": 2}
    assert action.rubric_evidence


def test_no_rubric_updates_does_not_require_evidence():
    action = InterviewerAction(action="ask_question", message="Q1")
    assert action.rubric_updates is None
    assert action.rubric_evidence is None


def test_empty_rubric_updates_dict_does_not_require_evidence():
    # an empty dict is falsy, so it's treated the same as "no update" —
    # nothing to trace evidence to.
    action = InterviewerAction(action="ask_question", message="Q1", rubric_updates={})
    assert action.rubric_updates == {}
