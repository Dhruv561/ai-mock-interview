import { useCallback, useEffect, useRef, useState } from "react";
import type { ConvaiSocket } from "../networking/convaiSocket";
import {
  requestMicrophoneStream,
  startConvaiMicrophoneCapture,
  type ConvaiMicrophoneCapture,
} from "./convaiMicrophone";

export type MicStatus = "idle" | "requesting" | "active" | "denied" | "unsupported";

/**
 * Convai analog of media/useMicrophoneCapture.ts — same start/stop/
 * generation-guard invariants (architecture.md §B.2), targeting the Convai
 * socket's raw-PCM sendAudioChunk instead of the real pipeline's WebM/Opus
 * binary frames (see convaiMicrophone.ts).
 *
 * Differs in one way: start() takes the socket as a call-time argument
 * rather than a hook-level parameter. The real pipeline's socket exists
 * before Start is ever clicked (module-level singleton, networking/
 * interviewSocket.ts); this one doesn't exist until content/
 * convaiSession.ts's startConvaiSession() resolves *inside* the Start
 * click handler, so there's nothing to close over at the top of the hook.
 */
export function useConvaiMicrophoneCapture() {
  const [status, setStatus] = useState<MicStatus>("idle");
  const captureRef = useRef<ConvaiMicrophoneCapture | null>(null);
  const getAnalyser = useCallback(() => captureRef.current?.analyser ?? null, []);
  const generationRef = useRef(0);

  const stop = useCallback(() => {
    generationRef.current += 1;
    captureRef.current?.stop();
    captureRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(
    async (socket: ConvaiSocket): Promise<MicStatus> => {
      if (captureRef.current) stop();

      const generation = generationRef.current;
      setStatus("requesting");

      const stream = await requestMicrophoneStream();

      if (generation !== generationRef.current) {
        if (stream) for (const track of stream.getTracks()) track.stop();
        return "idle";
      }
      if (!stream) {
        setStatus("denied");
        return "denied";
      }

      const capture = startConvaiMicrophoneCapture(stream, (chunk) => socket.sendAudioChunk(chunk));
      if (!capture) {
        setStatus("unsupported");
        return "unsupported";
      }
      if (generation !== generationRef.current) {
        capture.stop();
        return "idle";
      }

      captureRef.current = capture;
      setStatus("active");
      return "active";
    },
    [stop],
  );

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      captureRef.current?.stop();
      captureRef.current = null;
    };
  }, []);

  return { status, start, stop, getAnalyser };
}
