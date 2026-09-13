// Raw 16kHz mono PCM16 mic capture for the ElevenLabs Conversational AI
// spike (networking/convaiSocket.ts) — a different wire format from the
// product's real media/microphone.ts (WebM/Opus, for Deepgram), so this
// is its own module rather than a branch inside that one.
//
// Mirrors microphone.ts's safety invariants line for line — architecture.md
// §B.2 ("the microphone must record only between an explicit Start and
// Stop") is a privacy-critical rule, not specific to one pipeline: at most
// one capture at a time, an unconditional kill switch, idempotent stop.
//
// Uses a ScriptProcessorNode (deprecated but universally supported and
// synchronous) rather than an AudioWorklet module — the simplest correct
// choice for a throwaway spike; the real @elevenlabs/client SDK uses a
// worklet for lower latency, which isn't what this spike is measuring.

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096; // ~256ms per chunk at 16kHz
const ANALYSER_FFT_SIZE = 64;

export interface ConvaiMicrophoneCapture {
  stop(): void;
  analyser: AnalyserNode | null;
}

// Same module-level "at most one capture" registry as microphone.ts —
// see that file's guardrail comment for why this can't be left to callers.
let activeCapture: ConvaiMicrophoneCapture | null = null;

export function stopAllConvaiMicrophoneCapture(): void {
  activeCapture?.stop();
  activeCapture = null;
}

/** Never throws — permission denial/no hardware both resolve to null so
 * callers can degrade gracefully, same contract as microphone.ts's. */
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

/** Float32 samples in [-1, 1) -> 16-bit signed PCM, platform (little-endian) byte order. */
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return buffer;
}

/**
 * Starts raw PCM capture on an already-granted stream, calling onChunk with
 * a 16-bit PCM ArrayBuffer roughly every BUFFER_SIZE samples. Returns null
 * (releasing the stream) if a 16kHz AudioContext can't be created.
 */
export function startConvaiMicrophoneCapture(
  stream: MediaStream,
  onChunk: (chunk: ArrayBuffer) => void,
): ConvaiMicrophoneCapture | null {
  // Never run two captures at once — see microphone.ts's guardrail comment;
  // the same failure mode (a leaked recorder outliving the panel) applies here.
  stopAllConvaiMicrophoneCapture();

  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: SAMPLE_RATE });
  } catch {
    for (const track of stream.getTracks()) track.stop();
    return null;
  }

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) return; // guard mirrors microphone.ts's post-stop chunk suppression
    onChunk(floatTo16BitPCM(event.inputBuffer.getChannelData(0)));
  };

  // A ScriptProcessorNode only runs once connected to a destination, even
  // though nothing needs to be heard — route through a silent gain rather
  // than the real destination so the candidate never hears their own mic
  // looped back (same reasoning as microphone.ts's level-meter analyser tap).
  const silentGain = context.createGain();
  silentGain.gain.value = 0;
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  const analyser = context.createAnalyser();
  analyser.fftSize = ANALYSER_FFT_SIZE;
  source.connect(analyser); // tap only — never connected onward to destination

  const capture: ConvaiMicrophoneCapture = {
    analyser,
    stop() {
      if (stopped) return; // idempotent
      stopped = true;
      processor.disconnect();
      source.disconnect();
      analyser.disconnect();
      silentGain.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void context.close();
      if (activeCapture === capture) activeCapture = null;
    },
  };

  activeCapture = capture;
  return capture;
}
