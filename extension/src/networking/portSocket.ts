// A WebSocketLike that proxies to a real WebSocket living in the background
// service worker, over a chrome.runtime port.
//
// WHY THIS EXISTS (architecture.md §B correction, 2026-09-13): a content
// script cannot open this connection at all. leetcode.com serves
// `default-src 'none'; connect-src 'self' https://challenges.cloudflare.com`,
// and a page-context WebSocket to 127.0.0.1 is killed inside Chrome before a
// packet is sent — verified with backend debug logging showing *zero*
// inbound connection attempts during a page load. The same build's service
// worker connects on the first try (101 Switching Protocols) because its
// requests carry `origin: chrome-extension://<id>`, which is subject to
// neither the page's CSP nor Private Network Access. Host permission for the
// backend is necessary but not sufficient — it was granted and confirmed
// active in Chrome's own prefs while the content script still failed.
//
// This is deliberately a dumb pipe. All session-critical state (session id,
// last seq, reconnect/resume policy) stays in the content script's
// websocket.ts, because an MV3 worker can be evicted mid-interview — the
// concern that made §B put the socket in the content script originally. When
// the worker is evicted the port drops, websocket.ts sees a `close`, and its
// existing backoff opens a fresh port, which wakes the worker and replays
// `session.resume`. The worker holds nothing worth losing.
import type { WebSocketFactory, WebSocketLike, WebSocketLikeEvent } from "./websocket";

export const INTERVIEW_PORT_NAME = "interview-socket";

/** Content script → service worker. */
export type PortCommand =
  | { kind: "open"; url: string }
  | { kind: "text"; data: string }
  | { kind: "binary"; base64: string }
  | { kind: "close" };

/** Service worker → content script. */
export type PortUpdate =
  | { kind: "open" }
  | { kind: "message"; data: string }
  | { kind: "audio"; base64: string }
  | { kind: "error" }
  | { kind: "close"; code?: number };

// Mirrors the WebSocket readyState constants; the port has no equivalent so
// we track them by hand. websocket.ts compares against `WebSocket.OPEN`.
const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

class PortSocket implements WebSocketLike {
  readyState = CONNECTING;

  private port: chrome.runtime.Port | null;
  private listeners = new Map<string, Set<(event: WebSocketLikeEvent) => void>>();
  // Blob → base64 is async, but send() is sync. Chaining keeps audio chunks
  // in order; without it a small chunk could overtake a larger earlier one.
  private sendChain: Promise<void> = Promise.resolve();

  constructor(url: string) {
    this.port = chrome.runtime.connect({ name: INTERVIEW_PORT_NAME });

    this.port.onMessage.addListener((update: PortUpdate) => {
      switch (update.kind) {
        case "open":
          this.readyState = OPEN;
          this.emit("open", {});
          break;
        case "message":
          this.emit("message", { data: update.data });
          break;
        case "audio":
          // A real WebSocket fires the same "message" event for both text
          // and binary frames, distinguished only by event.data's runtime
          // type — mirroring that here (instead of a separate event kind)
          // keeps this class a believable structural subset of WebSocket.
          this.emit("message", { data: base64ToArrayBuffer(update.base64) });
          break;
        case "error":
          this.emit("error", {});
          break;
        case "close":
          this.readyState = CLOSED;
          this.emit("close", {});
          break;
      }
    });

    // Fires if the worker is evicted or the extension reloads. Surfaced as a
    // close so websocket.ts's normal reconnect path handles it — there is no
    // separate "worker died" case to reason about.
    this.port.onDisconnect.addListener(() => {
      this.port = null;
      if (this.readyState !== CLOSED) {
        this.readyState = CLOSED;
        this.emit("close", {});
      }
    });

    this.post({ kind: "open", url });
  }

  send(data: string | Blob | ArrayBufferLike): void {
    if (typeof data === "string") {
      this.post({ kind: "text", data });
      return;
    }
    // Ports are JSON-only, so binary audio has to be encoded. Base64 costs
    // ~33% overhead on a 250ms Opus chunk, which is a few KB — not worth a
    // more elaborate transfer scheme at this scale.
    this.sendChain = this.sendChain.then(async () => {
      const buffer = data instanceof Blob ? await data.arrayBuffer() : (data as ArrayBuffer);
      this.post({ kind: "binary", base64: arrayBufferToBase64(buffer) });
    });
  }

  close(): void {
    this.post({ kind: "close" });
    this.readyState = CLOSED;
    this.port?.disconnect();
    this.port = null;
  }

  addEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (event: WebSocketLikeEvent) => void,
  ): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  private emit(type: string, event: WebSocketLikeEvent) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  private post(command: PortCommand) {
    // Throws if the worker died between the disconnect and this call; the
    // onDisconnect handler already schedules recovery, so swallow it rather
    // than surfacing a spurious error to the caller.
    try {
      this.port?.postMessage(command);
    } catch {
      /* port already gone */
    }
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked to stay clear of the argument-count limit on large buffers.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export const portSocketFactory: WebSocketFactory = (url) => new PortSocket(url);
