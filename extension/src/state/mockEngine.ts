// Scripted interview used to build and demo the panel UI before any backend
// exists (Feature 02, architecture.md §C "done when"). The dialogue below is
// deliberately the same exchange shown in docs/ui-reference.png so the built
// UI can be compared directly against the visual target.
import { useEffect, useRef, type Dispatch } from "react";
import type { InterviewAction } from "./interviewReducer";
import type { FinalReview, HintEntry, SessionStatus } from "./types";

interface ScriptStep {
  delayMs: number;
  action: InterviewAction;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function buildScript(): ScriptStep[] {
  return [
    {
      delayMs: 1500,
      action: {
        type: "message/add",
        message: {
          id: nextId("msg"),
          speaker: "interviewer",
          elapsedSeconds: 2,
          text: "Before you start — what should we clarify about the input? Could the intervals be unsorted, and could the array be empty?",
        },
      },
    },
    { delayMs: 400, action: { type: "stage/set", stage: "clarification" } },
    {
      delayMs: 5000,
      action: {
        type: "message/add",
        message: {
          id: nextId("msg"),
          speaker: "candidate",
          elapsedSeconds: 6,
          text: "Good question — I'll assume intervals can be unsorted and the array might be empty, so I'll handle that edge case explicitly.",
        },
      },
    },
    {
      delayMs: 300,
      action: { type: "rubric/update", category: "clarifying", value: 3 },
    },
    {
      delayMs: 3000,
      action: {
        type: "message/add",
        message: {
          id: nextId("msg"),
          speaker: "interviewer",
          elapsedSeconds: 9,
          text: "Walk me through your plan before you type anything.",
        },
      },
    },
    { delayMs: 300, action: { type: "stage/set", stage: "approach" } },
    {
      delayMs: 4000,
      action: {
        type: "message/add",
        message: {
          id: nextId("msg"),
          speaker: "candidate",
          elapsedSeconds: 13,
          text: "I'll sort by start time, then sweep once and extend the last interval whenever it overlaps.",
        },
      },
    },
    {
      delayMs: 300,
      action: { type: "rubric/update", category: "approach", value: 2 },
    },
    {
      delayMs: 3000,
      action: {
        type: "message/add",
        message: {
          id: nextId("msg"),
          speaker: "interviewer",
          elapsedSeconds: 16,
          text: "Good. What's the cost of that sort, and can you do better than it?",
        },
      },
    },
    { delayMs: 500, action: { type: "stage/set", stage: "coding" } },
    {
      delayMs: 6000,
      action: {
        type: "rubric/update",
        category: "code_quality",
        value: 1,
      },
    },
  ];
}

/** Plays the scripted timeline once per "session/start", cleans up on unmount/reset. */
export function useMockInterviewEngine(
  status: SessionStatus,
  dispatch: Dispatch<InterviewAction>,
) {
  const playedRef = useRef(false);

  useEffect(() => {
    if (status === "idle") {
      playedRef.current = false;
      return;
    }
    if (status !== "recording" || playedRef.current) return;
    playedRef.current = true;

    const timeouts: number[] = [];
    let cumulative = 0;
    for (const step of buildScript()) {
      cumulative += step.delayMs;
      timeouts.push(window.setTimeout(() => dispatch(step.action), cumulative));
    }

    return () => {
      timeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [status, dispatch]);
}

const HINTS: readonly HintEntry[] = [
  {
    level: 1,
    text: "Think about whether you need to repeatedly search the intervals you've already seen.",
  },
  {
    level: 2,
    text: "What data structure could make repeated lookups cheaper than a linear scan?",
  },
  {
    level: 3,
    text: "Sort once up front, then keep only the last merged interval to compare against as you sweep — you never need to look further back than that.",
  },
];

export function nextMockHint(alreadyRequestedCount: number): HintEntry {
  const index = Math.min(alreadyRequestedCount, HINTS.length - 1);
  return HINTS[index];
}

export function buildMockReview(elapsedSeconds: number): FinalReview {
  return {
    overallScore: 7.8,
    rubric: {
      clarifying: 3,
      approach: 2,
      code_quality: 2,
      complexity: 1,
      communication: 2,
      testing: 0,
    },
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
