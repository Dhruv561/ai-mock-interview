import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewSocket } from "../networking/websocket";
import * as microphone from "./microphone";
import { useMicrophoneCapture, type MicStatus } from "./useMicrophoneCapture";

vi.mock("./microphone");

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

describe("useMicrophoneCapture", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle", () => {
    const { result } = renderHook(() => useMicrophoneCapture(fakeSocket()));
    expect(result.current.status).toBe("idle");
  });

  it("goes to denied when permission is refused", async () => {
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue(null);
    const { result } = renderHook(() => useMicrophoneCapture(fakeSocket()));

    let resolved: MicStatus | undefined;
    await act(async () => {
      resolved = await result.current.start();
    });

    expect(result.current.status).toBe("denied");
    // Feature 16: callers gate Start on the resolved value directly
    // (PRD §14 "prevent starting the interview if audio is essential"),
    // not on reading `status` right after — that would race React's
    // state update from a plain event handler.
    expect(resolved).toBe("denied");
  });

  it("goes active and forwards captured chunks to the socket", async () => {
    const socket = fakeSocket();
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue({} as MediaStream);
    let onChunkCb: ((chunk: Blob) => void) | undefined;
    vi.mocked(microphone.startMicrophoneCapture).mockImplementation((_stream, onChunk) => {
      onChunkCb = onChunk;
      return { stop: vi.fn(), analyser: null };
    });

    const { result } = renderHook(() => useMicrophoneCapture(socket));
    let resolved: MicStatus | undefined;
    await act(async () => {
      resolved = await result.current.start();
    });

    expect(result.current.status).toBe("active");
    expect(resolved).toBe("active");
    const chunk = new Blob(["x"]);
    onChunkCb?.(chunk);
    expect(socket.sendAudioChunk).toHaveBeenCalledWith(chunk);
  });

  it("goes to unsupported (not a thrown error) when no mime type is available", async () => {
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue({} as MediaStream);
    vi.mocked(microphone.startMicrophoneCapture).mockReturnValue(null);
    const { result } = renderHook(() => useMicrophoneCapture(fakeSocket()));

    let resolved: MicStatus | undefined;
    await act(async () => {
      resolved = await result.current.start();
    });

    expect(result.current.status).toBe("unsupported");
    expect(resolved).toBe("unsupported");
  });

  it("stop() releases the capture and resets to idle", async () => {
    const stop = vi.fn();
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue({} as MediaStream);
    vi.mocked(microphone.startMicrophoneCapture).mockReturnValue({ stop, analyser: null });

    const { result } = renderHook(() => useMicrophoneCapture(fakeSocket()));
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
  });
});

// Regression guards for the 2026-09-13 privacy bug. Recording must run
// strictly between an explicit start() and stop() — never after the
// component that displays the recording indicator has gone away, and never
// as the delayed result of a permission prompt the user already backed out
// of.
describe("useMicrophoneCapture recording boundaries", () => {
  it("stops recording when the component unmounts", async () => {
    const stop = vi.fn();
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue({} as MediaStream);
    vi.mocked(microphone.startMicrophoneCapture).mockReturnValue({ stop, analyser: null });

    const { result, unmount } = renderHook(() => useMicrophoneCapture(fakeSocket()));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("active");

    unmount();

    // This is the exact failure observed live: the panel was torn down on
    // SPA navigation and the mic kept streaming with no UI indicating it.
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("does not start recording if stopped while the permission prompt is open", async () => {
    const trackStop = vi.fn();
    const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;

    let resolvePermission: ((s: MediaStream | null) => void) | undefined;
    vi.mocked(microphone.requestMicrophoneStream).mockReturnValue(
      new Promise((resolve) => {
        resolvePermission = resolve;
      }),
    );
    vi.mocked(microphone.startMicrophoneCapture).mockReturnValue({ stop: vi.fn(), analyser: null });

    const { result } = renderHook(() => useMicrophoneCapture(fakeSocket()));

    let startPromise: Promise<MicStatus>;
    act(() => {
      startPromise = result.current.start();
    });

    // User clicks End (or navigates away) while the prompt is still open.
    act(() => {
      result.current.stop();
    });

    await act(async () => {
      resolvePermission!(stream);
      await startPromise!;
    });

    expect(microphone.startMicrophoneCapture).not.toHaveBeenCalled();
    // The granted stream must be released, not left holding the mic open.
    expect(trackStop).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("does not strand the first recorder when start() is called twice", async () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue({} as MediaStream);
    vi.mocked(microphone.startMicrophoneCapture)
      .mockReturnValueOnce({ stop: firstStop, analyser: null })
      .mockReturnValueOnce({ stop: secondStop, analyser: null });

    const { result } = renderHook(() => useMicrophoneCapture(fakeSocket()));
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
