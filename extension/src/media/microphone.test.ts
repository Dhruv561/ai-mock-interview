import { describe, expect, it, vi } from "vitest";
import {
  requestMicrophoneStream,
  startMicrophoneCapture,
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
