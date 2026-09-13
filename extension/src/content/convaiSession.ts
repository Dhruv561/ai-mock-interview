// Convai analog of content/interviewSession.ts — manages the alternative
// ElevenLabs Conversational AI pipeline's session lifecycle (spike, see
// spikes/elevenlabs-convai/README.md and progress.md's "Spike" section).
// Mirrors that file's start/end gating so the two pipelines' Start/End
// buttons behave the same way from the panel's point of view, but this
// one also captures a transcript client-side (this pipeline has no
// InterviewState of its own) and posts it to backend/app/api/convai.py's
// /review endpoint at the end for a real evidence-based FinalReview.
import { connectConvaiSocket, type ConvaiSocket } from "../networking/convaiSocket";
import { getCurrentSnapshot } from "./editor";
import { getCachedProblemInfo } from "./interviewSession";
import {
  completeConvaiProgress,
  getConvaiProgressSnapshot,
  recordConvaiCodeUpdate,
  recordConvaiCodeAnalysis,
  recordConvaiTranscript,
  setConvaiLiveRubric,
  requestConvaiHint as queueConvaiHint,
  resetConvaiProgress,
  startConvaiProgress,
} from "./convaiProgress";
import type { ProblemInfo } from "./leetcode";
import type { RubricState } from "../state/types";

const DEFAULT_BACKEND_HTTP_URL = "http://127.0.0.1:8000";

interface TranscriptRecord {
  speaker: "candidate" | "interviewer";
  text: string;
  timestamp: number;
}

interface ConvaiPreviewResponse {
  live_rubric: RubricState;
}

let socket: ConvaiSocket | null = null;
let sessionStarted = false;
let sessionProblem: ProblemInfo | null = null;
let sessionLanguage = "plaintext";
let sessionStartedAt = 0;
let transcript: TranscriptRecord[] = [];

function backendUrl(path: string): string {
  const base = import.meta.env.VITE_BACKEND_HTTP_URL || DEFAULT_BACKEND_HTTP_URL;
  const token = import.meta.env.VITE_BACKEND_WS_TOKEN; // same judges-only token as the real pipeline
  if (!token) return `${base}${path}`;
  const separator = path.includes("?") ? "&" : "?";
  return `${base}${path}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Relays a REST call through the background service worker instead of
 * calling fetch() here directly — leetcode.com's CSP blocks a content
 * script's own network requests to the local backend exactly like it
 * blocked the real WebSocket (architecture.md §B.1); only the extension
 * context is exempt. See background/index.ts's onMessage handler.
 */
async function backendFetch(
  url: string,
  init?: { method?: "GET" | "POST"; body?: string },
): Promise<{ ok: boolean; status: number; body: string }> {
  return chrome.runtime.sendMessage({
    kind: "convai-http",
    url,
    method: init?.method ?? "GET",
    body: init?.body,
  });
}

function buildPreviewPayload(code: string, language: string): {
  code: string;
  language: string;
  stage: string | null;
  transcript_count: number;
  hint_count: number;
  stage_history: Array<{ stage: string; timestamp: number }>;
} {
  const progress = getConvaiProgressSnapshot();
  return {
    code,
    language,
    stage: progress.stage,
    transcript_count: progress.transcriptCount,
    hint_count: progress.hints.length,
    stage_history: progress.stageHistory,
  };
}

// Backend's ConvaiLiveRubricRequest schema (backend/app/api/convai.py) does
// NOT mirror ConvaiCodeAnalysisRequest's shape — it takes `current_code`
// (not `code`), no `language` at all, and an explicit
// `code_analysis_observations` list rather than re-running analysis. This
// is a deliberately lighter call than requestConvaiCodeAnalysis: it refreshes
// the rubric off already-known progress state without paying for a code
// re-analysis round trip, so it's the right thing to call after a
// transcript/hint change that doesn't itself touch the code.
async function requestConvaiLiveRubric(): Promise<RubricState | null> {
  const progress = getConvaiProgressSnapshot();
  try {
    const response = await backendFetch(backendUrl("/api/convai/live-rubric"), {
      method: "POST",
      body: JSON.stringify({
        stage: progress.stage,
        transcript_count: progress.transcriptCount,
        hint_count: progress.hints.length,
        current_code: progress.currentCode,
        code_analysis_observations: progress.codeAnalysisObservations,
        stage_history: progress.stageHistory,
      }),
    });
    if (!response.ok) {
      console.error("[ai-mock-interview] convai live rubric request failed", response.body);
      return null;
    }
    const parsed = JSON.parse(response.body) as ConvaiPreviewResponse;
    return parsed.live_rubric;
  } catch (error) {
    console.error("[ai-mock-interview] convai live rubric request errored", error);
    return null;
  }
}

async function requestConvaiCodeAnalysis(
  code: string,
  language: string,
): Promise<{ observations: string[]; liveRubric: RubricState | null } | null> {
  try {
    const response = await backendFetch(backendUrl("/api/convai/analyse-code"), {
      method: "POST",
      body: JSON.stringify({
        ...buildPreviewPayload(code, language),
      }),
    });
    if (!response.ok) {
      console.error("[ai-mock-interview] convai code analysis request failed", response.body);
      return null;
    }
    const parsed = JSON.parse(response.body) as { observations?: unknown; live_rubric?: unknown };
    const observations = Array.isArray(parsed.observations)
      ? parsed.observations.filter((value): value is string => typeof value === "string")
      : [];
    const liveRubric =
      parsed.live_rubric && typeof parsed.live_rubric === "object"
        ? (parsed.live_rubric as RubricState)
        : null;
    return { observations, liveRubric };
  } catch (error) {
    console.error("[ai-mock-interview] convai code analysis request errored", error);
    return null;
  }
}

export function hasActiveConvaiSession(): boolean {
  return sessionStarted;
}

export function recordConvaiTranscriptEntry(speaker: "candidate" | "interviewer", text: string): void {
  const timestamp = Date.now() / 1000 - sessionStartedAt;
  transcript.push({ speaker, text, timestamp });
  recordConvaiTranscript(speaker, text, timestamp);
  // Transcript/stage progress moves the rubric (clarifying/approach/
  // communication categories) without any code change — refresh the
  // backend-authored rubric here rather than waiting for the next code
  // update, which may never come this turn.
  if (!sessionStarted) return;
  void requestConvaiLiveRubric().then((liveRubric) => {
    if (liveRubric && sessionStarted) setConvaiLiveRubric(liveRubric);
  });
}

/**
 * No-ops (returns null) if the problem hasn't been detected yet or the
 * backend is unreachable. Returns the freshly connected socket so the
 * caller (components/ConvaiInterviewPanel.tsx) can hand it straight to
 * mic.start(socket) without waiting for a re-render.
 */
export async function startConvaiSession(): Promise<ConvaiSocket | null> {
  if (sessionStarted && socket) return socket;

  const problem = getCachedProblemInfo();
  if (!problem) return null;

  resetConvaiProgress();

  let signedUrl: string;
  try {
    const response = await backendFetch(backendUrl("/api/convai/signed-url"));
    if (!response.ok) {
      console.error("[ai-mock-interview] convai signed-url request failed", response.body);
      return null;
    }
    ({ signed_url: signedUrl } = JSON.parse(response.body) as { signed_url: string });
  } catch (error) {
    console.error("[ai-mock-interview] convai signed-url request errored", error);
    return null;
  }

  const snapshot = await getCurrentSnapshot();
  sessionProblem = problem;
  sessionLanguage = snapshot?.language ?? "plaintext";
  sessionStartedAt = Date.now() / 1000;
  transcript = [];
  startConvaiProgress();
  sessionStarted = true;
  socket = connectConvaiSocket(signedUrl);
  return socket;
}

/** Sends the candidate's current code as a non-interrupting contextual
 * update — this pipeline's only equivalent of the real pipeline's
 * code.update event, since the agent has no other way to see what's
 * being typed (CLAUDE.md §6 still applies: this is the direct-extraction
 * code, never OCR/screen content). */
export function sendConvaiCodeUpdate(code: string, language: string): void {
  if (!socket || !sessionStarted) return;
  recordConvaiCodeUpdate(code, language, Date.now() / 1000 - sessionStartedAt);
  void requestConvaiCodeAnalysis(code, language).then((result) => {
    if (!result || !sessionStarted) return;
    recordConvaiCodeAnalysis(result.observations);
    if (result.liveRubric) setConvaiLiveRubric(result.liveRubric);
  });
  socket.sendContextualUpdate(`The candidate's current code (${language}):\n\n${code}`);
}

