import type { ServerEvent } from "@ai-mock-interview/shared";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InterviewSocket } from "./websocket";
import { useInterviewStage } from "./useInterviewStage";

function fakeSocket() {
  const handlers = new Set<(event: ServerEvent) => void>();
  const socket: InterviewSocket = {
    send: vi.fn(),
    sendAudioChunk: vi.fn(),
    onEvent: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    onAudioChunk: vi.fn(() => () => {}),
    onStateChange: vi.fn(() => () => {}),
    close: vi.fn(),
  };
  return { socket, emit: (event: ServerEvent) => handlers.forEach((h) => h(event)) };
}

describe("useInterviewStage", () => {
  it("starts null", () => {
    const { socket } = fakeSocket();
    const { result } = renderHook(() => useInterviewStage(socket));
    expect(result.current).toBeNull();
  });

  it("updates on interviewer.state events and ignores other event types", () => {
    const { socket, emit } = fakeSocket();
    const { result } = renderHook(() => useInterviewStage(socket));

    act(() => emit({ type: "session.started", seq: 1, session_id: "abc" }));
    expect(result.current).toBeNull();

    act(() => emit({ type: "interviewer.state", seq: 2, stage: "clarification" }));
    expect(result.current).toBe("clarification");

    act(() => emit({ type: "interviewer.state", seq: 3, stage: "coding" }));
    expect(result.current).toBe("coding");
  });
});
