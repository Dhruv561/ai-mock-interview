import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMicrophoneCapturing,
  requestMicrophoneStream,
  startMicrophoneCapture,
  stopAllMicrophoneCapture,
  type MediaRecorderLike,
} from "./microphone";

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
  it("starts the recorder on a 250ms timeslice", () => {
    let created: FakeMediaRecorder | null = null;
    const capture = startMicrophoneCapture(
      fakeStream(),
      () => {},
      () => (created = new FakeMediaRecorder()),
      () => true,
    );

    expect(capture).not.toBeNull();
    expect(created!.started).toEqual([250]);
  });

  it("forwards chunks via onChunk and drops empty ones", () => {
    const chunks: Blob[] = [];
    let recorder: FakeMediaRecorder | null = null;
    startMicrophoneCapture(
      fakeStream(),
      (chunk) => chunks.push(chunk),
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );

    recorder!.emit(new Blob(["data"]));
    recorder!.emit(new Blob([])); // empty — must not be forwarded

    expect(chunks).toHaveLength(1);
  });

  it("stops the recorder and releases every track on stop()", () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    let recorder: FakeMediaRecorder | null = null;

    const capture = startMicrophoneCapture(
      stream,
      () => {},
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );
    capture!.stop();

    expect(recorder!.stopped).toBe(true);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("returns null and releases the mic when no supported mime type exists", () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;

    const capture = startMicrophoneCapture(
      stream,
      () => {},
      () => new FakeMediaRecorder(),
      () => false,
    );

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
    let first: FakeMediaRecorder | undefined;
    let second: FakeMediaRecorder | undefined;

    startMicrophoneCapture(
      fakeStream(),
      () => {},
      () => (first = new FakeMediaRecorder()),
      () => true,
    );
    startMicrophoneCapture(
      fakeStream(),
      () => {},
      () => (second = new FakeMediaRecorder()),
      () => true,
    );

    expect(first!.stopped).toBe(true);
    expect(second!.stopped).toBe(false);
  });

  it("stopAllMicrophoneCapture() halts recording and releases the mic", () => {
    let recorder: FakeMediaRecorder | undefined;
    const stream = fakeStream();

    startMicrophoneCapture(
      stream,
      () => {},
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );
    expect(isMicrophoneCapturing()).toBe(true);

    stopAllMicrophoneCapture();

    expect(recorder!.stopped).toBe(true);
    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(isMicrophoneCapturing()).toBe(false);
  });

  it("does not forward a chunk delivered after stop()", () => {
    const chunks: Blob[] = [];
    let recorder: FakeMediaRecorder | undefined;

    const capture = startMicrophoneCapture(
      fakeStream(),
      (chunk) => chunks.push(chunk),
      () => (recorder = new FakeMediaRecorder()),
      () => true,
    );
    capture!.stop();

    // MediaRecorder can flush a final buffered chunk after stop(); it must
    // not reach the socket once the user believes recording has ended.
    recorder!.emit(new Blob(["late"]));

    expect(chunks).toHaveLength(0);
  });

  it("treats stop() as idempotent", () => {
    const capture = startMicrophoneCapture(
      fakeStream(),
      () => {},
      () => new FakeMediaRecorder(),
      () => true,
    );

    capture!.stop();
    expect(() => capture!.stop()).not.toThrow();
    expect(isMicrophoneCapturing()).toBe(false);
  });
});
