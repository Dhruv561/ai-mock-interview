// Screen/tab recording capture (architecture.md §F, Feature 12). Mirrors
// media/microphone.ts's shape and invariants deliberately — read that
// file's comments first; the reasoning for the injectable factories, the
// single-active-capture invariant, and idempotent stop() all carries over
// unchanged. This comment block only calls out where screen capture
// differs from mic capture.
//
// SCOPE BOUNDARY (Feature 12, 2026-09-13). Per TODO.md Phase 10 and
// architecture.md §F, screen recording is "local MediaRecorder, post-
// interview upload" — unlike mic audio (streamed live over the WS binary
// channel by useMicrophoneCapture.ts/networking/websocket.ts), there is no
// backend persistence endpoint for recordings yet. This module therefore
// only buffers chunks in-memory as an array of Blobs and exposes them as a
// single concatenated Blob via getRecordingBlob() — it does not send
// anything over the wire. Wiring that Blob to an actual upload belongs to
// the persistence work (Features 15/16), not here: building a live-upload
// path now, before that endpoint exists, would be exactly the kind of
// speculative infrastructure CLAUDE.md §2 says to avoid ("infrastructure
// that does not improve the demo").
//
// CLAUDE.md §6 also applies here directly: this recording is a secondary
// multimodal signal / demo artefact, never the source of truth for what
// code the candidate wrote — that comes from direct editor extraction
// (content script), not from OCR-ing this video.

const CHUNK_INTERVAL_MS = 1000; // coarser than mic's 250ms — buffered, not streamed live
const PREFERRED_MIME_TYPES = ["video/webm;codecs=vp9", "video/webm"];

export interface ScreenCapture {
  stop(): void;
  /**
   * Everything captured so far, concatenated into one Blob. Safe to call
   * before or after stop() — chunks live in this closure, not on the
   * (possibly already-stopped) MediaRecorder.
   */
  getRecordingBlob(): Blob;
}

// Module-level registry of the one capture allowed to exist at a time.
// Same guardrail as microphone.ts's activeCapture: correctness must not
// depend on every caller remembering to stop what it started.
let activeCapture: ScreenCapture | null = null;

/**
 * Unconditionally stops any in-flight screen capture and releases the
 * stream. Safe to call at any time, including when nothing is recording.
 */
export function stopAllScreenCapture(): void {
  activeCapture?.stop();
  activeCapture = null;
}

/** Test/diagnostic helper: is screen capture currently active? */
export function isScreenCapturing(): boolean {
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
 * Requests screen/tab sharing. Never throws — permission denial, the user
 * cancelling the browser's share picker, and an unsupported browser all
 * resolve to null so callers can degrade gracefully: screen recording is
 * optional/best-effort, and the interview must still proceed normally
 * without it (architecture.md §F risk, CLAUDE.md §6).
 */
export async function requestScreenStream(
  getDisplayMedia: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream> = (c) =>
    navigator.mediaDevices.getDisplayMedia(c),
): Promise<MediaStream | null> {
  try {
    return await getDisplayMedia({ video: true });
  } catch {
    return null;
  }
}

/**
 * Starts chunked recording on an already-granted stream, buffering each
 * non-empty chunk internally (see the scope-boundary comment above) and
 * also handing it to onChunk so callers can observe progress without
 * reaching into the capture. Returns null (having released the stream) if
 * no supported video mime type is available, or a capture handle that
 * halts recording and releases the stream on stop().
 *
 * onStreamEnded fires if the user stops sharing via the browser's own
 * "Stop sharing" UI rather than our End button — getDisplayMedia's video
 * track fires `onended` in that case, and this stops the capture itself
 * *and* invokes the callback so callers (useScreenCapture) can update
 * status without polling the track's state.
 */
export function startScreenCapture(
  stream: MediaStream,
  onChunk: (chunk: Blob) => void,
  createRecorder: MediaRecorderFactory = defaultRecorderFactory,
  isTypeSupported: (type: string) => boolean = MediaRecorder.isTypeSupported,
  onStreamEnded?: () => void,
): ScreenCapture | null {
  // Never run two recorders at once, same reasoning as microphone.ts.
  stopAllScreenCapture();

  const mimeType = pickSupportedMimeType(isTypeSupported);
  if (!mimeType) {
    for (const track of stream.getTracks()) track.stop();
    return null;
  }

  const chunks: Blob[] = [];
  const recorder = createRecorder(stream, mimeType);
  let stopped = false;

  recorder.ondataavailable = (event) => {
    // Guard the callback too: MediaRecorder can deliver a final buffered
    // chunk after stop() (see microphone.ts for the same guard).
    if (stopped) return;
    if (event.data.size > 0) {
      chunks.push(event.data);
      onChunk(event.data);
    }
  };
  recorder.start(CHUNK_INTERVAL_MS);

  const capture: ScreenCapture = {
    stop() {
      if (stopped) return; // idempotent
      stopped = true;
      recorder.stop();
      for (const track of stream.getTracks()) track.stop();
      if (activeCapture === capture) activeCapture = null;
    },
    getRecordingBlob() {
      return new Blob(chunks, { type: mimeType });
    },
  };

  // getDisplayMedia's track ends itself when the user stops sharing via the
  // browser's native UI — this is the only signal for that, there's no
  // event on the stream/recorder otherwise.
  for (const track of stream.getTracks()) {
    track.onended = () => {
      capture.stop();
      onStreamEnded?.();
    };
  }

  activeCapture = capture;
  return capture;
}
