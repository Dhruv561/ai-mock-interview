import type { InterviewStage } from "../networking/useInterviewStage";

// Shared between StageBadge.tsx and panels/PhaseList.tsx — kept out of
// either component file so both stay fast-refresh-only-exports-components
// clean.
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
