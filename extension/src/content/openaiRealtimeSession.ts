/**
 * OpenAI Realtime API interview session lifecycle (spike: alternative pipeline).
 *
 * Unlike the real pipeline which sends events to our backend, this pipeline
 * connects directly to OpenAI's Realtime API WebSocket. No server-side
 * interview state machine — just collect transcript and audio.
 *
 * On end, POST the transcript to the backend's `/api/openai-realtime/review`
 * endpoint to generate a final review using the real evaluator.
 */

import { getCurrentSnapshot } from "./editor";
import type { ProblemInfo } from "./leetcode";

let cachedProblem: ProblemInfo | null = null;
let sessionStarted = false;

export interface OpenAIRealtimeTranscriptEntry {
  speaker: "candidate" | "interviewer";
  text: string;
  timestamp: number;
}

export interface OpenAIRealtimeSessionState {
  ephemeralKey: string;
  sessionId: string;
  wsUrl: string;
  model: string;
  transcript: OpenAIRealtimeTranscriptEntry[];
  startedAt: number;
}

export function cacheProblemInfo(problem: ProblemInfo): void {
  cachedProblem = problem;
}

export function resetInterviewSession(): void {
  cachedProblem = null;
  sessionStarted = false;
}

export function hasActiveInterviewSession(): boolean {
  return sessionStarted;
}

export function endInterviewSession(): void {
  sessionStarted = false;
}

/**
 * Fetch ephemeral session credentials from the backend.
 * No-ops if already started, or if the problem hasn't been detected yet.
 */
export async function startOpenAIRealtimeSession(): Promise<OpenAIRealtimeSessionState | null> {
  if (sessionStarted || !cachedProblem) return null;
  sessionStarted = true;

  // Fetch ephemeral token from backend.
  // Use chrome.runtime.sendMessage to bypass CSP (content script → background service worker).
  const token = await new Promise<string | null>((resolve) => {
    chrome.runtime.sendMessage(
      {
        kind: "openai-realtime-http",
        url: "http://127.0.0.1:8000/api/openai-realtime/session",
        method: "GET",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response: any) => {
        if (response?.error) {
          console.error("Failed to get ephemeral session:", response.error);
          resolve(null);
          return;
        }
        resolve(response?.ephemeralKey ?? null);
      },
    );
  });

  if (!token) {
    sessionStarted = false;
    return null;
  }

  return {
    ephemeralKey: token,
    sessionId: cachedProblem.slug,
    wsUrl: "wss://api.openai.com/v1/realtime",
    model: "gpt-realtime-2.1",
    transcript: [],
    startedAt: Date.now() / 1000,
  };
}

/**
 * Post the final transcript to the backend's review endpoint.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function submitReview(state: OpenAIRealtimeSessionState): Promise<any> {
  if (!cachedProblem) throw new Error("No cached problem");

  const snapshot = await getCurrentSnapshot();
  const language = snapshot?.language ?? "plaintext";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await new Promise<any>((resolve: (value: any) => void) => {
    chrome.runtime.sendMessage(
      {
        kind: "openai-realtime-http",
        url: "http://127.0.0.1:8000/api/openai-realtime/review",
        method: "POST",
        body: JSON.stringify({
          problem: cachedProblem,
          language,
          transcript: state.transcript,
          started_at: state.startedAt,
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result: any) => {
        resolve(result);
      },
    );
  });

  return response;
}
