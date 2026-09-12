from app.config import Settings
from app.providers.llm.anthropic import AnthropicLLMProvider
from app.providers.llm.base import LLMProvider
from app.providers.llm.mock import MockLLMProvider

__all__ = ["LLMProvider", "get_llm_provider"]


def get_llm_provider(settings: Settings) -> LLMProvider:
    if settings.use_mock_providers or not settings.anthropic_api_key:
        return MockLLMProvider()
    return AnthropicLLMProvider(settings.anthropic_api_key)
