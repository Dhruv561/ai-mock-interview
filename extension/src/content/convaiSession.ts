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
import type { ProblemInfo } from "./leetcode";

const DEFAULT_BACKEND_HTTP_URL = "http://127.0.0.1:8000";

interface TranscriptRecord {
  speaker: "candidate" | "interviewer";
  text: string;
  timestamp: number;
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

export function hasActiveConvaiSession(): boolean {
  return sessionStarted;
}

export function recordConvaiTranscriptEntry(speaker: "candidate" | "interviewer", text: string): void {
  transcript.push({ speaker, text, timestamp: Date.now() / 1000 - sessionStartedAt });
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

  let signedUrl: string;
  try {
    const response = await fetch(backendUrl("/api/convai/signed-url"));
    if (!response.ok) {
      console.error("[ai-mock-interview] convai signed-url request failed", await response.text());
      return null;
    }
    ({ signed_url: signedUrl } = (await response.json()) as { signed_url: string });
  } catch (error) {
    console.error("[ai-mock-interview] convai signed-url request errored", error);
    return null;
  }

  const snapshot = await getCurrentSnapshot();
  sessionProblem = problem;
  sessionLanguage = snapshot?.language ?? "plaintext";
  sessionStartedAt = Date.now() / 1000;
  transcript = [];
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
  socket.sendContextualUpdate(`The candidate's current code (${language}):\n\n${code}`);
}

/** This pipeline has no tiered hint system (documented limitation, see
 * the spike README) — a hint request is just a contextual nudge. */
export function requestConvaiHint(): void {
  if (!socket || !sessionStarted) return;
  socket.sendContextualUpdate(
    "The candidate has asked for a hint. Give a small nudge without revealing the solution.",
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
  socket?.close();
  socket = null;

  const problem = sessionProblem;
  const language = sessionLanguage;
  const capturedTranscript = transcript;

  try {
    const response = await fetch(backendUrl("/api/convai/review"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem, language, transcript: capturedTranscript, started_at: 0 }),
    });
    if (!response.ok) {
      console.error("[ai-mock-interview] convai review request failed", await response.text());
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
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
}
