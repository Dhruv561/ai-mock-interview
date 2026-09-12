// Mocked final-review synthesis (Feature 02). Kept until Feature 14 (End
// interview and review) replaces it with a real review.ready server event.
//
// The scripted message timeline and canned hint cycling that used to live
// here were removed once Feature 08 (AI interviewer) made real
// interviewer.transcript/hint.response/transcript.final events possible —
// see state/liveInterviewEngine.ts, which InterviewPanel.tsx now uses
// instead. Note the resulting inconsistency this leaves, tracked for
// Feature 14 rather than silently accepted: the transcript above the
// Review screen is now real, but the strengths/areasToImprove/timeline
// below are still this hardcoded placeholder, so they may no longer
// describe what the actual conversation was about.
import type { FinalReview } from "./types";

export function buildMockReview(
  rubric: FinalReview["rubric"],
  elapsedSeconds: number,
): FinalReview {
  return {
    overallScore: 7.8,
    rubric,
    strengths: [
      "Asked about unsorted input and empty-array edge cases before writing any code.",
      "Clearly stated the sort-then-sweep approach before touching the editor.",
      "Correctly identified the sweep as a single linear pass once the intervals are sorted.",
    ],
    areasToImprove: [
      "Didn't state the O(n log n) sort cost until prompted directly.",
      "No test cases were run against the empty-input or single-interval edge cases raised during clarification.",
    ],
    timeline: [
      { label: "Clarifying questions", elapsedSeconds: 2 },
      { label: "Approach explained", elapsedSeconds: 9 },
      { label: "Complexity challenged by interviewer", elapsedSeconds: 16 },
      { label: "Interview ended", elapsedSeconds },
    ],
  };
}
