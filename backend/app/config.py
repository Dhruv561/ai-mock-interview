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

    # Persistence (optional — falls back to in-memory when unset)
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    database_url: str | None = None

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    allowed_origins: str = "chrome-extension://placeholder,https://leetcode.com"

    # App behaviour
    app_env: str = "local"
    use_mock_providers: bool = True

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
