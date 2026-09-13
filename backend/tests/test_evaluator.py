import pytest

from app.agents.evaluator import FinalReviewGenerationError, build_evidence, generate_final_review
from app.interview.schemas import FinalReview, ReviewPoint
from app.interview.state import (
    InterviewState,
    RubricEvidenceEntry,
    StageHistoryEntry,
    TranscriptEntry,
)
from app.providers.llm.mock import MockLLMProvider

PROBLEM = {
    "slug": "two-sum",
    "number": "1",
    "title": "Two Sum",
    "difficulty": "Easy",
    "description": "Given an array of integers, return indices of two numbers that sum to target.",
}


def make_populated_state() -> InterviewState:
    """A state with at least one entry of every evidence kind, so
    build_evidence's per-kind id scheme is exercised across the board."""
    state = InterviewState(problem=PROBLEM, language="python", started_at=100.0)
    state.transcript = [
        TranscriptEntry(speaker="candidate", text="I'd use a hash map.", timestamp=101.0),
        TranscriptEntry(speaker="interviewer", text="Why a hash map?", timestamp=102.0),
    ]
    state.code_analysis_observations = ["Nested loop detected (outer loop at line 2)."]
    state.recent_interviewer_actions = [
        "asked: Why a hash map?",  # not a hint — must NOT become hint evidence
        "hint (level 1): Think about lookups.",
    ]
    state.rubric_history = [
        RubricEvidenceEntry(
            categories={"approach": 2},
            evidence="Candidate justified the hash map choice.",
            timestamp=103.0,
        )
    ]
    state.stage_history = [
        StageHistoryEntry(stage="clarification", timestamp=110.0),
        StageHistoryEntry(stage="approach", timestamp=130.0),
    ]
    return state


# --- build_evidence ---


def test_build_evidence_assigns_stable_per_kind_ids():
    state = make_populated_state()
    evidence = build_evidence(state)

    by_id = {item.id: item for item in evidence}

    assert by_id["transcript-0"].kind == "transcript"
    assert by_id["transcript-0"].text == "candidate: I'd use a hash map."
    assert by_id["transcript-1"].text == "interviewer: Why a hash map?"

    assert by_id["code_analysis-0"].kind == "code_analysis"
    assert by_id["code_analysis-0"].text == "Nested loop detected (outer loop at line 2)."

    # only the "hint (level N): ..." entry becomes hint evidence — the
    # "asked: ..." entry is a question, not a hint, and must not appear as
    # hint-0 or under any other hint id
    assert by_id["hint-0"].kind == "hint"
    assert by_id["hint-0"].text == "hint (level 1): Think about lookups."
    assert "hint-1" not in by_id
    assert not any(item.text.startswith("asked:") for item in evidence if item.kind == "hint")

    assert by_id["rubric-0"].kind == "rubric"
    assert "Candidate justified the hash map choice." in by_id["rubric-0"].text
    assert "approach=2" in by_id["rubric-0"].text

    assert by_id["stage-0"].kind == "stage"
    assert by_id["stage-0"].text == "Moved to stage: clarification"
    assert by_id["stage-1"].text == "Moved to stage: approach"


def test_build_evidence_on_empty_state_returns_empty_list():
    state = InterviewState(problem=PROBLEM, language="python")
    assert build_evidence(state) == []


# --- generate_final_review (mock provider) ---


async def test_generate_final_review_with_mock_provider_returns_a_valid_review():
    state = make_populated_state()
    review = await generate_final_review(state, MockLLMProvider())

    assert isinstance(review, FinalReview)
    known_ids = {item.id for item in review.evidence}
    assert known_ids == {item.id for item in build_evidence(state)}
    for point in (*review.strengths, *review.areas_to_improve):
        assert set(point.evidence_ids).issubset(known_ids)
    # every stage-history entry became one timeline entry
    assert len(review.timeline) == len(state.stage_history)
    assert review.timeline[0].elapsed_seconds == state.stage_history[0].timestamp - state.started_at


async def test_generate_final_review_on_empty_state_still_returns_a_valid_review():
    # No transcript/hints/rubric/stage activity at all — build_evidence
    # returns [], so the mock provider must still produce a schema-valid
    # FinalReview (empty strengths/areas_to_improve is allowed; citing a
    # nonexistent id is not).
    state = InterviewState(problem=PROBLEM, language="python")
    review = await generate_final_review(state, MockLLMProvider())
    assert isinstance(review, FinalReview)
    assert review.evidence == []
    assert review.strengths == []
    assert review.areas_to_improve == []


# --- retry-once behaviour ---


class _BadOnceProvider:
    """Test double: its first propose_review call raises ValidationError
    (simulating an LLM citing an evidence id that doesn't exist), and every
    subsequent call delegates to a real MockLLMProvider. Constructing
    FinalReview with a bogus evidence_ids entry is what actually raises —
    matching exactly how a real bad LLM response would fail, since
    FinalReview's own model_validator (schemas.py) is what rejects it."""

    def __init__(self) -> None:
        self.calls = 0
        self._mock = MockLLMProvider()

    async def propose_review(self, system_prompt: str, user_prompt: str) -> FinalReview:
        self.calls += 1
        if self.calls == 1:
            FinalReview(
                overall_score=5.0,
                rubric={"approach": 1},
                strengths=[ReviewPoint(text="bad citation", evidence_ids=["does-not-exist"])],
                areas_to_improve=[],
                timeline=[],
                evidence=[],
            )
            raise AssertionError("unreachable: the FinalReview(...) call above must raise first")
        return await self._mock.propose_review(system_prompt, user_prompt)


class _AlwaysBadProvider:
    """Every call raises ValidationError — exercises the "both attempts
    fail" path."""

    def __init__(self) -> None:
        self.calls = 0

    async def propose_review(self, system_prompt: str, user_prompt: str) -> FinalReview:
        self.calls += 1
        FinalReview(
            overall_score=5.0,
            rubric={"approach": 1},
            strengths=[ReviewPoint(text="bad citation", evidence_ids=["does-not-exist"])],
            areas_to_improve=[],
            timeline=[],
            evidence=[],
        )
        raise AssertionError("unreachable")


async def test_generate_final_review_retries_once_on_bad_citation_and_then_succeeds():
    state = make_populated_state()
    provider = _BadOnceProvider()

    review = await generate_final_review(state, provider)

    assert provider.calls == 2
    assert isinstance(review, FinalReview)


async def test_generate_final_review_raises_after_the_retry_also_fails():
    state = make_populated_state()
    provider = _AlwaysBadProvider()

    with pytest.raises(FinalReviewGenerationError):
        await generate_final_review(state, provider)

    # exactly one retry — no unbounded retry loop
    assert provider.calls == 2
