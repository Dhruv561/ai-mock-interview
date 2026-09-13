/**
 * Interview panel for OpenAI Realtime API spike (alternative pipeline).
 *
 * Simplified vs. the real InterviewPanel:
 * - No interview state machine (stage, cooldown, etc.)
 * - No rubric
 * - No hints
 * - Live transcript only (candidate + interviewer audio)
 * - Simple Start/End button flow
 */

import React, { useState } from "react";
import { startOpenAIRealtimeSession, endInterviewSession, submitReview } from "../content/openaiRealtimeSession";
import { startPCM16MicrophoneCapture, stopAllPCM16MicrophoneCapture } from "../media/pcm16Microphone";
import { createOpenAIRealtimeSocket, type OpenAIRealtimeSocket, type OpenAIRealtimeEvent } from "../networking/openaiRealtimeSocket";
import { portSocketFactory } from "../networking/portSocket";

interface OpenAIRealtimePanelProps {
  problemTitle?: string;
}

export const OpenAIRealtimePanel: React.FC<OpenAIRealtimePanelProps> = ({ problemTitle = "Untitled" }) => {
  const [state, setState] = useState<"idle" | "starting" | "active" | "ending">("idle");
  const [transcript, setTranscript] = useState<Array<{ speaker: string; text: string; time: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [socketReady, setSocketReady] = useState(false);

  const handleStart = async () => {
    setError(null);
    setState("starting");

    const sessionState = await startOpenAIRealtimeSession();
    if (!sessionState) {
      setError("Failed to start session — check backend connection");
      setState("idle");
      return;
    }

    // Open WebSocket to OpenAI with ephemeral key via protocols.
    const protocols = [
      "realtime",
      `openai-insecure-api-key.${sessionState.ephemeralKey}`,
      "openai-beta.realtime-v1",
    ];

    const ws = portSocketFactory(sessionState.wsUrl, protocols);
    const rtSocket = createOpenAIRealtimeSocket(ws);

    rtSocket.onStateChange((s) => {
      if (s === "open") {
        setSocketReady(true);
        setState("active");

        // Start capturing mic.
        startPCM16MicrophoneCapture(
          (chunk) => {
            const base64 = arrayBufferToBase64(chunk.buffer);
            rtSocket.sendAudioDelta(base64);
          },
          (error) => {
            setError(`Mic error: ${error.message}`);
          },
        );
      } else if (s === "closed") {
        setSocketReady(false);
      }
    });

    rtSocket.onEvent((event: OpenAIRealtimeEvent) => {
      const now = new Date().toLocaleTimeString();

      if (event.type === "response.text.delta") {
        // Interviewer speech received.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const delta = (event as any).delta || "";
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.speaker === "interviewer") {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + delta },
            ];
          }
          return [...prev, { speaker: "interviewer", text: delta, time: now }];
        });
      } else if (event.type === "input_audio_buffer.speech_stopped") {
        // Candidate's turn ended (transcript available if transcription enabled).
        // This is a signal to OpenAI that we finished speaking.
      }
    });

    // Store the socket in window for the End handler.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__openaiRealtimeSocket = rtSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__openaiRealtimeSessionState = sessionState;
  };

  const handleEnd = async () => {
    setState("ending");
    stopAllPCM16MicrophoneCapture();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rtSocket = (window as any).__openaiRealtimeSocket as OpenAIRealtimeSocket | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionState = (window as any).__openaiRealtimeSessionState;

    if (rtSocket) {
      rtSocket.close();
    }

    if (sessionState) {
      try {
        const review = await submitReview(sessionState);
        console.log("Review generated:", review);
        // TODO: Display review in a separate screen.
      } catch (err) {
        setError(`Failed to generate review: ${err}`);
      }
    }

    endInterviewSession();
    setState("idle");
    setTranscript([]);
    setSocketReady(false);
  };

  return (
    <div style={{ padding: "16px", border: "1px solid #e0e0e0", borderRadius: "8px" }}>
      <div style={{ marginBottom: "12px", fontWeight: 600 }}>{problemTitle}</div>

      {error && (
        <div style={{ padding: "8px", marginBottom: "12px", background: "#fee", color: "#c33", borderRadius: "4px" }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: "12px", fontSize: "13px", color: "#666" }}>
        Status: {state}
        {socketReady && " • WebSocket: Open"}
      </div>

      <div
        style={{
          marginBottom: "12px",
          height: "200px",
          border: "1px solid #ddd",
          borderRadius: "4px",
          padding: "8px",
          overflow: "auto",
          fontSize: "12px",
          fontFamily: "monospace",
          background: "#f9f9f9",
        }}
      >
        {transcript.length === 0 ? (
          <div style={{ color: "#999" }}>Transcript will appear here</div>
        ) : (
          transcript.map((line, i) => (
            <div key={i} style={{ marginBottom: "4px" }}>
              <strong>{line.speaker}:</strong> {line.text}
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={handleStart}
          disabled={state !== "idle"}
          style={{
            padding: "8px 16px",
            background: "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: state === "idle" ? "pointer" : "not-allowed",
          }}
        >
          Start
        </button>
        <button
          onClick={handleEnd}
          disabled={state !== "active"}
          style={{
            padding: "8px 16px",
            background: "#cc0000",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: state === "active" ? "pointer" : "not-allowed",
          }}
        >
          End
        </button>
      </div>
    </div>
  );
};

function arrayBufferToBase64(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
