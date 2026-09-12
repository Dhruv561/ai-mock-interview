"""Test isolation from the developer's local .env.

`Settings` loads `backend/.env`, and pytest runs from `backend/`, so without
this every test inherited whatever a developer happened to have configured.
Once a real `DEEPGRAM_API_KEY` and `USE_MOCK_PROVIDERS=false` were set for
manual testing, three tests started constructing a real DeepgramSTTProvider
and opening a billable connection to a live third-party API (caught
2026-09-13 — the failure surfaced as `'DeepgramSTTSession' object has no
attribute 'chunks_received'`, i.e. the test got a real provider where it
expected the mock).

Tests must never depend on local machine state or reach a paid API, so mock
providers are forced here for the whole suite. A test that specifically
wants a real provider should construct it directly rather than relying on
settings.
"""

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True, scope="session")
def _force_mock_providers() -> None:
    get_settings.cache_clear()
    settings = get_settings()
    # Mutating the cached Settings instance rather than the environment: the
    # app reads provider choice through this same @lru_cache'd object, so
    # this covers every call site without depending on import order.
    settings.use_mock_providers = True
    settings.deepgram_api_key = None
    settings.anthropic_api_key = None
    settings.elevenlabs_api_key = None
