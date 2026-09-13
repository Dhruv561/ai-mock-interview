import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewSocket } from "../networking/websocket";
import * as screen from "./screen";
import { useScreenCapture } from "./useScreenCapture";

vi.mock("./screen");

function fakeSocket(): InterviewSocket {
  return {
    send: vi.fn(),
    sendAudioChunk: vi.fn(),
    onEvent: vi.fn(() => () => {}),
    onAudioChunk: vi.fn(() => () => {}),
    onStateChange: vi.fn(() => () => {}),
    close: vi.fn(),
  };
}

describe("useScreenCapture", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle", () => {
    const { result } = renderHook(() => useScreenCapture(fakeSocket()));
    expect(result.current.status).toBe("idle");
  });

  it("goes to denied when permission is refused", async () => {
    vi.mocked(screen.requestScreenStream).mockResolvedValue(null);
    const socket = fakeSocket();
    const { result } = renderHook(() => useScreenCapture(socket));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("denied");
    expect(socket.send).not.toHaveBeenCalled();
  });

  it("goes active and sends screen.recording.started once capture succeeds", async () => {
    const socket = fakeSocket();
    vi.mocked(screen.requestScreenStream).mockResolvedValue({} as MediaStream);
    vi.mocked(screen.startScreenCapture).mockImplementation(() => ({
      stop: vi.fn(),
      getRecordingBlob: () => new Blob(),
    }));

    const { result } = renderHook(() => useScreenCapture(socket));
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("active");
    expect(socket.send).toHaveBeenCalledWith({ type: "screen.recording.started" });
  });

  it("goes to unsupported (not a thrown error) when no mime type is available", async () => {
    vi.mocked(screen.requestScreenStream).mockResolvedValue({} as MediaStream);
    vi.mocked(screen.startScreenCapture).mockReturnValue(null);
    const socket = fakeSocket();
    const { result } = renderHook(() => useScreenCapture(socket));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("unsupported");
    expect(socket.send).not.toHaveBeenCalled();
  });

  it("stop() releases the capture, resets to idle, and sends screen.recording.stopped", async () => {
    const stop = vi.fn();
    const socket = fakeSocket();
    vi.mocked(screen.requestScreenStream).mockResolvedValue({} as MediaStream);
    vi.mocked(screen.startScreenCapture).mockReturnValue({
      stop,
      getRecordingBlob: () => new Blob(),
    });

    const { result } = renderHook(() => useScreenCapture(socket));
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
    expect(socket.send).toHaveBeenCalledWith({ type: "screen.recording.stopped" });
  });

  it("does not send screen.recording.stopped if capture never went active", () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useScreenCapture(socket));

    act(() => {
      result.current.stop();
    });

    expect(socket.send).not.toHaveBeenCalled();
  });

  it("routes the browser's native Stop sharing UI back through this hook's stop()", async () => {
    const stop = vi.fn();
    const socket = fakeSocket();
    vi.mocked(screen.requestScreenStream).mockResolvedValue({} as MediaStream);
    let onStreamEnded: (() => void) | undefined;
    vi.mocked(screen.startScreenCapture).mockImplementation(
      (_stream, _onChunk, _createRecorder, _isTypeSupported, streamEndedCb) => {
        onStreamEnded = streamEndedCb;
        return { stop, getRecordingBlob: () => new Blob() };
      },
    );

    const { result } = renderHook(() => useScreenCapture(socket));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("active");

    act(() => {
      onStreamEnded?.();
    });

    expect(result.current.status).toBe("idle");
    expect(socket.send).toHaveBeenCalledWith({ type: "screen.recording.stopped" });
  });
});

// Regression guards mirroring useMicrophoneCapture.test.ts's recording
// boundaries: recording must run strictly between an explicit start() and
// stop() — never after the component showing the recording indicator has
// gone away, and never as the delayed result of a share-picker prompt the
// user already backed out of.
describe("useScreenCapture recording boundaries", () => {
  it("stops recording when the component unmounts", async () => {
    const stop = vi.fn();
    vi.mocked(screen.requestScreenStream).mockResolvedValue({} as MediaStream);
    vi.mocked(screen.startScreenCapture).mockReturnValue({
      stop,
      getRecordingBlob: () => new Blob(),
    });

    const { result, unmount } = renderHook(() => useScreenCapture(fakeSocket()));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("active");

    unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("does not start recording if stopped while the share picker is open", async () => {
    const trackStop = vi.fn();
    const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;

    let resolvePermission: ((s: MediaStream | null) => void) | undefined;
    vi.mocked(screen.requestScreenStream).mockReturnValue(
      new Promise((resolve) => {
        resolvePermission = resolve;
      }),
    );
    vi.mocked(screen.startScreenCapture).mockReturnValue({
      stop: vi.fn(),
      getRecordingBlob: () => new Blob(),
    });

    const { result } = renderHook(() => useScreenCapture(fakeSocket()));

    let startPromise: ReturnType<typeof result.current.start>;
    act(() => {
      startPromise = result.current.start();
    });

    // User clicks End (or navigates away) while the picker is still open.
    act(() => {
      result.current.stop();
    });

    await act(async () => {
      resolvePermission!(stream);
      await startPromise!;
    });

    expect(screen.startScreenCapture).not.toHaveBeenCalled();
    // The granted stream must be released, not left holding capture open.
    expect(trackStop).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("does not strand the first recorder when start() is called twice", async () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    vi.mocked(screen.requestScreenStream).mockResolvedValue({} as MediaStream);
    vi.mocked(screen.startScreenCapture)
      .mockReturnValueOnce({ stop: firstStop, getRecordingBlob: () => new Blob() })
      .mockReturnValueOnce({ stop: secondStop, getRecordingBlob: () => new Blob() });

    const { result } = renderHook(() => useScreenCapture(fakeSocket()));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });

    expect(firstStop).toHaveBeenCalled();
    expect(result.current.status).toBe("active");
  });
});