/** Requests a tiered hint from the hosted agent and records that the
 * next interviewer response should be treated as a hint, not a normal
 * transcript turn. */
export function requestConvaiHint(): void {
  if (!socket || !sessionStarted) return;
  const hintLevel = queueConvaiHint();
  if (!hintLevel) return;
  socket.sendContextualUpdate(
    hintLevel === 1
      ? "The candidate has asked for a level 1 hint. Give a gentle conceptual nudge without naming a specific data structure or algorithm."
      : hintLevel === 2
        ? "The candidate has asked for a level 2 hint. Be more specific and name the relevant idea, but do not explain the full solution step by step."
        : "The candidate has asked for a level 3 hint. Give concrete guidance toward the solution, but do not write the code or reveal the final answer outright.",
  );
}

/**
 * Closes the socket and POSTs the captured transcript for a real,
 * evidence-based review (reusing the product's own evaluator — see
 * backend/app/api/convai.py). Returns the FinalReview in the same wire
 * shape review.ready's `review` field uses, or null if generation failed
 * — the caller degrades to "no review" rather than throwing, same as the
 * real pipeline's own review-generation-failed handling.
 */
export async function endConvaiSession(): Promise<Record<string, unknown> | null> {
  if (!sessionStarted || !sessionProblem) return null;
  sessionStarted = false;
  completeConvaiProgress(Date.now() / 1000 - sessionStartedAt);
  socket?.close();
  socket = null;

  const problem = sessionProblem;
  const language = sessionLanguage;
  const capturedTranscript = transcript;
  const progress = getConvaiProgressSnapshot();

  try {
    const response = await backendFetch(backendUrl("/api/convai/review"), {
      method: "POST",
      body: JSON.stringify({
        problem,
        language,
        transcript: capturedTranscript,
        code_analysis_observations: progress.codeAnalysisObservations,
        current_code: progress.currentCode,
        hints: progress.hints,
        stage_history: progress.stageHistory,
        started_at: 0,
      }),
    });
    if (!response.ok) {
      console.error("[ai-mock-interview] convai review request failed", response.body);
      return null;
    }
    return JSON.parse(response.body) as Record<string, unknown>;
  } catch (error) {
    console.error("[ai-mock-interview] convai review request errored", error);
    return null;
  }
}

/** Called on SPA navigation (a new problem page), mirroring
 * interviewSession.ts's resetInterviewSession — a stale session/socket
 * must not leak into the next problem's page. */
export function resetConvaiSession(): void {
  socket?.close();
  socket = null;
  sessionStarted = false;
  sessionProblem = null;
  transcript = [];
  resetConvaiProgress();
}
