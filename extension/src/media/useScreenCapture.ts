import { useCallback, useEffect, useRef, useState } from "react";
import type { InterviewSocket } from "../networking/websocket";
import { requestScreenStream, startScreenCapture, type ScreenCapture } from "./screen";

export type ScreenStatus = "idle" | "requesting" | "active" | "denied" | "unsupported";

/**
 * Ties screen/tab capture to a WS session (Feature 12), same shape as
 * media/useMicrophoneCapture.ts. Unlike mic audio, screen recording is
 * buffered locally rather than streamed live (see screen.ts's scope-
 * boundary comment) — so instead of forwarding chunks to the socket, this
 * hook just tells the backend *that* recording is happening, via the
 * screen.recording.started/stopped client events already defined in
 * shared/events.ts.
 *
 * Recording runs strictly between an explicit start() and stop(), and is
 * torn down on unmount — see microphone.ts for why that invariant is
 * enforced in two places rather than trusted to callers.
 */
export function useScreenCapture(socket: InterviewSocket) {
  const [status, setStatus] = useState<ScreenStatus>("idle");
  const captureRef = useRef<ScreenCapture | null>(null);
  // Same race guard as useMicrophoneCapture.ts: bumped by every stop() and
  // by unmount, so a start() whose permission prompt resolves after the
  // user already stopped/navigated away abandons its result instead of
  // starting a recorder nothing holds a reference to.
  const generationRef = useRef(0);

  const stop = useCallback(() => {
    generationRef.current += 1;
    const wasActive = captureRef.current !== null;
    captureRef.current?.stop();
    captureRef.current = null;
    setStatus("idle");
    // Only tell the backend recording stopped if it actually told the
    // backend recording started — avoids a meaningless "stopped" for a
    // denied/unsupported/never-started attempt.
    if (wasActive) socket.send({ type: "screen.recording.stopped" });
  }, [socket]);

  const start = useCallback(async () => {
    // Starting twice would strand the first recorder; stop it first so the
    // invariant "at most one capture" holds here too.
    if (captureRef.current) stop();

    const generation = generationRef.current;
    setStatus("requesting");

    const stream = await requestScreenStream();

    if (generation !== generationRef.current) {
      // Stopped or unmounted while the share picker was open. Release the
      // stream immediately rather than starting a recorder nobody owns.
      if (stream) for (const track of stream.getTracks()) track.stop();
      return;
    }

    if (!stream) {
      setStatus("denied");
      return;
    }

    // Chunks are buffered inside screen.ts, not forwarded anywhere here —
    // see screen.ts's scope-boundary comment. onStreamEnded routes the
    // browser's native "Stop sharing" UI back through this hook's own
    // stop() so status and the backend notification stay in sync without
    // polling the track.
    const capture = startScreenCapture(stream, () => {}, undefined, undefined, () => stop());
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
    socket.send({ type: "screen.recording.started" });
  }, [socket, stop]);

  // Screen recording must never outlive the component that shows it is
  // recording.
  useEffect(() => {
    return () => {
      generationRef.current += 1;
      captureRef.current?.stop();
      captureRef.current = null;
    };
  }, []);

  return { status, start, stop };
}
