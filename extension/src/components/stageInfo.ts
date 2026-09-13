import type { InterviewStage } from "../networking/useInterviewStage";

// Kept out of StageBadge.tsx so that file stays
// fast-refresh-only-exports-components clean.
export const STAGE_LABELS: Record<InterviewStage, string> = {
  intro: "INTRO",
  clarification: "CLARIFYING",
  approach: "APPROACH",
  coding: "CODING",
  complexity: "COMPLEXITY",
  testing: "TESTING",
  optimisation: "OPTIMISATION",
  review: "REVIEW",
};

export const STAGE_ORDER: InterviewStage[] = [
  "intro",
  "clarification",
  "approach",
  "coding",
  "complexity",
  "testing",
  "optimisation",
  "review",
];
