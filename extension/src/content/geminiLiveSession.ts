/**
 * Gemini Live interview session (spike).
 *
 * Manages the full lifecycle:
 * 1. Fetch ephemeral token from backend
 * 2. Connect to Gemini Live WebSocket
 * 3. Capture and send mic audio
 * 4. Receive and play interviewer audio/transcript
 * 5. Send code context to Gemini
 * 6. On end, POST transcript to backend for final review
 *
 * Unlike the real pipeline (interviewSession.ts), this has no server-side
 * interview state — state is maintained locally, and only the transcript
 * is sent at the end for review generation.
 */

import { GeminiLiveSocket } from "../networking/geminiLiveSocket";
import { portSocketFactory } from "../networking/portSocket";
import { GeminiLiveMicrophoneCapture } from "../media/geminiLiveMicrophone";
import { getCurrentSnapshot } from "./editor";
import type { ProblemInfo } from "./leetcode";

interface GeminiLiveTranscriptEntry {
  speaker: "candidate" | "interviewer";
  text: string;
  timestamp: number;
}

let cachedProblem: ProblemInfo | null = null;
let geminiSession: GeminiLiveSession | null = null;

export function cacheGeminiLiveProblemInfo(problem: ProblemInfo): void {
  cachedProblem = problem;
}

export function resetGeminiLiveSession(): void {
  cachedProblem = null;
  geminiSession?.end();
  geminiSession = null;
}

export function hasActiveGeminiLiveSession(): boolean {
  return geminiSession !== null && !geminiSession.isEnded();
}

export async function startGeminiLiveSession(
  backendUrl: string,
  authToken: string | null,
  onTranscriptUpdate: (entries: GeminiLiveTranscriptEntry[]) => void,
  onError: (message: string) => void,
): Promise<void> {
  if (geminiSession || !cachedProblem) return;

  geminiSession = new GeminiLiveSession(backendUrl, authToken, onTranscriptUpdate, onError);
  await geminiSession.start(cachedProblem);
}

export async function endGeminiLiveSession(): Promise<void> {
  if (!geminiSession) return;
  await geminiSession.end();
  geminiSession = null;
}

class GeminiLiveSession {
  private backendUrl: string;
  private authToken: string | null;
  private onTranscriptUpdate: (entries: GeminiLiveTranscriptEntry[]) => void;
  private onError: (message: string) => void;

  private socket: GeminiLiveSocket | null = null;
  private mic: GeminiLiveMicrophoneCapture | null = null;
  private transcript: GeminiLiveTranscriptEntry[] = [];
  private isEnded = false;
  private startTime = 0;

  constructor(
    backendUrl: string,
    authToken: string | null,
    onTranscriptUpdate: (entries: GeminiLiveTranscriptEntry[]) => void,
    onError: (message: string) => void,
  ) {
    this.backendUrl = backendUrl;
    this.authToken = authToken;
    this.onTranscriptUpdate = onTranscriptUpdate;
    this.onError = onError;
  }

  async start(problem: ProblemInfo): Promise<void> {
    this.startTime = Date.now() / 1000;

    // 1. Fetch ephemeral token from backend
    try {
      const tokenUrl = new URL("/api/gemini-live/token", this.backendUrl).toString();
      const response = await this.sendBackendRequest(tokenUrl, "GET");

      if (!response.success) {
        this.onError("Failed to get ephemeral token");
        return;
      }

      const { ws_url } = response.data;

      // 2. Connect to Gemini Live WebSocket via portSocket relay
      const ws = portSocketFactory(ws_url);
      this.socket = new GeminiLiveSocket(ws);

      this.socket.addEventListener("session-ready", () => {
        // Send initial code context
        void this.sendCodeContext(problem);
      });

      this.socket.addEventListener("output-transcript", (event) => {
        if (event.type === "output-transcript") {
          const timestamp = (Date.now() / 1000) - this.startTime;
          if (!this.transcript.some((e) => e.text === event.transcript && e.speaker === "interviewer")) {
            this.transcript.push({
              speaker: "interviewer",
              text: event.transcript,
              timestamp,
            });
            this.onTranscriptUpdate([...this.transcript]);
          }
        }
      });

      this.socket.addEventListener("error", (event) => {
        if (event.type === "error") {
          this.onError(event.message);
        }
      });

      this.socket.addEventListener("close", () => {
        this.isEnded = true;
      });

      // 3. Start microphone capture
      this.mic = new GeminiLiveMicrophoneCapture();
      const micResult = await this.mic.start((chunk) => {
        // Send audio chunk to Gemini Live
        if (this.socket?.isReady()) {
          const base64 = this.arrayBufferToBase64(chunk.buffer);
          this.socket.sendAudioChunk(base64);
        }
      });

      if (micResult !== "active") {
        this.onError(`Microphone unavailable: ${micResult}`);
        this.isEnded = true;
        return;
      }
    } catch (error) {
      this.onError(`Failed to start session: ${String(error)}`);
      this.isEnded = true;
    }
  }

  async end(): Promise<void> {
    if (this.isEnded) return;
    this.isEnded = true;

    this.mic?.stop();
    this.socket?.close();

    // Send transcript to backend for final review
    if (this.socket) {
      try {
        // Get problem info from cached state
        const problem = cachedProblem;
        if (problem) {
          const reviewUrl = new URL("/api/gemini-live/review", this.backendUrl).toString();
          const body = {
            problem,
            language: (await getCurrentSnapshot())?.language ?? "plaintext",
            transcript: this.transcript,
            started_at: this.startTime,
          };

          await this.sendBackendRequest(reviewUrl, "POST", JSON.stringify(body));
        }
      } catch (error) {
        console.error("Failed to send transcript for review:", error);
      }
    }
  }

  private async sendCodeContext(problem: ProblemInfo): Promise<void> {
    const snapshot = await getCurrentSnapshot();
    if (!snapshot) return;

    const contextText = `
Problem: ${problem.title}

Current Code:
\`\`\`${snapshot.language}
${snapshot.code}
\`\`\`
`;

    this.socket?.sendText(contextText);
  }

  private async sendBackendRequest(
    url: string,
    method: string,
    body?: string,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    return new Promise((resolve) => {
      const fullUrl = new URL(url);
      if (this.authToken) {
        fullUrl.searchParams.set("token", this.authToken);
      }

      chrome.runtime.sendMessage(
        {
          kind: "gemini-live-http",
          url: fullUrl.toString(),
          method,
          body,
        },
        (response: { success: boolean; data?: any; error?: string }) => {
          resolve(response ?? { success: false, error: "No response" });
        },
      );
    });
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  isEnded(): boolean {
    return this.isEnded;
  }
}
