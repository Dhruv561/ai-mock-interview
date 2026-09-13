/**
 * Gemini Live interview panel (spike).
 *
 * Simplified version of InterviewPanel without the full interview state machine.
 * This pipeline has:
 * - No interview stage machine
 * - No rubric tracking
 * - Only transcript (candidate speech inferred from audio, interviewer responses from Gemini)
 * - Simple start/end lifecycle
 */

import { useState } from "react";
import { endGeminiLiveSession, startGeminiLiveSession } from "../content/geminiLiveSession";
import { useInterview } from "../state/interviewStore";
import { StatusIndicator } from "./StatusIndicator";
import { type MicBlockedReason, StartScreen } from "./StartScreen";
import { useMicrophoneCapture } from "../media/useMicrophoneCapture";

interface GeminiLiveTranscriptEntry {
  speaker: "candidate" | "interviewer";
  text: string;
  timestamp: number;
}

interface GeminiLivePanelProps {
  backendUrl: string;
  authToken: string | null;
  problemTitle: string;
}

export function GeminiLivePanel({ backendUrl, authToken, problemTitle }: GeminiLivePanelProps) {
  const { state, dispatch } = useInterview();
  const [transcript, setTranscript] = useState<GeminiLiveTranscriptEntry[]>([]);
  const [micBlockedReason, setMicBlockedReason] = useState<MicBlockedReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isActive = state.status === "recording";
  const mic = useMicrophoneCapture(null); // Not using websocket for this spike

  async function handleStart() {
    setMicBlockedReason(null);
    setError(null);

    const result = await mic.start();
    if (result !== "active") {
      setMicBlockedReason(result === "unsupported" ? "unsupported" : "denied");
      return;
    }

    dispatch({ type: "session/start" });

    try {
      await startGeminiLiveSession(
        backendUrl,
        authToken,
        (entries) => setTranscript([...entries]),
        (message) => setError(message),
      );
    } catch (e) {
      setError(`Failed to start session: ${String(e)}`);
      dispatch({ type: "session/end" });
      mic.stop();
    }
  }

  async function handleEnd() {
    mic.stop();
    await endGeminiLiveSession();
    dispatch({ type: "session/end" });
  }

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg font-sans text-[13px] text-ink">
      <StatusIndicator status={state.status} elapsedSeconds={state.elapsedSeconds} />

      {state.status === "idle" && (
        <StartScreen onStart={handleStart} micBlockedReason={micBlockedReason ?? undefined} />
      )}

      {isActive && (
        <div className="flex flex-1 flex-col gap-2 overflow-hidden px-4 py-3">
          <div className="text-xs font-semibold text-ink-faint">Problem: {problemTitle}</div>

          {error && (
            <div className="rounded bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <div className="space-y-2">
              {transcript.map((entry, i) => (
                <div key={i} className="text-xs">
                  <div className="font-semibold text-ink">
                    {entry.speaker === "interviewer" ? "Interviewer" : "You"}
                  </div>
                  <div className="mt-1 text-ink-faint">{entry.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleEnd}
              className="flex-1 rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
            >
              End Interview
            </button>
          </div>
        </div>
      )}

      {state.status === "ended" && (
        <div className="flex flex-1 items-center justify-center px-5 py-5">
          <div className="text-center">
            <div className="mb-3 text-sm font-semibold">Interview ended</div>
            <div className="text-xs text-ink-faint">
              {transcript.length} messages recorded
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
