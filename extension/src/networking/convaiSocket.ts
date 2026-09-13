// Hand-rolled ElevenLabs Conversational AI WebSocket protocol client —
// spike only (spikes/elevenlabs-convai/README.md, progress.md's "Spike"
// section). This is NOT the official @elevenlabs/client SDK: that SDK
// insists on owning mic capture and the socket together in one JS
// context, but leetcode.com's CSP forces the real WebSocket into the
// background service worker, exactly like the product's real backend
// connection (see portSocket.ts's header comment) — a content script
// can't open it directly. So this reuses the same generic port-relay
// transport (portSocketFactory) and speaks the wire protocol directly.
//
// The protocol below was read out of the actual shipped SDK source
// (@elevenlabs/client@1.25.0's dist/BaseConversation.js,
// utils/WebSocketConnection.js, utils/attachInputToConnection.js), not
// guessed from docs — ElevenLabs' own docs pages didn't give exact
// field-level shapes at the time this was written. In particular:
//   - the mic-audio message has NO "type" field: {user_audio_chunk: "<base64>"}
//   - every other outgoing message does: {type: "...", ...}
//   - the first server message is always conversation_initiation_metadata
import { arrayBufferToBase64, portSocketFactory } from "./portSocket";
import type { WebSocketLike } from "./websocket";

export interface ConvaiMetadata {
  conversationId: string;
  agentOutputAudioFormat: string;
  userInputAudioFormat: string;
}

export type ConvaiEvent =
  | { type: "metadata"; metadata: ConvaiMetadata }
  | { type: "audio"; base64: string }
  | { type: "user_transcript"; text: string }
  | { type: "agent_response"; text: string }
  | { type: "interruption" }
  | { type: "error"; message: string };

export interface ConvaiSocket {
  onEvent(handler: (event: ConvaiEvent) => void): () => void;
  onClose(handler: () => void): () => void;
  /** pcm16: raw 16-bit signed PCM samples, 16kHz mono (media/convaiMicrophone.ts). */
  sendAudioChunk(pcm16: ArrayBuffer): void;
  /** Non-interrupting text the agent sees without it counting as a turn — used
   * for code snapshots (content/convaiSession.ts) and hint nudges. */
  sendContextualUpdate(text: string): void;
  close(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function connectConvaiSocket(
  signedUrl: string,
  createSocket: (url: string) => WebSocketLike = portSocketFactory,
): ConvaiSocket {
  const ws = createSocket(signedUrl);
  const eventHandlers = new Set<(event: ConvaiEvent) => void>();
  const closeHandlers = new Set<() => void>();

  function emit(event: ConvaiEvent) {
    for (const handler of eventHandlers) handler(event);
  }

  ws.addEventListener("open", () => {
    // Minimal conversation_initiation_client_data — no per-session
    // overrides, since persona/voice/turn-taking config already live on
    // the agent itself (spikes/elevenlabs-convai/create_agent.py).
    ws.send(JSON.stringify({ type: "conversation_initiation_client_data" }));
  });

  ws.addEventListener("message", (event) => {
    // Every message in this protocol is JSON text — audio is base64
    // *inside* a JSON "audio" event, never a raw binary frame (unlike the
    // real pipeline's TTS chunks). A non-string frame here would mean
    // something upstream misparsed the connection, not a normal case.
    if (typeof event.data !== "string") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isRecord(parsed) || typeof parsed.type !== "string") return;

    switch (parsed.type) {
      case "conversation_initiation_metadata": {
        const meta = parsed.conversation_initiation_metadata_event;
        if (!isRecord(meta)) return;
        emit({
          type: "metadata",
          metadata: {
            conversationId: String(meta.conversation_id ?? ""),
            agentOutputAudioFormat: String(meta.agent_output_audio_format ?? "pcm_16000"),
            userInputAudioFormat: String(meta.user_input_audio_format ?? "pcm_16000"),
          },
        });
        break;
      }
      case "audio": {
        const audioEvent = parsed.audio_event;
        if (isRecord(audioEvent) && typeof audioEvent.audio_base_64 === "string") {
          emit({ type: "audio", base64: audioEvent.audio_base_64 });
        }
        break;
      }
      case "user_transcript": {
        const transcriptEvent = parsed.user_transcription_event;
        if (isRecord(transcriptEvent)) {
          emit({ type: "user_transcript", text: String(transcriptEvent.user_transcript ?? "") });
        }
        break;
      }
      case "agent_response": {
        const responseEvent = parsed.agent_response_event;
        if (isRecord(responseEvent)) {
          emit({ type: "agent_response", text: String(responseEvent.agent_response ?? "") });
        }
        break;
      }
      case "interruption":
        emit({ type: "interruption" });
        break;
      case "ping": {
        const pingEvent = parsed.ping_event;
        if (isRecord(pingEvent)) {
          ws.send(JSON.stringify({ type: "pong", event_id: pingEvent.event_id }));
        }
        break;
      }
      case "error":
        emit({ type: "error", message: String(parsed.message ?? "unknown error") });
        break;
      default:
        break; // agent_typing, vad_score, context_usage, etc. — not needed for this spike
    }
  });

  ws.addEventListener("close", () => {
    for (const handler of closeHandlers) handler();
  });

  return {
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    onClose(handler) {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    sendAudioChunk(pcm16) {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Deliberately no "type" field — matches the real SDK's
      // attachInputToConnection.js exactly (see header comment).
      ws.send(JSON.stringify({ user_audio_chunk: arrayBufferToBase64(pcm16) }));
    },
    sendContextualUpdate(text) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "contextual_update", text }));
    },
    close() {
      ws.close();
    },
  };
}
