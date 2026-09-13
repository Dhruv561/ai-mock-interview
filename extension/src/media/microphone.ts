// Candidate audio capture (architecture.md §E, Feature 05).
//
// Produces raw PCM16 mono 16kHz chunks (as Blobs, same external shape as
// before) rather than MediaRecorder/WebM-Opus. Changed 2026-09-13 when the
// default STT provider moved from Deepgram to ElevenLabs
// (FEATURE_PROGRESS.md Feature 05's dated update): ElevenLabs' realtime STT
// websocket has no container-autodetection mode at all — it only accepts
// raw PCM/µ-law samples — so every provider now gets the same raw-PCM wire
// format (Deepgram's query string was updated to match rather than rely on
// WebM autodetection).
//
// Built on a ScriptProcessorNode rather than an AudioWorklet. AudioWorklet
// would be the modern choice, but its addModule() call is a fetch-like
// resource load made from the content script's page-context world, and
// architecture.md §B.1 already found (the hard way, for the WebSocket
// itself) that leetcode.com's CSP silently kills exactly that class of
// content-script network activity. ScriptProcessorNode needs no such
// fetch, so it doesn't risk repeating that failure. It is deprecated but
// still implemented everywhere Chrome runs; migrating to AudioWorklet via
// an extension-owned offscreen document (which isn't subject to the page's
// CSP) is a reasonable future improvement, not done here to keep this
// slice's diff contained.
//
// Real mic capture isn't reliably unit-testable (architecture.md §E's own
// testing strategy says so), but the chunking/lifecycle logic around it is,
// via the injectable AudioProcessorFactory below — same pattern as
// networking/websocket.ts's WebSocketFactory.

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_INTERVAL_MS = 250;
const CHUNK_SAMPLE_COUNT = (TARGET_SAMPLE_RATE * CHUNK_INTERVAL_MS) / 1000; // 4000 samples = 8000 bytes
const PROCESSOR_BUFFER_SIZE = 4096; // ScriptProcessorNode's fixed per-callback buffer size
const ANALYSER_FFT_SIZE = 64;

export interface MicrophoneCapture {
  stop(): void;
  // Live level-meter tap on the raw mic stream (the AudioLevelMeter "we're
  // recording" bars) — null in any environment without Web Audio (jsdom in
  // tests, or a browser missing it), which the level meter treats as "show
  // nothing" rather than an error. Deliberately not wired to any
  // destination: it only reads from the stream, never plays it back.
  analyser: AnalyserNode | null;
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

// Minimal structural subset of an audio-processing node this module needs —
// same shape as ScriptProcessorNode's relevant bits, injectable for testing
// since jsdom has no real Web Audio API.
export interface AudioProcessorLike {
  onaudioprocess:
    | ((event: { inputBuffer: { getChannelData(channel: number): Float32Array; sampleRate: number } }) => void)
    | null;
  disconnect(): void;
}

export interface BuiltAudioProcessor {
  processor: AudioProcessorLike;
  cleanup: () => void;
}

// Returns null when Web Audio is unavailable in this environment/browser —
// the "unsupported" case startMicrophoneCapture degrades to, mirroring how
// the old MediaRecorder path handled no-supported-mime-type.
export type AudioProcessorFactory = (stream: MediaStream) => BuiltAudioProcessor | null;

const defaultAudioProcessorFactory: AudioProcessorFactory = (stream) => {
  const AudioContextCtor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;

  try {
    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
    // A ScriptProcessorNode only fires onaudioprocess while it's part of an
    // active graph reaching the destination. Routed through a zero-gain
    // node so the candidate never hears their own mic played back.
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    return {
      processor: processor as unknown as AudioProcessorLike,
      cleanup: () => {
        processor.disconnect();
        source.disconnect();
        silentGain.disconnect();
        void context.close();
      },
    };
  } catch {
    return null;
  }
};

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

// Nearest-neighbour decimation from the browser's native sample rate
// (typically 48000Hz) down to the 16000Hz both STT providers now expect.
// Not a proper anti-aliased resample — acceptable for speech-band input on
// a hackathon timeline; a low-pass filter ahead of decimation is a
// documented follow-up if transcription quality suffers in practice.
function downsampleTo16k(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return floatTo16BitPCM(input);
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) out[i] = input[Math.floor(i * ratio)];
  return floatTo16BitPCM(out);
}

