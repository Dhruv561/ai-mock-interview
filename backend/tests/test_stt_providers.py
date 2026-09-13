from app.config import Settings
from app.providers.stt import get_stt_provider
from app.providers.stt.deepgram import DeepgramSTTProvider
from app.providers.stt.elevenlabs import ElevenLabsSTTProvider, relay_message
from app.providers.stt.mock import MockSTTProvider, MockSTTSession


async def _noop(_text: str) -> None:
    pass


def _collector(seen: list[str]):
    async def _collect(text: str) -> None:
        seen.append(text)

    return _collect


async def _fail(_text: str) -> None:
    raise AssertionError("should not be called")


async def test_mock_stt_session_counts_chunks():
    session = MockSTTSession()
    await session.send_audio(b"chunk-1")
    await session.send_audio(b"chunk-2")
    assert session.chunks_received == 2
    await session.close()  # must not raise


async def test_mock_stt_provider_starts_a_mock_session():
    provider = MockSTTProvider()
    session = await provider.start_session(_noop, _noop)
    assert isinstance(session, MockSTTSession)


def test_get_stt_provider_returns_mock_when_use_mock_providers_true():
    settings = Settings(use_mock_providers=True, elevenlabs_api_key="unused-key")
    assert isinstance(get_stt_provider(settings), MockSTTProvider)


def test_get_stt_provider_returns_mock_when_no_elevenlabs_key():
    settings = Settings(use_mock_providers=False, elevenlabs_api_key=None)
    assert isinstance(get_stt_provider(settings), MockSTTProvider)


def test_get_stt_provider_returns_elevenlabs_by_default_when_configured():
    settings = Settings(use_mock_providers=False, elevenlabs_api_key="real-key")
    assert isinstance(get_stt_provider(settings), ElevenLabsSTTProvider)


def test_get_stt_provider_returns_mock_when_deepgram_selected_but_no_key():
    settings = Settings(use_mock_providers=False, stt_provider="deepgram", deepgram_api_key=None)
    assert isinstance(get_stt_provider(settings), MockSTTProvider)


def test_get_stt_provider_returns_deepgram_when_explicitly_selected():
    settings = Settings(
        use_mock_providers=False, stt_provider="deepgram", deepgram_api_key="real-key"
    )
    assert isinstance(get_stt_provider(settings), DeepgramSTTProvider)


async def test_relay_message_routes_partial_transcript():
    seen: list[str] = []
    await relay_message(
        '{"message_type": "partial_transcript", "text": "hello wor"}',
        on_partial=_collector(seen),
        on_final=_fail,
    )
    assert seen == ["hello wor"]


async def test_relay_message_routes_committed_transcript():
    seen: list[str] = []
    await relay_message(
        '{"message_type": "committed_transcript", "text": "hello world"}',
        on_partial=_fail,
        on_final=_collector(seen),
    )
    assert seen == ["hello world"]


async def test_relay_message_ignores_other_message_types():
    await relay_message(
        '{"message_type": "session_started", "session_id": "abc"}', on_partial=_fail, on_final=_fail
    )
    await relay_message("not json at all", on_partial=_fail, on_final=_fail)
    await relay_message(
        '{"message_type": "committed_transcript", "text": ""}', on_partial=_fail, on_final=_fail
    )
