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
    onAudioChunk: vi.fn(() => () => {}),
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

  it("routes transcript.partial into the candidate draft, not messages", () => {
    const { result, emit } = renderEngine();

    act(() => emit({ type: "transcript.partial", seq: 1, text: "I'll use a..." }));

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.candidateDraft).toBe("I'll use a...");
  });

  it("replaces the draft in place as further partials arrive", () => {
    const { result, emit } = renderEngine();

    act(() => emit({ type: "transcript.partial", seq: 1, text: "I'll use a" }));
    act(() => emit({ type: "transcript.partial", seq: 2, text: "I'll use a hash" }));

    expect(result.current.candidateDraft).toBe("I'll use a hash");
  });

  it("clears the candidate draft once transcript.final lands", () => {
    const { result, emit } = renderEngine(20);

    act(() => emit({ type: "transcript.partial", seq: 1, text: "I'll use a..." }));
    act(() => emit({ type: "transcript.final", seq: 2, text: "I'll use a hash map", timestamp: 1.0 }));

    expect(result.current.candidateDraft).toBeNull();
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ speaker: "candidate", text: "I'll use a hash map" });
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

  it("translates review.ready's snake_case FinalReview into the client's camelCase shape", () => {
    const { result, emit } = renderEngine(120);

    act(() =>
      emit({
        type: "review.ready",
        seq: 1,
        review: {
          overall_score: 7.8,
          rubric: {
            clarifying: 3,
            approach: 2,
            code_quality: 2,
            complexity: 1,
            communication: 2,
            testing: 1,
          },
          strengths: [
            { text: "Asked clarifying questions early.", evidence_ids: ["t1"] },
          ],
          areas_to_improve: [
            { text: "Didn't state complexity unprompted.", evidence_ids: ["t2"] },
          ],
          timeline: [{ label: "Interview ended", elapsed_seconds: 120 }],
          evidence: [
            { id: "t1", kind: "transcript", text: "What about duplicate values?" },
            { id: "t2", kind: "transcript", text: "I think it's fast enough." },
          ],
        },
      }),
    );

    expect(result.current.review).toEqual({
      overallScore: 7.8,
      rubric: {
        clarifying: 3,
        approach: 2,
        code_quality: 2,
        complexity: 1,
        communication: 2,
        testing: 1,
      },
      strengths: [{ text: "Asked clarifying questions early.", evidenceIds: ["t1"] }],
      areasToImprove: [
        { text: "Didn't state complexity unprompted.", evidenceIds: ["t2"] },
      ],
      timeline: [{ label: "Interview ended", elapsedSeconds: 120 }],
      evidence: [
        { id: "t1", kind: "transcript", text: "What about duplicate values?" },
        { id: "t2", kind: "transcript", text: "I think it's fast enough." },
      ],
    });
  });

  it("ignores unrelated event types", () => {
    const { result, emit } = renderEngine();

    act(() => emit({ type: "session.started", seq: 1, session_id: "abc" }));

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.hints).toHaveLength(0);
  });
});
