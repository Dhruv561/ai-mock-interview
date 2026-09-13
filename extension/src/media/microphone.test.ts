import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMicrophoneCapturing,
  requestMicrophoneStream,
  startMicrophoneCapture,
  stopAllMicrophoneCapture,
  type AudioProcessorLike,
  type BuiltAudioProcessor,
} from "./microphone";

type AudioProcessEvent = Parameters<NonNullable<AudioProcessorLike["onaudioprocess"]>>[0];

class FakeProcessor implements AudioProcessorLike {
  onaudioprocess: AudioProcessorLike["onaudioprocess"] = null;
  disconnect = vi.fn();

  emit(samples: Float32Array, sampleRate = 16000) {
    const event: AudioProcessEvent = {
      inputBuffer: { getChannelData: () => samples, sampleRate },
    };
    this.onaudioprocess?.(event);
  }
}

function fakeBuiltProcessor(): { built: BuiltAudioProcessor; processor: FakeProcessor; cleanup: ReturnType<typeof vi.fn> } {
  const processor = new FakeProcessor();
  const cleanup = vi.fn();
  return { built: { processor, cleanup }, processor, cleanup };
}

// A full chunk is CHUNK_SAMPLE_COUNT (4000) samples at the 16kHz target
// rate — feeding exactly that many samples at sampleRate=16000 (no
// resampling) triggers exactly one onChunk call.
const FULL_CHUNK = new Float32Array(4000).fill(0.5);

function fakeStream() {
  const tracks: Array<{ stop: () => void; stopped: boolean }> = [
    { stop: vi.fn(), stopped: false },
  ];
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe("requestMicrophoneStream", () => {
  it("resolves the stream on success", async () => {
    const stream = fakeStream();
    const result = await requestMicrophoneStream(async () => stream);
    expect(result).toBe(stream);
  });

  it("resolves null instead of throwing when getUserMedia rejects", async () => {
    const result = await requestMicrophoneStream(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });
    expect(result).toBeNull();
  });
});

describe("startMicrophoneCapture", () => {
  it("forwards a PCM chunk once enough samples have accumulated", () => {
    const chunks: Blob[] = [];
    const { built, processor } = fakeBuiltProcessor();

    startMicrophoneCapture(fakeStream(), (chunk) => chunks.push(chunk), () => built);
    processor.emit(FULL_CHUNK);

    expect(chunks).toHaveLength(1);
    // 4000 samples * 2 bytes (Int16) = 8000 bytes.
    expect(chunks[0].size).toBe(8000);
  });

  it("does not forward a chunk before enough samples have accumulated", () => {
    const chunks: Blob[] = [];
    const { built, processor } = fakeBuiltProcessor();

    startMicrophoneCapture(fakeStream(), (chunk) => chunks.push(chunk), () => built);
    processor.emit(new Float32Array(1000).fill(0.1)); // well under one chunk's worth

    expect(chunks).toHaveLength(0);
  });

  it("carries a partial remainder over into the next chunk", () => {
    const chunks: Blob[] = [];
    const { built, processor } = fakeBuiltProcessor();

    startMicrophoneCapture(fakeStream(), (chunk) => chunks.push(chunk), () => built);
    processor.emit(new Float32Array(3000).fill(0.1));
    expect(chunks).toHaveLength(0);
    processor.emit(new Float32Array(3000).fill(0.1)); // 3000 + 3000 = one chunk, 2000 left over

    expect(chunks).toHaveLength(1);
  });

  it("stops the processor and releases every track on stop()", () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const { built, cleanup } = fakeBuiltProcessor();

    const capture = startMicrophoneCapture(stream, () => {}, () => built);
    capture!.stop();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("returns null and releases the mic when Web Audio is unavailable", () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;

    const capture = startMicrophoneCapture(stream, () => {}, () => null);

    expect(capture).toBeNull();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});

// Regression guards for the 2026-09-13 privacy bug: the mic kept recording
// and streaming after the panel was torn down, while the UI read
// "NOT STARTED". Recording must run strictly between an explicit start and
// stop, and must never be left running by any path.
describe("microphone capture lifecycle guarantees", () => {
  afterEach(() => stopAllMicrophoneCapture());

  it("stops a previous capture when a new one starts", () => {
    const first = fakeBuiltProcessor();
    const second = fakeBuiltProcessor();

    startMicrophoneCapture(fakeStream(), () => {}, () => first.built);
    startMicrophoneCapture(fakeStream(), () => {}, () => second.built);

    expect(first.cleanup).toHaveBeenCalledOnce();
    expect(second.cleanup).not.toHaveBeenCalled();
  });

  it("stopAllMicrophoneCapture() halts recording and releases the mic", () => {
    const { built, cleanup } = fakeBuiltProcessor();
    const stream = fakeStream();

    startMicrophoneCapture(stream, () => {}, () => built);
    expect(isMicrophoneCapturing()).toBe(true);

    stopAllMicrophoneCapture();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(isMicrophoneCapturing()).toBe(false);
  });

  it("does not forward a chunk delivered after stop()", () => {
    const chunks: Blob[] = [];
    const { built, processor } = fakeBuiltProcessor();

    const capture = startMicrophoneCapture(fakeStream(), (chunk) => chunks.push(chunk), () => built);
    capture!.stop();
    processor.emit(FULL_CHUNK); // onaudioprocess was nulled out by stop()

    expect(chunks).toHaveLength(0);
  });

  it("ignores a processing event already in flight when stop() was called", () => {
    const chunks: Blob[] = [];
    const { built, processor } = fakeBuiltProcessor();

    const capture = startMicrophoneCapture(fakeStream(), (chunk) => chunks.push(chunk), () => built);
    // Captured before stop() nulls processor.onaudioprocess, simulating a
    // callback that had already begun before stop() ran — the closure's own
    // `stopped` flag, not the null-out, is what must block this.
    const inFlightHandler = processor.onaudioprocess;
    capture!.stop();
    inFlightHandler?.({ inputBuffer: { getChannelData: () => FULL_CHUNK, sampleRate: 16000 } });

    expect(chunks).toHaveLength(0);
  });

  it("treats stop() as idempotent", () => {
    const { built } = fakeBuiltProcessor();
    const capture = startMicrophoneCapture(fakeStream(), () => {}, () => built);

    capture!.stop();
    expect(() => capture!.stop()).not.toThrow();
    expect(isMicrophoneCapturing()).toBe(false);
  });
});
