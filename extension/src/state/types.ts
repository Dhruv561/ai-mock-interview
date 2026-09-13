// Interview UI state types. Mirrors the shape of architecture.md §G's event
// catalogue closely enough that swapping the mock engine (state/mockEngine.ts)
// for the real WebSocket client (networking/websocket.ts) in a later phase
// should only require translating server events into these same actions.

export type InterviewStage =
  | "intro"
  | "clarification"
  | "approach"
  | "coding"
  | "complexity"
  | "testing"
  | "optimisation"
  | "review";

export type SessionStatus = "idle" | "recording" | "paused" | "ended";

export type Speaker = "interviewer" | "candidate";

export interface TranscriptMessage {
  id: string;
  speaker: Speaker;
  text: string;
  elapsedSeconds: number;
}

// Full FR13 rubric (PRD.md §4). docs/ui-reference.png only shows the first
// four rows — that's the screenshot being illustrative, not the rubric being
// scoped down; communication/testing are scored the same way, just later in
// a real interview (there's rarely evidence for them this early on).
export const RUBRIC_CATEGORIES = [
  "clarifying",
  "approach",
  "code_quality",
  "complexity",
  "communication",
  "testing",
] as const;

export type RubricCategory = (typeof RUBRIC_CATEGORIES)[number];

export type RubricState = Record<RubricCategory, number>;

export const RUBRIC_LABELS: Record<RubricCategory, string> = {
  clarifying: "Clarifying",
  approach: "Approach",
  code_quality: "Code quality",
  complexity: "Complexity",
  communication: "Communication",
  testing: "Testing",
};

export const RUBRIC_MAX = 3;

export interface HintEntry {
  level: 1 | 2 | 3;
  text: string;
}

export interface TimelineEvent {
  label: string;
  elapsedSeconds: number;
}

export interface FinalReview {
  overallScore: number; // 0-10
  rubric: RubricState;
  strengths: string[];
  areasToImprove: string[];
  timeline: TimelineEvent[];
}

export interface InterviewUIState {
  status: SessionStatus;
  stage: InterviewStage;
  elapsedSeconds: number;
  messages: TranscriptMessage[];
  // The candidate's in-progress utterance, from transcript.partial events —
  // replaced in place as speech continues, not appended to `messages` (see
  // liveInterviewEngine.ts). null when nothing is currently being said.
  candidateDraft: string | null;
  rubric: RubricState;
  hints: HintEntry[];
  review: FinalReview | null;
}

export const INITIAL_RUBRIC: RubricState = {
  clarifying: 0,
  approach: 0,
  code_quality: 0,
  complexity: 0,
  communication: 0,
  testing: 0,
};

export const INITIAL_STATE: InterviewUIState = {
  status: "idle",
  stage: "intro",
  elapsedSeconds: 0,
  messages: [],
  candidateDraft: null,
  rubric: INITIAL_RUBRIC,
  hints: [],
  review: null,
};
