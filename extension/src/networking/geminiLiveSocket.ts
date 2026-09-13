/**
 * Gemini Live WebSocket wire protocol (spike).
 *
 * Wraps a WebSocketLike (from portSocketFactory), speaks Gemini Live's JSON
 * message format over the wire, and emits typed events for connection lifecycle,
 * transcript deltas, and audio chunks.
 *
 * Audio formats:
 * - INPUT: 16kHz signed PCM16 mono little-endian, base64-encoded in realtime_input messages
 * - OUTPUT: 24kHz signed PCM16 mono little-endian, base64-encoded in serverContent messages
 */

import type { WebSocketLike } from "./websocket";

export type GeminiLiveSocketEvent =
  | { type: "open" }
  | { type: "session-ready" }
  | { type: "output-audio-delta"; audioBase64: string }
  | { type: "output-transcript"; transcript: string; isFinal: boolean }
  | { type: "turn-complete" }
  | { type: "error"; message: string }
  | { type: "close" };

export class GeminiLiveSocket {
  private ws: WebSocketLike;
  private listeners = new Map<string, Set<(event: GeminiLiveSocketEvent) => void>>();
  private sessionReady = false;

  constructor(ws: WebSocketLike) {
    this.ws = ws;

    this.ws.addEventListener("open", () => {
      this.emit({ type: "open" });
    });

    this.ws.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        this.onMessage(event.data);
      }
    });

    this.ws.addEventListener("error", () => {
      this.emit({ type: "error", message: "WebSocket error" });
    });

    this.ws.addEventListener("close", () => {
      this.emit({ type: "close" });
    });
  }

  private onMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Gemini Live server response structure
      if (message.serverContent) {
        const { serverContent } = message;

        // Check if this is the session-ready event (setup complete)
        if (serverContent.setupComplete) {
          this.sessionReady = true;
          this.emit({ type: "session-ready" });
          return;
        }

        // Process model turn content (includes audio and transcription)
        if (serverContent.modelTurn) {
          const { modelTurn } = serverContent;

          // Extract output transcription if present
          if (serverContent.textContent?.parts?.[0]?.text) {
            const text = serverContent.textContent.parts[0].text;
            this.emit({
              type: "output-transcript",
              transcript: text,
              isFinal: !serverContent.modelTurn?.audioContent?.length,
            });
          }

          // Extract audio content
          if (modelTurn.parts) {
            for (const part of modelTurn.parts) {
              if (part.inlineData?.data) {
                this.emit({
                  type: "output-audio-delta",
                  audioBase64: part.inlineData.data,
                });
              }
            }
          }
        }

        // Turn completion signal
        if (serverContent.turnComplete) {
          this.emit({ type: "turn-complete" });
        }
      }
    } catch (error) {
      console.error("[GeminiLiveSocket] Failed to parse message:", error);
    }
  }

  isReady(): boolean {
    return this.sessionReady && this.ws.readyState === 1;
  }

  sendAudioChunk(pcm16Base64: string): void {
    if (this.ws.readyState !== 1) return;

    const message = {
      realtimeInput: {
        audio: {
          data: pcm16Base64,
          mimeType: "audio/pcm;rate=16000",
        },
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  sendText(text: string): void {
    if (this.ws.readyState !== 1) return;

    const message = {
      clientContent: {
        turns: [
          {
            parts: [{ text }],
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.ws.close();
  }

  addEventListener(type: string, listener: (event: GeminiLiveSocketEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: GeminiLiveSocketEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(event: GeminiLiveSocketEvent): void {
    const listeners = this.listeners.get(event.type) ?? new Set();
    for (const listener of listeners) {
      listener(event);
    }
  }
}
