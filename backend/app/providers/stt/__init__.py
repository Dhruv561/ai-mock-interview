from app.config import Settings
from app.providers.stt.base import STTProvider
from app.providers.stt.deepgram import DeepgramSTTProvider
from app.providers.stt.elevenlabs import ElevenLabsSTTProvider
from app.providers.stt.mock import MockSTTProvider

__all__ = ["STTProvider", "get_stt_provider"]


def get_stt_provider(settings: Settings) -> STTProvider:
    if settings.use_mock_providers:
        return MockSTTProvider()

    if settings.stt_provider == "deepgram":
        if not settings.deepgram_api_key:
            return MockSTTProvider()
        return DeepgramSTTProvider(settings.deepgram_api_key)

    # Default: elevenlabs
    if not settings.elevenlabs_api_key:
        return MockSTTProvider()
    return ElevenLabsSTTProvider(settings.elevenlabs_api_key)
