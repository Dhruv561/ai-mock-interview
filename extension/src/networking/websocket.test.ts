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
  sent: string[] = [];
  private listeners: Record<string, Array<(event: WebSocketLikeEvent) => void>> = {};

  addEventListener(type: string, listener: (event: WebSocketLikeEvent) => void) {
    (this.listeners[type] ??= []).push(listener);
  }

  send(data: string) {
    this.sent.push(data);
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

    expect(JSON.parse(sockets[0].sent[0])).toEqual({
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
      expect(JSON.parse(sockets[1].sent[0])).toEqual({
        type: "session.resume",
        session_id: "abc-123",
        last_seq: 1,
      });
      expect(states.at(-1)).toBe("open");
    } finally {
      vi.useRealTimers();
    }
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
