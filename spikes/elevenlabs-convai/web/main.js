// Janky spike glue code: fetch a signed URL from our tiny relay server, then
// hand everything else (mic capture, PCM encoding, playback, turn-taking) to
// ElevenLabs' own SDK. Loaded straight from jsDelivr's `+esm` endpoint so
// there's no build step for this throwaway page.
import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client/+esm";

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");

let conversation = null;

function log(cls, text) {
  const p = document.createElement("p");
  p.className = cls;
  p.textContent = text;
  logEl.appendChild(p);
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || "";
}

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  setStatus("requesting signed url...");
  try {
    const res = await fetch("/signed-url");
    if (!res.ok) throw new Error(await res.text());
    const { signed_url } = await res.json();

    setStatus("connecting...");
    conversation = await Conversation.startSession({
      signedUrl: signed_url,
      onConnect: () => {
        setStatus("connected — listening", "listening");
        stopBtn.disabled = false;
        log("sys", "connected");
      },
      onDisconnect: () => {
        setStatus("disconnected");
        startBtn.disabled = false;
        stopBtn.disabled = true;
        log("sys", "disconnected");
      },
      onModeChange: ({ mode }) => {
        // This is the signal this spike actually cares about: does it
        // correctly flip to "listening" and stay there while you talk,
        // rather than flipping to "speaking" over you?
        setStatus(mode === "speaking" ? "agent speaking" : "listening", mode);
      },
      onMessage: (message) => {
        if (message.source === "user") log("user", `you: ${message.message}`);
        else if (message.source === "ai") log("agent", `agent: ${message.message}`);
      },
      onError: (err) => {
        log("sys", `error: ${JSON.stringify(err)}`);
      },
    });
  } catch (err) {
    setStatus("error");
    log("sys", String(err));
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", async () => {
  if (conversation) {
    await conversation.endSession();
    conversation = null;
  }
  stopBtn.disabled = true;
  startBtn.disabled = false;
  setStatus("idle");
});
