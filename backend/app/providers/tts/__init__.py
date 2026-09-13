from app.config import Settings
from app.providers.tts.base import TTSProvider
from app.providers.tts.elevenlabs import ElevenLabsTTSProvider
from app.providers.tts.mock import MockTTSProvider

__all__ = ["TTSProvider", "get_tts_provider"]


def get_tts_provider(settings: Settings) -> TTSProvider:
    if (
        settings.use_mock_providers
        or not settings.elevenlabs_api_key
        or not settings.elevenlabs_voice_id
    ):
        return MockTTSProvider()
    return ElevenLabsTTSProvider(settings.elevenlabs_api_key, settings.elevenlabs_voice_id)
