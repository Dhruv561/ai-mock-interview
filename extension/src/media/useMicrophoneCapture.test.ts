import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewSocket } from "../networking/websocket";
import * as microphone from "./microphone";
import { useMicrophoneCapture } from "./useMicrophoneCapture";

vi.mock("./microphone");

function fakeSocket(): InterviewSocket {
  return {
    send: vi.fn(),
    sendAudioChunk: vi.fn(),
    onEvent: vi.fn(() => () => {}),
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

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("denied");
  });

  it("goes active and forwards captured chunks to the socket", async () => {
    const socket = fakeSocket();
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue({} as MediaStream);
    let onChunkCb: ((chunk: Blob) => void) | undefined;
    vi.mocked(microphone.startMicrophoneCapture).mockImplementation((_stream, onChunk) => {
      onChunkCb = onChunk;
      return { stop: vi.fn() };
    });

    const { result } = renderHook(() => useMicrophoneCapture(socket));
    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("active");
    const chunk = new Blob(["x"]);
    onChunkCb?.(chunk);
    expect(socket.sendAudioChunk).toHaveBeenCalledWith(chunk);
  });

  it("goes to unsupported (not a thrown error) when no mime type is available", async () => {
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue({} as MediaStream);
    vi.mocked(microphone.startMicrophoneCapture).mockReturnValue(null);
    const { result } = renderHook(() => useMicrophoneCapture(fakeSocket()));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("unsupported");
  });

  it("stop() releases the capture and resets to idle", async () => {
    const stop = vi.fn();
    vi.mocked(microphone.requestMicrophoneStream).mockResolvedValue({} as MediaStream);
    vi.mocked(microphone.startMicrophoneCapture).mockReturnValue({ stop });

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
