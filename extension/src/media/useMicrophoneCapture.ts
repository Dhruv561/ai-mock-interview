import { useCallback, useRef, useState } from "react";
import type { InterviewSocket } from "../networking/websocket";
import { requestMicrophoneStream, startMicrophoneCapture, type MicrophoneCapture } from "./microphone";

export type MicStatus = "idle" | "requesting" | "active" | "denied" | "unsupported";

/**
 * Ties mic capture to a WS session (Feature 05). Independent of
 * state/interviewStore's mock-driven session status, same as
 * networking/interviewSocket.ts's connection badge — the panel calls
 * start()/stop() from its own Start/End handlers.
 */
export function useMicrophoneCapture(socket: InterviewSocket) {
  const [status, setStatus] = useState<MicStatus>("idle");
  const captureRef = useRef<MicrophoneCapture | null>(null);

  const start = useCallback(async () => {
    setStatus("requesting");
    const stream = await requestMicrophoneStream();
    if (!stream) {
      setStatus("denied");
      return;
    }

    const capture = startMicrophoneCapture(stream, (chunk) => socket.sendAudioChunk(chunk));
    if (!capture) {
      setStatus("unsupported");
      return;
    }

    captureRef.current = capture;
    setStatus("active");
  }, [socket]);

  const stop = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    setStatus("idle");
  }, []);

  return { status, start, stop };
}
