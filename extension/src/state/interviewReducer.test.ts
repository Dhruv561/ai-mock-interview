import { describe, expect, it } from "vitest";
import { interviewReducer } from "./interviewReducer";
import { INITIAL_STATE, type FinalReview, type TranscriptMessage } from "./types";

describe("interviewReducer", () => {
  it("session/start resets to a clean recording state", () => {
    const dirty = { ...INITIAL_STATE, elapsedSeconds: 42, status: "ended" as const };
    const next = interviewReducer(dirty, { type: "session/start" });
    expect(next.status).toBe("recording");
    expect(next.elapsedSeconds).toBe(0);
    expect(next.messages).toHaveLength(0);
  });

  it("session/tick only advances time while recording", () => {
    const recording = { ...INITIAL_STATE, status: "recording" as const };
    expect(
      interviewReducer(recording, { type: "session/tick" }).elapsedSeconds,
    ).toBe(1);

    const paused = { ...INITIAL_STATE, status: "paused" as const };
    expect(
      interviewReducer(paused, { type: "session/tick" }).elapsedSeconds,
    ).toBe(0);
  });

  it("message/add appends without mutating the original array", () => {
    const message: TranscriptMessage = {
      id: "m1",
      speaker: "interviewer",
      text: "Walk me through your approach.",
      elapsedSeconds: 2,
    };
    const next = interviewReducer(INITIAL_STATE, {
      type: "message/add",
      message,
    });
    expect(next.messages).toEqual([message]);
    expect(INITIAL_STATE.messages).toHaveLength(0);
  });

  it("rubric/update clamps to the 0-3 range", () => {
    const tooHigh = interviewReducer(INITIAL_STATE, {
      type: "rubric/update",
      category: "approach",
      value: 9,
    });
    expect(tooHigh.rubric.approach).toBe(3);

    const tooLow = interviewReducer(INITIAL_STATE, {
      type: "rubric/update",
      category: "approach",
      value: -5,
    });
    expect(tooLow.rubric.approach).toBe(0);
  });

  it("hint/add appends to the hints list", () => {
    const next = interviewReducer(INITIAL_STATE, {
      type: "hint/add",
      hint: { level: 1, text: "Think about repeated lookups." },
    });
    expect(next.hints).toHaveLength(1);
    expect(next.hints[0].level).toBe(1);
  });

  it("review/ready stores the evidence-backed review as-is", () => {
    const review: FinalReview = {
      overallScore: 7.8,
      rubric: INITIAL_STATE.rubric,
      strengths: [{ text: "Asked clarifying questions early.", evidenceIds: ["t1"] }],
      areasToImprove: [{ text: "Didn't state complexity unprompted.", evidenceIds: ["t2"] }],
      timeline: [{ label: "Interview ended", elapsedSeconds: 120 }],
      evidence: [
        { id: "t1", kind: "transcript", text: "What about duplicate values?" },
        { id: "t2", kind: "transcript", text: "I think it's fast enough." },
      ],
    };
    const next = interviewReducer(INITIAL_STATE, { type: "review/ready", review });
    expect(next.review).toBe(review);
  });
});
