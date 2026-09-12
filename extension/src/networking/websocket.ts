// WebSocket transport client (architecture.md §G, Feature 06). Owns
// connect/reconnect/resume — no interview-domain logic (state machine, LLM
// responses) lives here; this only guarantees typed events reach the
// backend and come back, with automatic recovery from a dropped
// connection. Framework-agnostic on purpose so it's unit-testable without
// a browser/React (see websocket.test.ts).
import {
  clientEventSchema,
  serverEventSchema,
  type ClientEvent,
  type ServerEvent,
} from "@ai-mock-interview/shared";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

// Mic capture starts on the Start click, but `sessionId` only exists once
// session.started comes back — so the first chunks are produced before there
// is anywhere to send them. They used to be dropped, which quietly broke
// real transcription: MediaRecorder puts the WebM/EBML container header in
// its *first* chunk only, and every later chunk is a bare continuation
// cluster. Deepgram can't identify a container it never received the header
// for, so it closed the stream immediately (observed live 2026-09-13 — a log
// full of `43 c3 81 00` clusters and not one `1a 45 df a3` header).
// Buffering until the session opens keeps that header intact.
const MAX_PENDING_AUDIO_CHUNKS = 20; // ~5s at the 250ms capture interval

export interface InterviewSocket {
  send(event: ClientEvent): void;
  /**
   * Sends a raw mic-audio chunk as a binary WS frame — no JSON envelope,
   * per the framing convention in architecture.md §G. Silently dropped
   * (not queued) if there's no open connection with an active session yet;
   * the caller (media/useMicrophoneCapture.ts) doesn't need to track
   * connection/session state itself to know when this is safe to call.
   */
  sendAudioChunk(chunk: Blob): void;
  onEvent(handler: (event: ServerEvent) => void): () => void;
  onStateChange(handler: (state: ConnectionState) => void): () => void;
  close(): void;
}

// Minimal structural subset of the WebSocket API/constructor this module
// needs — lets tests inject a fake instead of relying on jsdom's WebSocket.
// A single non-overloaded signature (rather than one overload per event
// type) so a plain test fake can implement it without fighting TS variance.
export interface WebSocketLikeEvent {
  data?: unknown;
}
export interface WebSocketLike {
  readyState: number;
  send(data: string | Blob | ArrayBufferLike): void;
  close(): void;
  addEventListener(
    type: "open" | "close" | "error" | "message",
    listener: (event: WebSocketLikeEvent) => void,
  ): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

const defaultFactory: WebSocketFactory = (url) => new WebSocket(url) as unknown as WebSocketLike;

export function connectInterviewSocket(
  url: string,
  createSocket: WebSocketFactory = defaultFactory,
): InterviewSocket {
  let ws: WebSocketLike | null = null;
  let state: ConnectionState = "connecting";
  let sessionId: string | null = null;
  let lastSeq = 0;
  let reconnectDelay = RECONNECT_BASE_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByCaller = false;
  let pendingAudio: Blob[] = [];

  const eventHandlers = new Set<(event: ServerEvent) => void>();
  const stateHandlers = new Set<(state: ConnectionState) => void>();

  function setState(next: ConnectionState) {
    state = next;
    for (const handler of stateHandlers) handler(next);
  }

  function flushPendingAudio() {
    if (!pendingAudio.length) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const chunk of pendingAudio) ws.send(chunk);
    pendingAudio = [];
  }

  function rawSend(event: ClientEvent) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  function open() {
    setState(sessionId ? "reconnecting" : "connecting");
    ws = createSocket(url);

    ws.addEventListener("open", () => {
      reconnectDelay = RECONNECT_BASE_MS;
      setState("open");
      if (sessionId) {
        rawSend({ type: "session.resume", session_id: sessionId, last_seq: lastSeq });
      }
    });

    ws.addEventListener("message", (messageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(messageEvent.data as string);
      } catch {
        return;
      }
      const result = serverEventSchema.safeParse(parsed);
      if (!result.success) return;
      const event = result.data;

      if (event.type === "session.started") {
        sessionId = event.session_id;
        lastSeq = event.seq;
        flushPendingAudio();
      } else {
        lastSeq = Math.max(lastSeq, event.seq);
      }

      for (const handler of eventHandlers) handler(event);
    });

    ws.addEventListener("close", () => {
      if (closedByCaller) {
        setState("closed");
        return;
      }
      setState("reconnecting");
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
        open();
      }, reconnectDelay);
    });

    ws.addEventListener("error", () => {
      ws?.close();
    });
  }

  open();

  return {
    send(event) {
      // Fail fast on a contract mismatch instead of sending something the
      // backend will reject anyway.
      clientEventSchema.parse(event);
      rawSend(event);
    },
    sendAudioChunk(chunk) {
      if (sessionId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(chunk);
        return;
      }
      // No session yet — hold the chunk rather than dropping it, so the
      // container header in chunk #1 survives to reach the STT provider.
      pendingAudio.push(chunk);
      if (pendingAudio.length > MAX_PENDING_AUDIO_CHUNKS) {
        // Drop from index 1, never index 0: the first chunk is the only one
        // carrying the WebM header, so it must outlive any trimming.
        pendingAudio.splice(1, 1);
      }
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    onStateChange(handler) {
      stateHandlers.add(handler);
      handler(state);
      return () => stateHandlers.delete(handler);
    },
    close() {
      closedByCaller = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      setState("closed");
    },
  };
}
