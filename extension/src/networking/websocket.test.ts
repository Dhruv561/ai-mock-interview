import { describe, expect, it, vi } from "vitest";
import type { ProblemInfo } from "../content/leetcode";
import {
  connectInterviewSocket,
  type WebSocketFactory,
  type WebSocketLike,
  type WebSocketLikeEvent,
} from "./websocket";

const PROBLEM: ProblemInfo = {
  slug: "two-sum",
  number: "1",
  title: "Two Sum",
  difficulty: "Easy",
  description: "Given an array...",
};

class FakeWebSocket implements WebSocketLike {
  readyState = 0; // CONNECTING
  sentText: string[] = [];
  sentBinary: Array<Blob | ArrayBufferLike> = [];
  private listeners: Record<string, Array<(event: WebSocketLikeEvent) => void>> = {};

  addEventListener(type: string, listener: (event: WebSocketLikeEvent) => void) {
    (this.listeners[type] ??= []).push(listener);
  }

  send(data: string | Blob | ArrayBufferLike) {
    if (typeof data === "string") {
      this.sentText.push(data);
    } else {
      this.sentBinary.push(data);
    }
  }

  close() {
    this.readyState = 3; // CLOSED
    this.emit("close", {});
  }

  emit(type: string, event: WebSocketLikeEvent) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }

  triggerOpen() {
    this.readyState = 1; // OPEN
    this.emit("open", {});
  }

  triggerMessage(data: unknown) {
    this.emit("message", { data: JSON.stringify(data) });
  }
}

function makeFactory() {
  const sockets: FakeWebSocket[] = [];
  const factory: WebSocketFactory = () => {
    const socket = new FakeWebSocket();
    sockets.push(socket);
    return socket;
  };
  return { sockets, factory };
}

describe("connectInterviewSocket", () => {
  it("starts in the connecting state and moves to open once the socket connects", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    const states: string[] = [];
    socket.onStateChange((s) => states.push(s));

    sockets[0].triggerOpen();

    expect(states).toEqual(["connecting", "open"]);
  });

  it("sends a validated client event as JSON once open", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();

    socket.send({ type: "session.start", problem: PROBLEM, language: "python" });

    expect(JSON.parse(sockets[0].sentText[0])).toEqual({
      type: "session.start",
      problem: PROBLEM,
      language: "python",
    });
  });

  it("throws instead of sending an event that fails the shared schema", () => {
    const { factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);

    expect(() =>
      // @ts-expect-error deliberately malformed for the test
      socket.send({ type: "session.start", problem: PROBLEM }),
    ).toThrow();
  });

  it("ignores server messages that don't match the shared schema", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();
    const received: unknown[] = [];
    socket.onEvent((event) => received.push(event));

    sockets[0].triggerMessage({ type: "not.a.real.event" });

    expect(received).toEqual([]);
  });

  it("delivers valid server events to subscribers", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();
    const received: unknown[] = [];
    socket.onEvent((event) => received.push(event));

    sockets[0].triggerMessage({ type: "session.started", seq: 1, session_id: "abc-123" });

    expect(received).toEqual([{ type: "session.started", seq: 1, session_id: "abc-123" }]);
  });

  it("reconnects with backoff and resumes the last known session", () => {
    vi.useFakeTimers();
    try {
      const { sockets, factory } = makeFactory();
      const socket = connectInterviewSocket("ws://test", factory);
      const states: string[] = [];
      socket.onStateChange((s) => states.push(s));

      sockets[0].triggerOpen();
      sockets[0].triggerMessage({ type: "session.started", seq: 1, session_id: "abc-123" });

      // server drops the connection without the caller calling close()
      sockets[0].close();
      expect(states.at(-1)).toBe("reconnecting");
      expect(sockets).toHaveLength(1);

      vi.advanceTimersByTime(1000);
      expect(sockets).toHaveLength(2);

      sockets[1].triggerOpen();
      expect(JSON.parse(sockets[1].sentText[0])).toEqual({
        type: "session.resume",
        session_id: "abc-123",
        last_seq: 1,
      });
      expect(states.at(-1)).toBe("open");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not send an audio chunk before a session exists", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();

    socket.sendAudioChunk(new Blob(["chunk"]));

    expect(sockets[0].sentBinary).toHaveLength(0);
  });

  it("sends an audio chunk as a binary frame once a session exists", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();
    sockets[0].triggerMessage({ type: "session.started", seq: 1, session_id: "abc-123" });

    const chunk = new Blob(["chunk"]);
    socket.sendAudioChunk(chunk);

    expect(sockets[0].sentBinary).toEqual([chunk]);
  });

  it("flushes audio buffered before the session, in order, once it starts", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();

    // The first chunk carries the WebM container header; if it is dropped,
    // the STT provider receives an unidentifiable stream and closes it.
    const header = new Blob(["header"]);
    const second = new Blob(["second"]);
    socket.sendAudioChunk(header);
    socket.sendAudioChunk(second);
    expect(sockets[0].sentBinary).toHaveLength(0);

    sockets[0].triggerMessage({ type: "session.started", seq: 1, session_id: "abc-123" });

    expect(sockets[0].sentBinary).toEqual([header, second]);
  });

  it("keeps the header chunk when trimming an overflowing audio buffer", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();

    const header = new Blob(["header"]);
    socket.sendAudioChunk(header);
    for (let i = 0; i < 50; i += 1) socket.sendAudioChunk(new Blob([`chunk-${i}`]));

    sockets[0].triggerMessage({ type: "session.started", seq: 1, session_id: "abc-123" });

    // Bounded, but the header survives trimming as index 0.
    expect(sockets[0].sentBinary.length).toBeLessThanOrEqual(21);
    expect(sockets[0].sentBinary[0]).toBe(header);
  });

  it("discards audio buffered before a session when one starts", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();

    // Audio captured while no session ever materialised (e.g. the backend
    // was down), which must not be delivered into a later session.
    socket.sendAudioChunk(new Blob(["stale"]));

    socket.send({ type: "session.start", problem: PROBLEM, language: "python" });
    sockets[0].triggerMessage({ type: "session.started", seq: 1, session_id: "abc-123" });

    expect(sockets[0].sentBinary).toHaveLength(0);
  });

  it("discards buffered audio when the session ends", () => {
    const { sockets, factory } = makeFactory();
    const socket = connectInterviewSocket("ws://test", factory);
    sockets[0].triggerOpen();

    // Buffered because no session is active yet.
    socket.sendAudioChunk(new Blob(["captured"]));

    // Ending the session must drop it, so it cannot later be flushed into
    // a session the user considers separate.
    socket.send({ type: "session.end" });
    sockets[0].triggerMessage({ type: "session.started", seq: 1, session_id: "abc-123" });

    expect(sockets[0].sentBinary).toHaveLength(0);
  });

  it("does not reconnect after the caller explicitly closes the socket", () => {
    vi.useFakeTimers();
    try {
      const { sockets, factory } = makeFactory();
      const socket = connectInterviewSocket("ws://test", factory);
      sockets[0].triggerOpen();

      socket.close();
      vi.advanceTimersByTime(20000);

      expect(sockets).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
