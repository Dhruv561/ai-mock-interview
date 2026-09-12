import type { InterviewStage } from "../networking/useInterviewStage";

const LABEL: Record<InterviewStage, string> = {
  intro: "INTRO",
  clarification: "CLARIFYING",
  approach: "APPROACH",
  coding: "CODING",
  complexity: "COMPLEXITY",
  testing: "TESTING",
  optimisation: "OPTIMISATION",
  review: "REVIEW",
};

/** Reflects the backend's real interview stage (Feature 07). Renders nothing until the first interviewer.state event arrives. */
export function StageBadge({ stage }: { stage: InterviewStage | null }) {
  if (!stage) return null;
  return (
    <div className="flex items-center gap-2 px-5 py-1.5">
      <span className="font-mono text-[10px] tracking-wider text-ink-faint">
        STAGE: {LABEL[stage]}
      </span>
    </div>
  );
}