function mergeInt16(chunks: Int16Array[], totalLength: number): Int16Array {
  if (chunks.length === 1) return chunks[0];
  const merged = new Int16Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
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
 * Starts chunked PCM16/16kHz capture on an already-granted stream, calling
 * onChunk roughly every CHUNK_INTERVAL_MS with one ~8000-byte Blob. Returns
 * null (having released the stream) if Web Audio isn't available in this
 * environment, or a stop function that halts recording and releases the mic.
 */
export function startMicrophoneCapture(
  stream: MediaStream,
  onChunk: (chunk: Blob) => void,
  createProcessor: AudioProcessorFactory = defaultAudioProcessorFactory,
): MicrophoneCapture | null {
  // Never run two captures at once: a leaked one would keep streaming with
  // nothing in the UI to indicate it.
  stopAllMicrophoneCapture();

  const built = createProcessor(stream);
  if (!built) {
    for (const track of stream.getTracks()) track.stop();
    return null;
  }
  const { processor, cleanup } = built;

  let stopped = false;
  let pending: Int16Array[] = [];
  let pendingLength = 0;

  processor.onaudioprocess = (event) => {
    // Guard the callback too: an in-flight callback can fire after stop()
    // requests teardown; it must not reach the socket once the user
    // believes recording has ended.
    if (stopped) return;

    const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), event.inputBuffer.sampleRate);
    pending.push(pcm);
    pendingLength += pcm.length;

    while (pendingLength >= CHUNK_SAMPLE_COUNT) {
      const merged = mergeInt16(pending, pendingLength);
      const outgoing = merged.subarray(0, CHUNK_SAMPLE_COUNT);
      const rest = merged.subarray(CHUNK_SAMPLE_COUNT);
      pending = rest.length > 0 ? [rest] : [];
      pendingLength = rest.length;
      // .slice() copies into a fresh, non-shared ArrayBuffer — TS's BlobPart
      // type rejects a view over ArrayBufferLike (it could in principle be
      // a SharedArrayBuffer), even though this one never is.
      onChunk(new Blob([outgoing.slice()]));
    }
  };

  const { analyser, close: closeAnalyser } = createLevelAnalyser(stream);

  const capture: MicrophoneCapture = {
    analyser,
    stop() {
      if (stopped) return; // idempotent
      stopped = true;
      processor.onaudioprocess = null;
      cleanup();
      for (const track of stream.getTracks()) track.stop();
      closeAnalyser();
      if (activeCapture === capture) activeCapture = null;
    },
  };

  activeCapture = capture;
  return capture;
}

/**
 * Best-effort AnalyserNode tap on a mic stream, for the level meter only.
 * Never throws: jsdom (tests) and any browser without Web Audio simply get
 * no analyser, same "degrade gracefully rather than break the interview"
 * stance as requestMicrophoneStream's permission handling.
 *
 * Kept as its own AudioContext rather than folded into
 * defaultAudioProcessorFactory's graph — a second context per capture is a
 * little wasteful, but keeps this already-working, already-tested tap
 * isolated from the new PCM-encoding graph rather than entangling both in
 * one change.
 */
function createLevelAnalyser(stream: MediaStream): {
  analyser: AnalyserNode | null;
  close: () => void;
} {
  try {
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    source.connect(analyser); // tap only — never connected onward to
    // context.destination, so this must not (and does not) cause the
    // candidate to hear their own mic played back.
    return { analyser, close: () => void context.close() };
  } catch {
    return { analyser: null, close: () => {} };
  }
}
