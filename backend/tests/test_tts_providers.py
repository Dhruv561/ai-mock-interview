from app.config import Settings
from app.providers.tts import get_tts_provider
from app.providers.tts.elevenlabs import ElevenLabsTTSProvider
from app.providers.tts.mock import MockTTSProvider


async def test_mock_tts_provider_yields_no_audio():
    provider = MockTTSProvider()
    chunks = [chunk async for chunk in provider.synthesize("hello, interviewer")]
    assert chunks == []


def test_get_tts_provider_returns_mock_when_use_mock_providers_true():
    settings = Settings(
        use_mock_providers=True,
        elevenlabs_api_key="unused-key",
        elevenlabs_voice_id="unused-voice",
    )
    assert isinstance(get_tts_provider(settings), MockTTSProvider)


def test_get_tts_provider_returns_mock_when_no_elevenlabs_key():
    settings = Settings(
        use_mock_providers=False, elevenlabs_api_key=None, elevenlabs_voice_id="voice-1"
    )
    assert isinstance(get_tts_provider(settings), MockTTSProvider)


def test_get_tts_provider_returns_mock_when_no_voice_id():
    settings = Settings(
        use_mock_providers=False, elevenlabs_api_key="real-key", elevenlabs_voice_id=None
    )
    assert isinstance(get_tts_provider(settings), MockTTSProvider)


def test_get_tts_provider_returns_elevenlabs_when_configured():
    settings = Settings(
        use_mock_providers=False, elevenlabs_api_key="real-key", elevenlabs_voice_id="voice-1"
    )
    assert isinstance(get_tts_provider(settings), ElevenLabsTTSProvider)
