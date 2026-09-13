import { describe, expect, it, vi } from "vitest";
import { connectConvaiSocket, type ConvaiEvent } from "./convaiSocket";
import type { WebSocketLike, WebSocketLikeEvent } from "./websocket";

/**
 * A minimal fake WebSocketLike whose "open"/"message" listeners can be
 * fired synchronously by the test, mirroring how the real socket delivers
 * them.
 */
function createFakeSocket() {
  const listeners: Record<string, Array<(event: WebSocketLikeEvent) => void>> = {
    open: [],
    close: [],
    error: [],
    message: [],
  };
  const socket: WebSocketLike = {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: (type, listener) => {
      listeners[type].push(listener);
    },
  };
  return {
    socket,
    fireOpen: () => listeners.open.forEach((l) => l({})),
    fireMessage: (data: unknown) => listeners.message.forEach((l) => l({ data })),
  };
}

function agentResponseFrame(text: string) {
  return JSON.stringify({ type: "agent_response", agent_response_event: { agent_response: text } });
}

describe("connectConvaiSocket", () => {
  it(
    "delivers an event emitted before any subscriber attaches, once " +
      "subscribers attach later — the agent's automatic greeting can arrive " +
      "well before components/ConvaiInterviewPanel.tsx's hooks subscribe " +
      "(that panel deliberately delays subscribing until after a real " +
      "getUserMedia() permission round trip), so it must not be silently " +
      "dropped",
    async () => {
      const { socket, fireOpen, fireMessage } = createFakeSocket();
      const convaiSocket = connectConvaiSocket("wss://example.test", () => socket);

      fireOpen();
      // The greeting arrives before anything has subscribed yet.
      fireMessage(agentResponseFrame("Hi, let's start with Two Sum."));

      const received: ConvaiEvent[] = [];
      convaiSocket.onEvent((event) => received.push(event));

      // Let the microtask queue drain so the buffered flush can run.
      await Promise.resolve();
      await Promise.resolve();

      expect(received).toEqual([{ type: "agent_response", text: "Hi, let's start with Two Sum." }]);
    },
  );

  it("delivers the same buffered event to a second subscriber that attaches in the same synchronous tick as the first (matches ConvaiInterviewPanel.tsx mounting both the transcript-engine and audio-playback hooks together)", async () => {
    const { socket, fireOpen, fireMessage } = createFakeSocket();
    const convaiSocket = connectConvaiSocket("wss://example.test", () => socket);

    fireOpen();
    fireMessage(agentResponseFrame("Hi, let's start with Two Sum."));

    const first: ConvaiEvent[] = [];
    const second: ConvaiEvent[] = [];
    // Both subscribe synchronously, back to back, with no await between —
    // matching two effects flushed in the same React commit.
    convaiSocket.onEvent((event) => first.push(event));
    convaiSocket.onEvent((event) => second.push(event));

    await Promise.resolve();
    await Promise.resolve();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });

  it("does not re-deliver already-buffered events to a subscriber that attaches after the buffer has already flushed", async () => {
    const { socket, fireOpen, fireMessage } = createFakeSocket();
    const convaiSocket = connectConvaiSocket("wss://example.test", () => socket);

    fireOpen();
    fireMessage(agentResponseFrame("first"));

    const early: ConvaiEvent[] = [];
    convaiSocket.onEvent((event) => early.push(event));
    await Promise.resolve();
    await Promise.resolve();

    const late: ConvaiEvent[] = [];
    convaiSocket.onEvent((event) => late.push(event));

    fireMessage(agentResponseFrame("second"));

    expect(early.map((e) => (e.type === "agent_response" ? e.text : null))).toEqual([
      "first",
      "second",
    ]);
    expect(late.map((e) => (e.type === "agent_response" ? e.text : null))).toEqual(["second"]);
  });

  it("still delivers events live, in order, once buffering has stopped", async () => {
    const { socket, fireOpen, fireMessage } = createFakeSocket();
    const convaiSocket = connectConvaiSocket("wss://example.test", () => socket);

    fireOpen();
    const received: string[] = [];
    convaiSocket.onEvent((event) => {
      if (event.type === "agent_response") received.push(event.text);
    });
    await Promise.resolve();
    await Promise.resolve();

    fireMessage(agentResponseFrame("one"));
    fireMessage(agentResponseFrame("two"));

    expect(received).toEqual(["one", "two"]);
  });
});
