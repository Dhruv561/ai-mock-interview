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
  const mimeType = pickSupportedMimeType(isTypeSupported);
  if (!mimeType) {
    for (const track of stream.getTracks()) track.stop();
    return null;
  }

  const recorder = createRecorder(stream, mimeType);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) onChunk(event.data);
  };
  recorder.start(CHUNK_INTERVAL_MS);

  return {
    stop() {
      recorder.stop();
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
