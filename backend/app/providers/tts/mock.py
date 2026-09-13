"""Mock TTS provider — the default (USE_MOCK_PROVIDERS=true, or no
ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID configured).

Yields no audio at all. Per architecture.md §M's testing strategy ("mock
provider returns silence/no audio, exercising the text-first-audio-optional
path"), this must not fabricate audio — the interviewer's text is always
the source of truth (already sent by the caller before synthesis is even
attempted, see websocket/interview.py's _speak_audio), and audio is a
strictly additive, best-effort signal on top of it.

The caller (_speak_audio) still emits interviewer.audio.start and
interviewer.audio.end around this empty stream, rather than skipping them
in mock mode — see the design note in websocket/interview.py for why.
"""

from collections.abc import AsyncIterator


class MockTTSProvider:
    async def synthesize(self, text: str) -> AsyncIterator[bytes]:
        for chunk in ():
            yield chunk
