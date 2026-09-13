// Plays interviewer TTS audio (architecture.md §M, Feature 10) as raw PCM
// chunks arrive over the WebSocket — not waiting for the full clip, per
// architecture.md §M's "played via Web Audio API as chunks arrive"
// requirement. Framework-agnostic and independent of the WS transport (same
// separation as media/microphone.ts), with an injectable AudioContext
// factory so it's unit-testable: jsdom has no real Web Audio API, so tests
// inject a fake (see interviewerAudioPlayer.test.ts).

const SAMPLE_RATE = 16000;
const SUPPORTED_FORMAT = "pcm_s16le_16000";
const BYTES_PER_SAMPLE = 2;

// Minimal structural subset of the Web Audio API this module needs — same
// "believable structural subset" approach as networking/websocket.ts's
// WebSocketLike.
export interface AudioParamLike {
  value: number;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
}

export type AudioContextFactory = () => AudioContextLike;

const defaultAudioContextFactory: AudioContextFactory = () =>
  new AudioContext() as unknown as AudioContextLike;

export interface InterviewerAudioPlayer {
  handleStart(format: string): void;
  handleChunk(chunk: ArrayBuffer): void;
  handleEnd(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export interface InterviewerAudioPlayerOptions {
  onSpeakingChange?: (isSpeaking: boolean) => void;
  createAudioContext?: AudioContextFactory;
}

/** 16-bit signed little-endian PCM -> Float32 samples in [-1, 1). */
function decodePcm16le(chunk: ArrayBuffer): Float32Array {
  const sampleCount = Math.floor(chunk.byteLength / BYTES_PER_SAMPLE);
  const view = new DataView(chunk);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = view.getInt16(i * BYTES_PER_SAMPLE, true) / 32768;
  }
  return samples;
}

export function createInterviewerAudioPlayer(
  options: InterviewerAudioPlayerOptions = {},
): InterviewerAudioPlayer {
  const onSpeakingChange = options.onSpeakingChange ?? (() => {});
  const createAudioContext = options.createAudioContext ?? defaultAudioContextFactory;

  let audioContext: AudioContextLike | null = null;
  let gainNode: GainNodeLike | null = null;
  let muted = false;
  let nextStartTime = 0;
  const activeSources = new Set<AudioBufferSourceNodeLike>();
  let formatOk = false;
  let utteranceEnded = false;
  let speaking = false;

  function ensureContext(): { ctx: AudioContextLike; gain: GainNodeLike } {
    if (!audioContext || !gainNode) {
      audioContext = createAudioContext();
      gainNode = audioContext.createGain();
      gainNode.gain.value = muted ? 0 : 1;
      gainNode.connect(audioContext.destination);
    }
    return { ctx: audioContext, gain: gainNode };
  }

  function setSpeaking(next: boolean) {
    if (speaking === next) return;
    speaking = next;
    onSpeakingChange(next);
  }

  // Stops everything still scheduled for the previous utterance so a new
  // one never overlaps it (architecture.md §M risk: "playback interruption
  // ... should stop playback cleanly").
  function stopActiveSources() {
    for (const source of activeSources) {
      // Detach onended first: stop() fires "ended" just like natural
      // completion would, and that must not be mistaken for the *new*
      // utterance finishing.
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already stopped/finished — nothing to clean up.
      }
    }
    activeSources.clear();
  }

  return {
    handleStart(format) {
      stopActiveSources();
      const { ctx } = ensureContext();
      nextStartTime = ctx.currentTime;
      formatOk = format === SUPPORTED_FORMAT;
      utteranceEnded = false;
      if (!formatOk) {
        console.warn(
          `interviewerAudioPlayer: unsupported audio format "${format}", ignoring chunks`,
        );
      }
      setSpeaking(true);
    },

    handleChunk(chunk) {
      if (!formatOk) return;
      const samples = decodePcm16le(chunk);
      if (samples.length === 0) return;

      const { ctx, gain } = ensureContext();
      const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);

      // Schedule back-to-back with no gap/overlap: never earlier than "now"
      // (a chunk arriving late shouldn't try to play in the past) and never
      // earlier than the previous chunk's scheduled end.
      const startAt = Math.max(ctx.currentTime, nextStartTime);
      const durationSeconds = samples.length / SAMPLE_RATE;
      nextStartTime = startAt + durationSeconds;

      activeSources.add(source);
      source.onended = () => {
        activeSources.delete(source);
        if (utteranceEnded && activeSources.size === 0) setSpeaking(false);
      };
      source.start(startAt);
    },

    handleEnd() {
      utteranceEnded = true;
      // Zero chunks between start and end (silence, e.g. the mock TTS
      // provider or a failed real one) is a normal, silent no-op — nothing
      // is scheduled, so there is nothing to wait on.
      if (activeSources.size === 0) setSpeaking(false);
    },

    setMuted(next) {
      muted = next;
      // Gain to 0 rather than stopping/unscheduling sources: keeps the
      // nextStartTime timing untouched and avoids an audible click.
      if (gainNode) gainNode.gain.value = muted ? 0 : 1;
    },

    isMuted() {
      return muted;
    },
  };
}
