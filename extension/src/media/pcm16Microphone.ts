/**
 * PCM16 microphone capture at 24kHz (OpenAI Realtime API format).
 *
 * Per microphone.ts's privacy-critical invariants (architecture.md §B.2):
 * - Module-level "only one capture at a time" registry
 * - Unconditional `stopAllMicrophoneCapture()` kill switch
 * - Idempotent stop with post-stop chunk suppression
 * - Mic never routed to `destination` to avoid feedback
 *
 * This module captures raw PCM16 audio at 24kHz and delivers it as
 * Uint8Array chunks (little-endian signed 16-bit samples).
 */

let activeCapture: PCM16MicrophoneCapture | null = null;

interface MicrophoneCaptureOptions {
  onChunk: (chunk: Uint8Array) => void;
  onError?: (error: Error) => void;
}

class PCM16MicrophoneCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stopped = false;

  constructor(
    private options: MicrophoneCaptureOptions,
  ) {}

  async start(): Promise<boolean> {
    // Prevent multiple concurrent captures.
    if (activeCapture && activeCapture !== this) {
      return false;
    }
    // Module-level registry for privacy-critical single-capture invariant (architecture.md §B.2)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    activeCapture = this;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      });

      // Use webkit fallback for Safari compatibility
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioContextType = (window as any).webkitAudioContext || window.AudioContext;
      this.audioContext = new AudioContextType({
        sampleRate: 24000,
      });

      // Create a ScriptProcessorNode to capture raw audio.
      // 24kHz @ 4096 samples = ~170ms per chunk.
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.processor);

      this.processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (this.stopped) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const output = this.pcm16Encode(inputData);
        this.options.onChunk(output);
      };

      // Connect to a dummy destination to keep the audio graph running.
      // Use the AudioContext's destination, not a speakers destination,
      // to avoid audio feedback per architecture.md §B.2.
      this.processor.connect(this.audioContext.destination);

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(err);
      this.cleanup();
      return false;
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.cleanup();
  }

  private cleanup(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== "closed") {
        this.audioContext.close();
      }
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (activeCapture === this) {
      activeCapture = null;
    }
  }

  private pcm16Encode(float32Array: Float32Array): Uint8Array {
    /**
     * Convert float32 samples [-1, 1] to PCM16 (int16 [-32768, 32767]).
     * Interleave into Uint8Array as little-endian.
     */
    const bufferLength = float32Array.length;
    const output = new Uint8Array(bufferLength * 2);
    let offset = 0;

    for (let i = 0; i < bufferLength; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      const s16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      const int16 = Math.floor(s16);

      // Write as little-endian.
      output[offset] = int16 & 0xff;
      output[offset + 1] = (int16 >> 8) & 0xff;
      offset += 2;
    }

    return output;
  }
}

export async function startPCM16MicrophoneCapture(
  onChunk: (chunk: Uint8Array) => void,
  onError?: (error: Error) => void,
): Promise<PCM16MicrophoneCapture | null> {
  /**
   * Start a new PCM16 microphone capture at 24kHz.
   * Returns null if a capture is already active.
   */
  if (activeCapture) {
    return null;
  }

  const capture = new PCM16MicrophoneCapture({ onChunk, onError });
  const success = await capture.start();
  return success ? capture : null;
}

export function stopAllPCM16MicrophoneCapture(): void {
  /**
   * Kill-switch: stop all active captures immediately.
   * Privacy critical (architecture.md §B.2) — may be called at any point
   * to ensure the mic stops recording (e.g., on panel teardown).
   */
  activeCapture?.stop();
}
