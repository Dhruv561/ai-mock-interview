"""Application settings, loaded from environment variables / .env.

See architecture.md §U for what each variable is for. USE_MOCK_PROVIDERS
defaults to True so the backend is useful in local development with no
provider keys configured at all (architecture.md §S).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # LLM (interviewer + evaluator agents)
    anthropic_api_key: str | None = None

    # Streaming speech-to-text
    deepgram_api_key: str | None = None

    # Text-to-speech
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None

    # Persistence (optional — falls back to in-memory when unset). A
    # Supabase-hosted Postgres works here too: this is a direct asyncpg
    # connection string, not the Supabase client SDK, so there is no
    # separate Supabase URL/service-role-key setting to configure
    # (Feature 20 cleanup — those two were declared but never read).
    database_url: str | None = None

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    allowed_origins: str = "chrome-extension://placeholder,https://leetcode.com"

    # App behaviour
    app_env: str = "local"
    use_mock_providers: bool = True

    # --- Deployment-only safeguards (Feature 19) ---
    # All three default to "off" so local dev (and the existing test suite)
    # behave exactly as before. They only need setting once the backend is
    # reachable from somewhere other than the developer's own machine — see
    # DEPLOY.md.
    #
    # Comma-separated shared secrets. A WebSocket connection must supply one
    # of these as `?token=` to be accepted at all (checked before `accept()`
    # in websocket/interview.py). Empty (default) disables the check
    # entirely. Multiple values let different teams/judges get their own
    # code without sharing one secret.
    session_shared_secrets: str = ""
    # Hard cap on concurrent live sessions — the real cost driver is
    # concurrent-sessions × duration, not request volume, so this (not a
    # request-rate limiter) is what actually bounds worst-case provider
    # spend. 0 disables the cap.
    max_concurrent_sessions: int = 0
    # Force-ends any session that runs past this many seconds, independent
    # of client behaviour (a forgotten/abandoned tab can't bill forever).
    # 0 disables the cap.
    session_max_duration_seconds: int = 0

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def session_shared_secrets_list(self) -> list[str]:
        return [token.strip() for token in self.session_shared_secrets.split(",") if token.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
