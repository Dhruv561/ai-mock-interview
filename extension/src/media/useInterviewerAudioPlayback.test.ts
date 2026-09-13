import type { ServerEvent } from "@ai-mock-interview/shared";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewSocket } from "../networking/websocket";
import * as interviewerAudioPlayer from "./interviewerAudioPlayer";
import { useInterviewerAudioPlayback } from "./useInterviewerAudioPlayback";

vi.mock("./interviewerAudioPlayer");

function fakeSocket() {
  const eventHandlers = new Set<(event: ServerEvent) => void>();
  const audioHandlers = new Set<(chunk: ArrayBuffer) => void>();
  const socket: InterviewSocket = {
    send: vi.fn(),
    sendAudioChunk: vi.fn(),
    onEvent: (handler) => {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    onAudioChunk: (handler) => {
      audioHandlers.add(handler);
      return () => audioHandlers.delete(handler);
    },
    onStateChange: vi.fn(() => () => {}),
    close: vi.fn(),
  };
  return {
    socket,
    emitEvent: (event: ServerEvent) => eventHandlers.forEach((h) => h(event)),
    emitAudio: (chunk: ArrayBuffer) => audioHandlers.forEach((h) => h(chunk)),
  };
}

function fakePlayer() {
  let muted = false;
  return {
    handleStart: vi.fn(),
    handleChunk: vi.fn(),
    handleEnd: vi.fn(),
    setMuted: vi.fn((m: boolean) => {
      muted = m;
    }),
    isMuted: vi.fn(() => muted),
    getAnalyser: vi.fn(() => null),
    dispose: vi.fn(),
  };
}

describe("useInterviewerAudioPlayback", () => {
  beforeEach(() => {
    vi.mocked(interviewerAudioPlayer.createInterviewerAudioPlayer).mockReset();
  });

  it("routes interviewer.audio.start/end and onAudioChunk to the player", () => {
    const player = fakePlayer();
    vi.mocked(interviewerAudioPlayer.createInterviewerAudioPlayer).mockReturnValue(player);
    const { socket, emitEvent, emitAudio } = fakeSocket();

    renderHook(() => useInterviewerAudioPlayback(socket));

    act(() => emitEvent({ type: "interviewer.audio.start", seq: 1, format: "pcm_s16le_16000" }));
    expect(player.handleStart).toHaveBeenCalledWith("pcm_s16le_16000");

    const chunk = new ArrayBuffer(4);
    act(() => emitAudio(chunk));
    expect(player.handleChunk).toHaveBeenCalledWith(chunk);

    act(() => emitEvent({ type: "interviewer.audio.end", seq: 2 }));
    expect(player.handleEnd).toHaveBeenCalled();
  });

  it("ignores unrelated event types", () => {
    const player = fakePlayer();
    vi.mocked(interviewerAudioPlayer.createInterviewerAudioPlayer).mockReturnValue(player);
    const { socket, emitEvent } = fakeSocket();

    renderHook(() => useInterviewerAudioPlayback(socket));
    act(() => emitEvent({ type: "session.started", seq: 1, session_id: "abc" }));

    expect(player.handleStart).not.toHaveBeenCalled();
    expect(player.handleEnd).not.toHaveBeenCalled();
  });

  it("reflects the player's onSpeakingChange callback as isSpeaking", () => {
    let onSpeakingChange: ((v: boolean) => void) | undefined;
    vi.mocked(interviewerAudioPlayer.createInterviewerAudioPlayer).mockImplementation((options) => {
      onSpeakingChange = options?.onSpeakingChange;
      return fakePlayer();
    });
    const { socket } = fakeSocket();

    const { result } = renderHook(() => useInterviewerAudioPlayback(socket));
    expect(result.current.isSpeaking).toBe(false);

    act(() => onSpeakingChange?.(true));
    expect(result.current.isSpeaking).toBe(true);

    act(() => onSpeakingChange?.(false));
    expect(result.current.isSpeaking).toBe(false);
  });

  it("toggles mute and delegates to the player's setMuted", () => {
    const player = fakePlayer();
    vi.mocked(interviewerAudioPlayer.createInterviewerAudioPlayer).mockReturnValue(player);
    const { socket } = fakeSocket();

    const { result } = renderHook(() => useInterviewerAudioPlayback(socket));
    expect(result.current.isMuted).toBe(false);

    act(() => result.current.toggleMute());
    expect(player.setMuted).toHaveBeenCalledWith(true);
    expect(result.current.isMuted).toBe(true);

    act(() => result.current.toggleMute());
    expect(player.setMuted).toHaveBeenCalledWith(false);
    expect(result.current.isMuted).toBe(false);
  });

  it("disposes the player on unmount, releasing its AudioContext", () => {
    const player = fakePlayer();
    vi.mocked(interviewerAudioPlayer.createInterviewerAudioPlayer).mockReturnValue(player);
    const { socket } = fakeSocket();

    const { unmount } = renderHook(() => useInterviewerAudioPlayback(socket));
    expect(player.dispose).not.toHaveBeenCalled();

    unmount();
    expect(player.dispose).toHaveBeenCalledTimes(1);
  });
});
