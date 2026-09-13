"""One-off script: create the ElevenLabs Conversational AI agent used by this spike.

Run once (`python create_agent.py`), copy the printed AGENT_ID line into .env.
Re-running creates a *new* agent each time (ElevenLabs has no "create or
update by name" endpoint in the simple REST API) - that's fine for a spike,
just update .env again.

Janky on purpose: no retries, no config file, persona is hardcoded below.
"""
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["ELEVENLABS_API_KEY"]
VOICE_ID = os.environ["ELEVENLABS_VOICE_ID"]

# Deliberately short - this spike only tests conversational feel, not the
# real interviewer's stage machine, hints, or rubric. See README "Known
# limitations".
SYSTEM_PROMPT = """You are a calm, experienced technical interviewer running a live \
coding interview. The candidate is solving an algorithmic problem out loud while \
you listen.

Rules:
- Ask short, open questions about their approach, complexity, and edge cases.
- Do not reveal a solution or the "right" approach unless they are completely stuck \
and ask directly for the answer.
- Prefer silence over filler. If the candidate is clearly still thinking out loud, \
let them keep talking - do not jump in just because there was a short pause.
- Never interrupt mid-sentence. Wait for a real pause before responding.
- Keep your own responses to one or two sentences.
- Silence almost always means the candidate is thinking or typing code, not that \
they have left or lost interest. Do NOT check in, and never say anything like \
"are you still there?", "just checking in", or similar. If you have nothing \
specific to ask, say nothing at all and keep waiting.
- Only speak after a silence if you have a real, specific question about their \
approach, their code, or something they just said - never speak purely because \
time has passed.
"""

FIRST_MESSAGE = "Hey, whenever you're ready, walk me through how you're thinking about this problem."

payload = {
    "conversation_config": {
        "agent": {
            "prompt": {
                "prompt": SYSTEM_PROMPT,
                "llm": "gemini-2.5-flash",  # fast + cheap for a spike; swap freely
            },
            "first_message": FIRST_MESSAGE,
            "language": "en",
        },
        "tts": {
            "voice_id": VOICE_ID,
        },
        "turn": {
            # Bias toward waiting rather than jumping in - this is the exact
            # knob the spike is trying to evaluate the feel of. Raised from
            # 10 to the max (30) after the first live test felt pushy - see
            # progress.md's "Spike" section, "tuning pass" entry.
            "turn_timeout": 30,
            "turn_eagerness": "patient",
            # Acknowledging noises/words shouldn't count as taking a turn or
            # count against the silence timer.
            "interruption_ignore_terms": ["mmhmm", "uh huh", "gotcha", "okay", "right", "yeah"],
            "merge_with_default_ignore_terms": True,
        },
    },
    "name": "mock-interview-spike",
}

response = httpx.post(
    "https://api.elevenlabs.io/v1/convai/agents/create",
    headers={"xi-api-key": API_KEY, "Content-Type": "application/json"},
    json=payload,
    timeout=30,
)
response.raise_for_status()
data = response.json()
print("Full response:", data)

agent_id = data.get("agent_id")
if agent_id:
    print(f"\nAGENT_ID={agent_id}")
    print("Add that line to spikes/elevenlabs-convai/.env")
else:
    print("\nNo agent_id in response - inspect the full response above.")
