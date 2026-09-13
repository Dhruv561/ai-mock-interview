import { describe, expect, it, beforeEach } from "vitest";
import {
  completeConvaiProgress,
  getConvaiProgressSnapshot,
  recordConvaiCodeUpdate,
  recordConvaiCodeAnalysis,
  recordConvaiTranscript,
  requestConvaiHint,
  resetConvaiProgress,
  startConvaiProgress,
} from "./convaiProgress";

describe("convaiProgress", () => {
  beforeEach(() => {
    resetConvaiProgress();
  });

  it("advances stages and records tiered hints", () => {
    startConvaiProgress();
    expect(getConvaiProgressSnapshot().stage).toBe("intro");
    expect(getConvaiProgressSnapshot().liveRubric.communication).toBe(0);

    recordConvaiTranscript("interviewer", "Let's talk about the approach.", 1.0);
    expect(getConvaiProgressSnapshot().stage).toBe("clarification");

    recordConvaiTranscript("candidate", "I'll use a hash map.", 2.0);
    expect(getConvaiProgressSnapshot().stage).toBe("approach");

    recordConvaiCodeUpdate("class Solution:\n    pass", "python", 3.0);
    expect(getConvaiProgressSnapshot().stage).toBe("coding");
    expect(getConvaiProgressSnapshot().liveRubric.code_quality).toBeGreaterThan(0);

    recordConvaiCodeAnalysis(["Nested loop detected (outer loop at line 2)."]);
    expect(getConvaiProgressSnapshot().codeAnalysisObservations).toHaveLength(1);

    expect(requestConvaiHint()).toBe(1);
    recordConvaiTranscript("interviewer", "Think about lookup speed.", 4.0);

    const afterHint = getConvaiProgressSnapshot();
    expect(afterHint.hints).toHaveLength(1);
    expect(afterHint.hints[0]).toEqual({
      level: 1,
      text: "Think about lookup speed.",
      timestamp: 4.0,
    });
    expect(afterHint.stage).toBe("complexity");
    expect(afterHint.liveRubric.complexity).toBe(1);
    expect(afterHint.liveRubric.communication).toBeGreaterThan(0);

    completeConvaiProgress(5.0);
    expect(getConvaiProgressSnapshot().stage).toBe("review");
  });
});