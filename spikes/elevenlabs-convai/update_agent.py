"""One-off script: update the *existing* ElevenLabs Conversational AI agent's
first_message in place, instead of create_agent.py's create-a-new-agent flow
(which would orphan ELEVENLABS_CONVAI_AGENT_ID in every .env pointing at the
old agent). Run once: `python update_agent.py`.

GETs the agent's current conversation_config, patches only agent.first_message,
and PATCHes the whole config back — ElevenLabs' PATCH endpoint has been
observed to drop fields omitted from the body, so this round-trips the rest
of the config unchanged rather than sending a partial payload.
"""
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["ELEVENLABS_API_KEY"]
AGENT_ID = os.environ["ELEVENLABS_CONVAI_AGENT_ID"]

# Keep this in sync with create_agent.py's FIRST_MESSAGE — that script is
# what recreates the agent from scratch if it's ever deleted.
FIRST_MESSAGE = (
    "Hi, I'm your interviewer today. Let's start with the problem in front of "
    "you — {{problem_title}}. Your goal is to talk me through your "
    "approach and code a working solution while explaining your thinking as "
    "you go. Whenever you're ready, go ahead."
)

headers = {"xi-api-key": API_KEY, "Content-Type": "application/json"}

get_response = httpx.get(
    f"https://api.elevenlabs.io/v1/convai/agents/{AGENT_ID}",
    headers=headers,
    timeout=30,
)
get_response.raise_for_status()
agent = get_response.json()

conversation_config = agent["conversation_config"]
conversation_config["agent"]["first_message"] = FIRST_MESSAGE

patch_response = httpx.patch(
    f"https://api.elevenlabs.io/v1/convai/agents/{AGENT_ID}",
    headers=headers,
    json={"conversation_config": conversation_config},
    timeout=30,
)
patch_response.raise_for_status()
print("Updated first_message on agent", AGENT_ID)
print(patch_response.json().get("conversation_config", {}).get("agent", {}).get("first_message"))
