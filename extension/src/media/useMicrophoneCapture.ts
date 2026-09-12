import { useCallback, useEffect, useRef, useState } from "react";
import type { InterviewSocket } from "../networking/websocket";
import { requestMicrophoneStream, startMicrophoneCapture, type MicrophoneCapture } from "./microphone";

export type MicStatus = "idle" | "requesting" | "active" | "denied" | "unsupported";

/**
 * Ties mic capture to a WS session (Feature 05). Independent of
 * state/interviewStore's mock-driven session status, same as
 * networking/interviewSocket.ts's connection badge — the panel calls
 * start()/stop() from its own Start/End handlers.
 *
 * Recording runs strictly between an explicit start() and stop(), and is
 * torn down on unmount. See microphone.ts for why that invariant is
 * enforced in two places rather than trusted to callers.
 */
export function useMicrophoneCapture(socket: InterviewSocket) {
  const [status, setStatus] = useState<MicStatus>("idle");
  const captureRef = useRef<MicrophoneCapture | null>(null);
  // Bumped by every stop() and by unmount. start() captures the value it
  // began with and abandons its result if it no longer matches, which
  // closes the race where the user starts and immediately stops (or
  // navigates away) while the permission prompt is still open — the
  // getUserMedia promise would otherwise resolve afterwards and start a
  // recorder that nothing holds a reference to.
  const generationRef = useRef(0);

  const stop = useCallback(() => {
    generationRef.current += 1;
    captureRef.current?.stop();
    captureRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    // Starting twice would strand the first recorder; stop it first so the
    // invariant "at most one capture" holds here too.
    if (captureRef.current) stop();

    const generation = generationRef.current;
    setStatus("requesting");

    const stream = await requestMicrophoneStream();

    if (generation !== generationRef.current) {
      // Stopped or unmounted while the permission prompt was open. Release
      // the mic immediately rather than starting a recorder nobody owns.
      if (stream) for (const track of stream.getTracks()) track.stop();
      return;
    }

    if (!stream) {
      setStatus("denied");
      return;
    }

    const capture = startMicrophoneCapture(stream, (chunk) => socket.sendAudioChunk(chunk));
    if (!capture) {
      setStatus("unsupported");
      return;
    }

    if (generation !== generationRef.current) {
      // Lost the race in the narrow window after the stream resolved.
      capture.stop();
      return;
    }

    captureRef.current = capture;
    setStatus("active");
  }, [socket, stop]);

  // The mic must never outlive the component that shows it is recording.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      captureRef.current?.stop();
      captureRef.current = null;
    };
  }, []);

  return { status, start, stop };
}
