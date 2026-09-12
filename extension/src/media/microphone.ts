// Candidate audio capture (architecture.md §E, Feature 05). Chunks are
// handed to the caller as raw Blobs — sending them over the WS binary
// channel is the caller's job (media/useMicrophoneCapture.ts), keeping
// this module a pure browser-API wrapper. Real mic capture isn't reliably
// unit-testable (architecture.md §E's own testing strategy says so), but
// the chunking/permission-handling logic around it is, via the injectable
// factories below — same pattern as networking/websocket.ts's
// WebSocketFactory.

const CHUNK_INTERVAL_MS = 250;
const PREFERRED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm"];

export interface MicrophoneCapture {
  stop(): void;
}

// Module-level registry of the one capture allowed to exist at a time.
//
// GUARDRAIL (2026-09-13). The mic previously kept recording after the panel
// was torn down: content/index.tsx removed the React host from the DOM on
// SPA navigation without calling root.unmount(), so no component cleanup
// ran, the MediaRecorder outlived its owner, and audio kept streaming while
// the UI read "NOT STARTED" — observed live. Correctness here must not
// depend on every caller remembering to stop what it started, so this
// module enforces the invariant itself: starting a capture stops any
// previous one, and stopAllMicrophoneCapture() is an unconditional kill
// switch teardown paths can call without knowing what is running.
let activeCapture: MicrophoneCapture | null = null;

/**
 * Unconditionally stops any in-flight microphone capture and releases the
 * mic. Safe to call at any time, including when nothing is recording.
 * Teardown paths should call this rather than assuming a component's
 * cleanup ran.
 */
export function stopAllMicrophoneCapture(): void {
  activeCapture?.stop();
  activeCapture = null;
}

/** Test/diagnostic helper: is the microphone currently capturing? */
export function isMicrophoneCapturing(): boolean {
  return activeCapture !== null;
}

// Minimal structural subset of MediaRecorder this module needs.
export interface MediaRecorderLike {
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
}

export type MediaRecorderFactory = (stream: MediaStream, mimeType: string) => MediaRecorderLike;

const defaultRecorderFactory: MediaRecorderFactory = (stream, mimeType) =>
  new MediaRecorder(stream, { mimeType }) as unknown as MediaRecorderLike;

function pickSupportedMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return PREFERRED_MIME_TYPES.find((type) => isTypeSupported(type)) ?? null;
}

/**
 * Requests mic access. Never throws — permission denial, no hardware, and
 * an unsupported browser all resolve to null so callers can degrade
 * gracefully (architecture.md §E risk: the interview must still be usable
 * without a mic).
 */
export async function requestMicrophoneStream(
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream> = (c) =>
    navigator.mediaDevices.getUserMedia(c),
): Promise<MediaStream | null> {
  try {
    return await getUserMedia({ audio: true });
  } catch {
    return null;
  }
}

/**
 * Starts chunked recording on an already-granted stream, calling
 * onChunk roughly every CHUNK_INTERVAL_MS with a non-empty Blob. Returns
 * null (having released the stream) if no supported audio mime type is
 * available, or a stop function that halts recording and releases the mic.
 */
export function startMicrophoneCapture(
  stream: MediaStream,
  onChunk: (chunk: Blob) => void,
  createRecorder: MediaRecorderFactory = defaultRecorderFactory,
  isTypeSupported: (type: string) => boolean = MediaRecorder.isTypeSupported,
): MicrophoneCapture | null {
  // Never run two recorders at once: a leaked one would keep streaming with
  // nothing in the UI to indicate it.
  stopAllMicrophoneCapture();

  const mimeType = pickSupportedMimeType(isTypeSupported);
  if (!mimeType) {
    for (const track of stream.getTracks()) track.stop();
    return null;
  }

  const recorder = createRecorder(stream, mimeType);
  let stopped = false;
  recorder.ondataavailable = (event) => {
    // Guard the callback too: MediaRecorder can deliver a final buffered
    // chunk after stop(), and that must not reach the socket once the user
    // believes recording has ended.
    if (stopped) return;
    if (event.data.size > 0) onChunk(event.data);
  };
  recorder.start(CHUNK_INTERVAL_MS);

  const capture: MicrophoneCapture = {
    stop() {
      if (stopped) return; // idempotent
      stopped = true;
      recorder.stop();
      for (const track of stream.getTracks()) track.stop();
      if (activeCapture === capture) activeCapture = null;
    },
  };

  activeCapture = capture;
  return capture;
}
