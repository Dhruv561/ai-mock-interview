import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isScreenCapturing,
  requestScreenStream,
  startScreenCapture,
  stopAllScreenCapture,
  type MediaRecorderLike,
} from "./screen";

class FakeMediaRecorder implements MediaRecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  started: number[] = [];
  stopped = false;

  start(timeslice?: number) {
    this.started.push(timeslice ?? -1);
  }

  stop() {
    this.stopped = true;
  }

  emit(data: Blob) {
    this.ondataavailable?.({ data });
  }
}

interface FakeTrack {
  stop: () => void;
  stopped: boolean;
  onended: (() => void) | null;
}

function fakeTrack(): FakeTrack {
  return { stop: vi.fn(), stopped: false, onended: null };
}

function fakeStream(tracks: FakeTrack[] = [fakeTrack()]) {
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

describe("requestScreenStream", () => {
  it("resolves the stream on success", async () => {
    const stream = fakeStream();
    const result = await requestScreenStream(async () => stream);
    expect(result).toBe(stream);
  });

  it("resolves null instead of throwing when getDisplayMedia rejects (denied or cancelled)", async () => {
    const result = await requestScreenStream(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });
    expect(result).toBeNull();
  });
});

describe("startScreenCapture", () => {
  it("starts the recorder on a 1000ms timeslice", () => {
    let created: FakeMediaRecorder | null = null;
    const capture = startScreenCapture(
      fakeStream(),
      () => {},
      () => (created = new FakeMediaRecorder()),
      () => true,
    );

    expect(capture).not.toBeNull();
    expect(created!.started).toEqual([1000]);
  });

  it("forwards chunks via onChunk and drops empty ones", () => {
    const chunks: Blob[] = [];
    let recorder: FakeMediaRecorder | null = null;
    startScreenCapture(
      fakeStream(),
      (chunk) => chunks.push(chunk),
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );

    recorder!.emit(new Blob(["data"]));
    recorder!.emit(new Blob([])); // empty — must not be forwarded

    expect(chunks).toHaveLength(1);
  });

  it("buffers chunks and exposes them as one concatenated Blob via getRecordingBlob()", () => {
    let recorder: FakeMediaRecorder | null = null;
    const capture = startScreenCapture(
      fakeStream(),
      () => {},
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );

    recorder!.emit(new Blob(["a"]));
    recorder!.emit(new Blob(["b"]));

    const blob = capture!.getRecordingBlob();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("stops the recorder and releases every track on stop()", () => {
    const track = fakeTrack();
    const stream = fakeStream([track]);
    let recorder: FakeMediaRecorder | null = null;

    const capture = startScreenCapture(
      stream,
      () => {},
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );
    capture!.stop();

    expect(recorder!.stopped).toBe(true);
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("returns null and releases the stream when no supported mime type exists", () => {
    const track = fakeTrack();
    const stream = fakeStream([track]);

    const capture = startScreenCapture(
      stream,
      () => {},
      () => new FakeMediaRecorder(),
      () => false,
    );

    expect(capture).toBeNull();
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("calls stop() and onStreamEnded when the browser's native Stop sharing UI ends the track", () => {
    const track = fakeTrack();
    const stream = fakeStream([track]);
    let recorder: FakeMediaRecorder | null = null;
    const onStreamEnded = vi.fn();

    startScreenCapture(
      stream,
      () => {},
      () => (recorder = new FakeMediaRecorder()),
      () => true,
      onStreamEnded,
    );

    track.onended?.();

    expect(recorder!.stopped).toBe(true);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(onStreamEnded).toHaveBeenCalledOnce();
  });
});

// Regression-style guards mirroring microphone.test.ts's lifecycle
// guarantees: recording must run strictly between an explicit start and
// stop, and must never be left running by any path.
describe("screen capture lifecycle guarantees", () => {
  afterEach(() => stopAllScreenCapture());

  it("stops a previous capture when a new one starts", () => {
    let first: FakeMediaRecorder | undefined;
    let second: FakeMediaRecorder | undefined;

    startScreenCapture(
      fakeStream(),
      () => {},
      () => (first = new FakeMediaRecorder()),
      () => true,
    );
    startScreenCapture(
      fakeStream(),
      () => {},
      () => (second = new FakeMediaRecorder()),
      () => true,
    );

    expect(first!.stopped).toBe(true);
    expect(second!.stopped).toBe(false);
  });

  it("stopAllScreenCapture() halts recording and releases the stream", () => {
    let recorder: FakeMediaRecorder | undefined;
    const track = fakeTrack();
    const stream = fakeStream([track]);

    startScreenCapture(
      stream,
      () => {},
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );
    expect(isScreenCapturing()).toBe(true);

    stopAllScreenCapture();

    expect(recorder!.stopped).toBe(true);
    expect(track.stop).toHaveBeenCalled();
    expect(isScreenCapturing()).toBe(false);
  });

  it("does not forward a chunk delivered after stop()", () => {
    const chunks: Blob[] = [];
    let recorder: FakeMediaRecorder | undefined;

    const capture = startScreenCapture(
      fakeStream(),
      (chunk) => chunks.push(chunk),
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );
    capture!.stop();

    // MediaRecorder can flush a final buffered chunk after stop(); it must
    // not be forwarded once the user believes recording has ended.
    recorder!.emit(new Blob(["late"]));

    expect(chunks).toHaveLength(0);
  });

  it("treats stop() as idempotent", () => {
    const capture = startScreenCapture(
      fakeStream(),
      () => {},
      () => new FakeMediaRecorder(),
      () => true,
    );

    capture!.stop();
    expect(() => capture!.stop()).not.toThrow();
    expect(isScreenCapturing()).toBe(false);
  });
});
