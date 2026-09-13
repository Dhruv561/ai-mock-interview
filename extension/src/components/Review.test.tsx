import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INITIAL_RUBRIC, type FinalReview } from "../state/types";
import { Review } from "./Review";

function buildReview(overrides: Partial<FinalReview> = {}): FinalReview {
  return {
    overallScore: 7.8,
    rubric: INITIAL_RUBRIC,
    strengths: [
      { text: "Asked clarifying questions early.", evidenceIds: ["t1"] },
    ],
    areasToImprove: [
      { text: "Didn't state complexity unprompted.", evidenceIds: ["t2"] },
    ],
    timeline: [{ label: "Interview ended", elapsedSeconds: 120 }],
    evidence: [
      { id: "t1", kind: "transcript", text: "What about duplicate values?" },
      { id: "t2", kind: "transcript", text: "I think it's fast enough." },
    ],
    ...overrides,
  };
}

describe("Review", () => {
  it("renders each strength/area bullet with its resolved evidence text visible", () => {
    render(<Review review={buildReview()} onRestart={vi.fn()} />);

    expect(screen.getByText("Asked clarifying questions early.")).toBeInTheDocument();
    expect(screen.getByText(/What about duplicate values\?/)).toBeInTheDocument();

    expect(screen.getByText("Didn't state complexity unprompted.")).toBeInTheDocument();
    expect(screen.getByText(/I think it's fast enough\./)).toBeInTheDocument();
  });

  it("shows a +N more affordance when a point cites multiple evidence ids", () => {
    const review = buildReview({
      strengths: [
        {
          text: "Iterated on the approach after feedback.",
          evidenceIds: ["t1", "t2"],
        },
      ],
    });
    render(<Review review={review} onRestart={vi.fn()} />);

    expect(screen.getByText(/\+1 more/)).toBeInTheDocument();
  });

  it("does not crash when an evidence id doesn't resolve, and skips that citation", () => {
    const review = buildReview({
      strengths: [{ text: "Handled edge cases well.", evidenceIds: ["missing-id"] }],
      areasToImprove: [],
    });
    render(<Review review={review} onRestart={vi.fn()} />);

    expect(screen.getByText("Handled edge cases well.")).toBeInTheDocument();
    expect(screen.queryByText(/—/)).not.toBeInTheDocument();
  });

  it("still renders the overall score, rubric and timeline", () => {
    render(<Review review={buildReview()} onRestart={vi.fn()} />);

    expect(screen.getByText("7.8")).toBeInTheDocument();
    expect(screen.getByText("Interview ended")).toBeInTheDocument();
  });
});
