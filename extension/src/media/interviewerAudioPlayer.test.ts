import { describe, expect, it, vi } from "vitest";
import {
  createInterviewerAudioPlayer,
  stopAllInterviewerAudioPlayback,
  type AudioBufferLike,
  type AudioContextLike,
  type AudioNodeLike,
  type AudioBufferSourceNodeLike,
  type GainNodeLike,
} from "./interviewerAudioPlayer";

class FakeAudioBuffer implements AudioBufferLike {
  private data: Float32Array;
  constructor(length: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeGainNode implements GainNodeLike {
  gain = { value: 1 };
  connect(): void {}
}

class FakeBufferSource implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  onended: (() => void) | null = null;
  started: number[] = [];
  stopped = false;
  connect(): void {}
  start(when?: number) {
    this.started.push(when ?? 0);
  }
  stop() {
    this.stopped = true;
  }
  /** Test helper: simulate the browser firing "ended" for this source. */
  finish() {
    this.onended?.();
  }
}

class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  destination: AudioNodeLike = { connect() {} };
  sources: FakeBufferSource[] = [];
  gains: FakeGainNode[] = [];
  closed = false;

  createGain(): GainNodeLike {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }

  createBuffer(_channels: number, length: number): AudioBufferLike {
    return new FakeAudioBuffer(length);
  }

  close(): void {
    this.closed = true;
  }
}

/** Builds a raw 16-bit signed little-endian PCM chunk of `sampleCount` silent samples. */
function pcmChunk(sampleCount: number): ArrayBuffer {
  const buffer = new ArrayBuffer(sampleCount * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < sampleCount; i += 1) view.setInt16(i * 2, 0, true);
  return buffer;
}

function setup() {
  const ctx = new FakeAudioContext();
  const onSpeakingChange = vi.fn();
  const player = createInterviewerAudioPlayer({
    onSpeakingChange,
    createAudioContext: () => ctx,
  });
  return { ctx, onSpeakingChange, player };
}

describe("createInterviewerAudioPlayer", () => {
  it("schedules consecutive chunks back-to-back with no gap or overlap", () => {
    const { ctx, player } = setup();
    player.handleStart("pcm_s16le_16000");

    player.handleChunk(pcmChunk(8000)); // 0.5s
    player.handleChunk(pcmChunk(4000)); // 0.25s

    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[0].started[0]).toBe(0);
    expect(ctx.sources[1].started[0]).toBe(0.5);
  });

  it("mutes by zeroing gain without breaking scheduling", () => {
    const { ctx, player } = setup();
    player.setMuted(true);
    player.handleStart("pcm_s16le_16000");
    player.handleChunk(pcmChunk(8000));

    expect(player.isMuted()).toBe(true);
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(ctx.sources[0].started).toEqual([0]); // still scheduled normally

    player.setMuted(false);
    expect(ctx.gains[0].gain.value).toBe(1);
  });

  it("stops a still-playing previous utterance cleanly when a new one starts", () => {
    const { ctx, player } = setup();
    player.handleStart("pcm_s16le_16000");
    player.handleChunk(pcmChunk(8000)); // schedules through t=0.5, never finishes

    ctx.currentTime = 2; // time passes; the first utterance is still "playing"
    player.handleStart("pcm_s16le_16000"); // interruption

    expect(ctx.sources[0].stopped).toBe(true);

    player.handleChunk(pcmChunk(1000));
    // nextStartTime was reset to currentTime, not left at the old 0.5 cursor.
    expect(ctx.sources[1].started[0]).toBe(2);
  });

  it("treats a start immediately followed by end with zero chunks as a silent no-op", () => {
    const { ctx, onSpeakingChange, player } = setup();

    expect(() => {
      player.handleStart("pcm_s16le_16000");
      player.handleEnd();
    }).not.toThrow();

    expect(ctx.sources).toHaveLength(0);
    expect(onSpeakingChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it("fires onSpeakingChange(false) only after every scheduled chunk of the utterance finishes", () => {
    const { ctx, onSpeakingChange, player } = setup();
    player.handleStart("pcm_s16le_16000");
    expect(onSpeakingChange).toHaveBeenLastCalledWith(true);

    player.handleChunk(pcmChunk(8000));
    player.handleChunk(pcmChunk(4000));
    player.handleEnd();

    // Two sources still scheduled/playing — must not report "done" yet.
    expect(onSpeakingChange).not.toHaveBeenCalledWith(false);

    ctx.sources[0].finish();
    expect(onSpeakingChange).not.toHaveBeenCalledWith(false); // one still active

    ctx.sources[1].finish();
    expect(onSpeakingChange).toHaveBeenLastCalledWith(false);
  });

  it("ignores chunks for an unsupported audio format instead of crashing", () => {
    const { ctx, player } = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    player.handleStart("mp3_44100");
    player.handleChunk(pcmChunk(8000));

    expect(ctx.sources).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores an empty chunk without scheduling a zero-length buffer", () => {
    const { ctx, player } = setup();
    player.handleStart("pcm_s16le_16000");

    player.handleChunk(new ArrayBuffer(0));

    expect(ctx.sources).toHaveLength(0);
  });

  it("dispose() stops active sources and closes the AudioContext", () => {
    const { ctx, player } = setup();
    player.handleStart("pcm_s16le_16000");
    player.handleChunk(pcmChunk(8000)); // still scheduled, never finishes

    player.dispose();

    expect(ctx.sources[0].stopped).toBe(true);
    expect(ctx.closed).toBe(true);
  });

  it("dispose() is a safe no-op when nothing was ever played", () => {
    const { player } = setup();
    expect(() => player.dispose()).not.toThrow();
  });

  it("creating a new player disposes the previous one (only one AudioContext at a time)", () => {
    const { ctx: firstCtx, player: firstPlayer } = setup();
    firstPlayer.handleStart("pcm_s16le_16000");
    firstPlayer.handleChunk(pcmChunk(8000));

    setup(); // constructing a second player, mirroring an SPA remount

    expect(firstCtx.sources[0].stopped).toBe(true);
    expect(firstCtx.closed).toBe(true);
  });

  it("stopAllInterviewerAudioPlayback() disposes the active player", () => {
    const { ctx, player } = setup();
    player.handleStart("pcm_s16le_16000");
    player.handleChunk(pcmChunk(8000));

    stopAllInterviewerAudioPlayback();

    expect(ctx.sources[0].stopped).toBe(true);
    expect(ctx.closed).toBe(true);
  });
});
