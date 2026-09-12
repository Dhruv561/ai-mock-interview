"""Validates shared/fixtures/*.json against the Pydantic schemas.

The extension side validates the same fixtures against the Zod mirror in
shared/events.ts (extension/src/networking/eventFixtures.test.ts). If one
side's schema drifts from the other, whichever side wasn't updated fails
here or there — see shared/README.md.
"""

import json
from pathlib import Path

from app.interview.schemas import CLIENT_EVENT_ADAPTER, SERVER_EVENT_ADAPTER

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text())


def test_session_start_fixture_matches_schema():
    CLIENT_EVENT_ADAPTER.validate_python(_load("session_start.json"))


def test_code_update_fixture_matches_schema():
    CLIENT_EVENT_ADAPTER.validate_python(_load("code_update.json"))


def test_session_started_fixture_matches_schema():
    SERVER_EVENT_ADAPTER.validate_python(_load("session_started.json"))


def test_error_fixture_matches_schema():
    SERVER_EVENT_ADAPTER.validate_python(_load("error.json"))
