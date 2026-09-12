// Bridges content/index.tsx's problem/code detection (content-script glue,
// no React) with components/InterviewPanel.tsx's Start button (React).
//
// The real session.start now fires on that click, not automatically once
// waitForProblemInfo() resolves — it used to fire automatically (Feature
// 06, before anything consumed server replies), but now that real
// interviewer/transcript events actually populate the visible transcript
// (Feature 08 wiring), an interviewer reply arriving before the candidate
// has consciously started the interview would be silently wiped the
// moment they click Start (interviewReducer's session/start case resets
// state.messages). Gating the real session on the same click as the
// visible one avoids that race entirely.
import { getInterviewSocket } from "../networking/interviewSocket";
import { getCurrentSnapshot } from "./editor";
import type { ProblemInfo } from "./leetcode";

let cachedProblem: ProblemInfo | null = null;
let sessionStarted = false;

export function cacheProblemInfo(problem: ProblemInfo): void {
  cachedProblem = problem;
}

/** Called on SPA navigation (a new problem page) so a stale cached problem can't leak into the next one. */
export function resetInterviewSession(): void {
  cachedProblem = null;
  sessionStarted = false;
}

export function hasActiveInterviewSession(): boolean {
  return sessionStarted;
}

/** Marks the current interview as ended (but keeps the cached problem), so clicking "Start" again — e.g. from the Review screen's restart — can begin a fresh real session. */
export function endInterviewSession(): void {
  sessionStarted = false;
}

/** No-ops if already started, or if the problem hasn't been detected yet. */
export async function startInterviewSession(): Promise<void> {
  if (sessionStarted || !cachedProblem) return;
  sessionStarted = true;
  const snapshot = await getCurrentSnapshot();
  getInterviewSocket().send({
    type: "session.start",
    problem: cachedProblem,
    language: snapshot?.language ?? "plaintext",
  });
}
