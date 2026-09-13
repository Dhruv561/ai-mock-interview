from app.config import Settings
from app.interview.schemas import EvidenceItem, FinalReview, ProblemInfo, ReviewPoint
from app.persistence import get_repository, postgres
from app.persistence.in_memory import InMemoryRepository
from app.persistence.postgres import PostgresRepository

PROBLEM = ProblemInfo(
    slug="two-sum",
    number="1",
    title="Two Sum",
    difficulty="Easy",
    description="Given an array of integers, return indices of two numbers that sum to target.",
)


def _final_review() -> FinalReview:
    evidence = [EvidenceItem(id="transcript-0", kind="transcript", text="I'd use a hash map.")]
    return FinalReview(
        overall_score=2.5,
        rubric={
            "clarifying": 1,
            "approach": 2,
            "code_quality": 2,
            "complexity": 1,
            "communication": 2,
            "testing": 1,
        },
        strengths=[ReviewPoint(text="Clear reasoning", evidence_ids=["transcript-0"])],
        areas_to_improve=[ReviewPoint(text="Missed edge cases", evidence_ids=["transcript-0"])],
        timeline=[],
        evidence=evidence,
    )


async def test_create_session_then_get_session_round_trips_shape():
    repo = InMemoryRepository()
    await repo.create_session("s1", PROBLEM, "python", started_at=100.0)

    session = await repo.get_session("s1")
    assert session is not None
    assert session["session_id"] == "s1"
    assert session["problem"]["slug"] == "two-sum"
    assert session["language"] == "python"
    assert session["started_at"] == 100.0
    assert session["status"] == "active"
    assert session["events"] == []
    assert session["final_review"] is None


async def test_get_session_returns_none_for_unknown_id():
    repo = InMemoryRepository()
    assert await repo.get_session("does-not-exist") is None


async def test_append_event_preserves_arrival_order():
    repo = InMemoryRepository()
    await repo.create_session("s2", PROBLEM, "python", started_at=0.0)

    await repo.append_event("s2", {"type": "transcript.final", "seq": 1, "text": "first"})
    await repo.append_event("s2", {"type": "transcript.final", "seq": 2, "text": "second"})

    session = await repo.get_session("s2")
    assert session is not None
    assert [event["text"] for event in session["events"]] == ["first", "second"]


async def test_append_event_before_create_session_does_not_raise():
    repo = InMemoryRepository()
    await repo.append_event("never-created", {"type": "transcript.final", "seq": 1})
    assert await repo.get_session("never-created") is None


async def test_save_final_review_stores_review_and_marks_completed():
    repo = InMemoryRepository()
    await repo.create_session("s3", PROBLEM, "python", started_at=0.0)
    review = _final_review()

    await repo.save_final_review("s3", review)

    session = await repo.get_session("s3")
    assert session is not None
    assert session["status"] == "completed"
    assert session["final_review"]["overall_score"] == 2.5
    assert session["final_review"]["strengths"][0]["text"] == "Clear reasoning"


async def test_get_session_copy_does_not_expose_internal_events_list():
    repo = InMemoryRepository()
    await repo.create_session("s4", PROBLEM, "python", started_at=0.0)
    snapshot = await repo.get_session("s4")
    assert snapshot is not None
    snapshot["events"].append({"type": "injected"})

    fresh = await repo.get_session("s4")
    assert fresh is not None
    assert fresh["events"] == []


async def test_separate_instances_share_the_same_backing_store():
    """InMemoryRepository instances share one module-level store (see
    in_memory.py's docstring) so that resolving a fresh instance per
    session (as websocket/interview.py does) still accumulates every
    session into one place instead of each instance only ever seeing the
    one session it created."""
    repo_a = InMemoryRepository()
    repo_b = InMemoryRepository()

    await repo_a.create_session("shared", PROBLEM, "python", started_at=0.0)

    session = await repo_b.get_session("shared")
    assert session is not None
    assert session["session_id"] == "shared"


def test_get_repository_returns_in_memory_when_mock_providers_enabled():
    settings = Settings(use_mock_providers=True, database_url="postgres://ignored")
    assert isinstance(get_repository(settings), InMemoryRepository)


def test_get_repository_returns_in_memory_when_no_database_url():
    settings = Settings(use_mock_providers=False, database_url=None)
    assert isinstance(get_repository(settings), InMemoryRepository)


def test_get_repository_returns_postgres_when_configured():
    settings = Settings(
        use_mock_providers=False, database_url="postgresql://user:pass@localhost/db"
    )
    assert isinstance(get_repository(settings), PostgresRepository)


def test_postgres_repository_construction_does_not_connect():
    """Smoke test only — no real database is reachable in this
    environment. Construction must be cheap and side-effect free; the pool
    is created lazily on first use, and shared at module level across every
    instance rather than owned per-instance (see postgres.py's docstring —
    Feature 20 cleanup, so N concurrent sessions share one bounded pool
    instead of each opening and never closing their own)."""
    PostgresRepository("postgresql://user:pass@localhost/db")
    assert postgres._pool is None


async def test_postgres_repository_instances_share_one_module_level_pool(monkeypatch):
    """Mirrors test_in_memory_repository_instances_share_one_module_level_store
    above: two instances constructed with the same URL (websocket/
    interview.py constructs a fresh PostgresRepository per session, not one
    shared instance) must resolve to the exact same pool object rather than
    each opening their own (Feature 20 cleanup)."""
    created_dsns = []

    class FakePool:
        pass

    async def fake_create_pool(dsn, min_size, max_size):
        created_dsns.append(dsn)
        return FakePool()

    monkeypatch.setattr(postgres.asyncpg, "create_pool", fake_create_pool)
    monkeypatch.setattr(postgres, "_pool", None)  # isolate from other tests

    repo_a = PostgresRepository("postgresql://user:pass@localhost/db")
    repo_b = PostgresRepository("postgresql://user:pass@localhost/db")

    pool_a = await repo_a._get_pool()
    pool_b = await repo_b._get_pool()

    assert pool_a is pool_b
    assert len(created_dsns) == 1
