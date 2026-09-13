/**
 * Microphone capture for Gemini Live (spike) — captures 16kHz mono PCM16 audio.
 *
 * Mirrors microphone.ts's safety invariants:
 * - Module-level "only one capture at a time" registry
 * - Unconditional stopAll kill switch
 * - Idempotent stop
 * - Mic never routed to destination to avoid feedback
 * - Passive analyser tap for level meter
 *
 * Uses a ScriptProcessorNode (deprecated but stable) at 16kHz fixed rate, same
 * as the existing precedent in this codebase for another provider.
 */

const SAMPLE_RATE = 16000;

// Module-level registry: only one active capture at a time
let activeCapture: GeminiLiveMicrophoneCapture | null = null;

export class GeminiLiveMicrophoneCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isCapturing = false;
  private onAudioChunk: ((chunk: Int16Array) => void) | null = null;

  async start(onAudioChunk: (chunk: Int16Array) => void): Promise<"active" | "denied" | "unsupported"> {
    if (this.isCapturing) return "active";
    if (activeCapture && activeCapture !== this) return "active"; // Another capture is active

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const err = error as DOMException;
      if (err.name === "NotAllowedError") return "denied";
      if (err.name === "NotFoundError" || err.name === "NotSupportedError") return "unsupported";
      return "denied";
    }

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;

      // Analyser is a tap only — the mic audio path never reaches destination
      // (no feedback risk). Script processor is the sole consumer.
      source.connect(this.analyser);

      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(this.scriptProcessor);

      this.scriptProcessor.addEventListener("audioprocess", (event: AudioProcessingEvent) => {
        const float32Data = event.inputBuffer.getChannelData(0);
        const int16Data = float32ToInt16(float32Data);
        this.onAudioChunk?.(int16Data);
      });

      this.onAudioChunk = onAudioChunk;
      this.isCapturing = true;
      activeCapture = this;

      return "active";
    } catch (error) {
      this.cleanup();
      return "unsupported";
    }
  }

  stop(): void {
    if (!this.isCapturing) return;

    this.scriptProcessor?.disconnect();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.audioContext?.close();

    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.analyser = null;
    this.isCapturing = false;
    this.onAudioChunk = null;

    if (activeCapture === this) activeCapture = null;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private cleanup(): void {
    this.scriptProcessor?.disconnect();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.analyser = null;
    this.onAudioChunk = null;
    if (activeCapture === this) activeCapture = null;
  }
}

/** Kill-switch: stop all active captures unconditionally. */
export function stopAllGeminiLiveMicrophoneCapture(): void {
  activeCapture?.stop();
  activeCapture = null;
}

/** Convert Float32 audio (Web Audio native) to Int16 (PCM16, what Gemini Live expects). */
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    // Clamp to [-1, 1], scale to [-32768, 32767], round
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}
