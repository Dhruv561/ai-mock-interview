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

    const ended = { ...INITIAL_STATE, status: "ended" as const };
    expect(
      interviewReducer(ended, { type: "session/tick" }).elapsedSeconds,
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

  it("candidateDraft/set replaces the in-progress candidate line", () => {
    const withDraft = interviewReducer(INITIAL_STATE, {
      type: "candidateDraft/set",
      text: "I'll use a",
    });
    expect(withDraft.candidateDraft).toBe("I'll use a");

    const replaced = interviewReducer(withDraft, {
      type: "candidateDraft/set",
      text: "I'll use a hash",
    });
    expect(replaced.candidateDraft).toBe("I'll use a hash");
  });

  it("message/add clears any in-progress candidate draft", () => {
    const withDraft = { ...INITIAL_STATE, candidateDraft: "I'll use a..." };
    const message: TranscriptMessage = {
      id: "m1",
      speaker: "candidate",
      text: "I'll use a hash map",
      elapsedSeconds: 4,
    };
    const next = interviewReducer(withDraft, { type: "message/add", message });
    expect(next.candidateDraft).toBeNull();
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
      rubric: {
        clarifying: 2,
        approach: 2,
        code_quality: 1,
        complexity: 1,
        communication: 0,
        testing: 0,
      },
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
