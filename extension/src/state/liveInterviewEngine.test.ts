import type { ServerEvent } from "@ai-mock-interview/shared";
import { renderHook, act } from "@testing-library/react";
import { useReducer } from "react";
import { describe, expect, it, vi } from "vitest";
import type { InterviewSocket } from "../networking/websocket";
import { interviewReducer } from "./interviewReducer";
import { useLiveInterviewEngine } from "./liveInterviewEngine";
import { INITIAL_STATE } from "./types";

function fakeSocket() {
  const handlers = new Set<(event: ServerEvent) => void>();
  const socket: InterviewSocket = {
    send: vi.fn(),
    sendAudioChunk: vi.fn(),
    onEvent: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    onStateChange: vi.fn(() => () => {}),
    close: vi.fn(),
  };
  return { socket, emit: (event: ServerEvent) => handlers.forEach((h) => h(event)) };
}

function renderEngine(elapsedSeconds = 10) {
  const { socket, emit } = fakeSocket();
  const { result } = renderHook(() => {
    const [state, dispatch] = useReducer(interviewReducer, {
      ...INITIAL_STATE,
      status: "recording",
      elapsedSeconds,
    });
    useLiveInterviewEngine(socket, elapsedSeconds, dispatch);
    return state;
  });
  return { result, emit };
}

describe("useLiveInterviewEngine", () => {
  it("appends an interviewer message on interviewer.transcript", () => {
    const { result, emit } = renderEngine(10);

    act(() => emit({ type: "interviewer.transcript", seq: 1, text: "What's the time complexity?" }));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({
      speaker: "interviewer",
      text: "What's the time complexity?",
      elapsedSeconds: 10,
    });
  });

  it("appends a candidate message on transcript.final", () => {
    const { result, emit } = renderEngine(20);

    act(() => emit({ type: "transcript.final", seq: 1, text: "I'll use a hash map", timestamp: 1.0 }));

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ speaker: "candidate", text: "I'll use a hash map" });
  });

  it("does not render transcript.partial (mid-speech) as a message", () => {
    const { result, emit } = renderEngine();

    act(() => emit({ type: "transcript.partial", seq: 1, text: "I'll use a..." }));

    expect(result.current.messages).toHaveLength(0);
  });

  it("adds a hint entry and a labeled message on hint.response", () => {
    const { result, emit } = renderEngine();

    act(() => emit({ type: "hint.response", seq: 1, level: 2, text: "Think about a hash map." }));

    expect(result.current.hints).toEqual([{ level: 2, text: "Think about a hash map." }]);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].text).toContain("Hint (level 2)");
  });

  it("clamps an out-of-range hint level into 1-3", () => {
    const { result, emit } = renderEngine();

    act(() => emit({ type: "hint.response", seq: 1, level: 7, text: "..." }));

    expect(result.current.hints[0].level).toBe(3);
  });

  it("ignores unrelated event types", () => {
    const { result, emit } = renderEngine();

    act(() => emit({ type: "session.started", seq: 1, session_id: "abc" }));

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.hints).toHaveLength(0);
  });
});
