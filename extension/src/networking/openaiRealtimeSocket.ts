/**
 * OpenAI Realtime API WebSocket wire protocol handler.
 *
 * Wraps a WebSocketLike (from portSocketFactory), sends input audio in OpenAI's
 * format, and parses typed events for:
 * - session.started / connection ready
 * - response.audio.delta (output audio)
 * - response.text.delta (output transcript)
 * - input_audio_buffer.speech_stopped (candidate turn ended)
 * - error
 *
 * Per architecture.md: this is protocol-layer only, not interview-domain logic.
 */

import type { WebSocketLike } from "./websocket";

export type OpenAIRealtimeEvent = {
  type:
    | "session.ready"
    | "session.created"
    | "session.updated"
    | "response.created"
    | "response.started"
    | "response.done"
    | "response.text.delta"
    | "response.audio.delta"
    | "input_audio_buffer.speech_stopped"
    | "error";
  [key: string]: unknown;
}

export interface OpenAIRealtimeSocket {
  send(data: string): void;
  sendAudioDelta(audioBase64: string): void;
  onEvent(handler: (event: OpenAIRealtimeEvent) => void): () => void;
  onStateChange(handler: (state: "connecting" | "open" | "closed") => void): () => void;
  close(): void;
}

export function createOpenAIRealtimeSocket(ws: WebSocketLike): OpenAIRealtimeSocket {
  let state: "connecting" | "open" | "closed" = "connecting";
  const eventHandlers = new Set<(event: OpenAIRealtimeEvent) => void>();
  const stateHandlers = new Set<(state: "connecting" | "open" | "closed") => void>();

  function setState(next: "connecting" | "open" | "closed") {
    state = next;
    for (const handler of stateHandlers) handler(next);
  }

  ws.addEventListener("open", () => {
    setState("open");
  });

  ws.addEventListener("message", (messageEvent) => {
    if (typeof messageEvent.data !== "string") {
      // OpenAI's Realtime protocol is JSON-only over WebSocket
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(messageEvent.data);
    } catch {
      return;
    }

    const event = parsed as OpenAIRealtimeEvent;
    for (const handler of eventHandlers) handler(event);
  });

  ws.addEventListener("close", () => {
    setState("closed");
  });

  ws.addEventListener("error", () => {
    setState("closed");
  });

  return {
    send(data: string): void {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },

    sendAudioDelta(audioBase64: string): void {
      /**
       * Send a chunk of input audio to OpenAI.
       * audioBase64 is PCM16 audio (little-endian, 16-bit signed) at 24kHz,
       * base64-encoded.
       */
      const event = {
        type: "input_audio_buffer.append",
        audio: audioBase64,
      };

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    },

    onEvent(handler): () => void {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },

    onStateChange(handler): () => void {
      stateHandlers.add(handler);
      handler(state);
      return () => stateHandlers.delete(handler);
    },

    close(): void {
      setState("closed");
      ws.close();
    },
  };
}
