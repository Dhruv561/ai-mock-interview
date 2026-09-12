import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInterviewSocket } from "../networking/interviewSocket";
import type { InterviewSocket } from "../networking/websocket";
import { getCurrentSnapshot } from "./editor";
import {
  cacheProblemInfo,
  endInterviewSession,
  hasActiveInterviewSession,
  resetInterviewSession,
  startInterviewSession,
} from "./interviewSession";
import type { ProblemInfo } from "./leetcode";

vi.mock("./editor");
vi.mock("../networking/interviewSocket");

const PROBLEM: ProblemInfo = {
  slug: "two-sum",
  number: "1",
  title: "Two Sum",
  difficulty: "Easy",
  description: "Given an array...",
};

function mockSocket(send: (event: unknown) => void) {
  vi.mocked(getInterviewSocket).mockReturnValue({ send } as unknown as InterviewSocket);
}

describe("interviewSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetInterviewSession();
  });

  it("does nothing if no problem has been cached", async () => {
    const send = vi.fn();
    mockSocket(send);

    await startInterviewSession();

    expect(send).not.toHaveBeenCalled();
    expect(hasActiveInterviewSession()).toBe(false);
  });

  it("sends session.start with the cached problem and detected language", async () => {
    const send = vi.fn();
    mockSocket(send);
    vi.mocked(getCurrentSnapshot).mockResolvedValue({ code: "x = 1", language: "python" });

    cacheProblemInfo(PROBLEM);
    await startInterviewSession();

    expect(send).toHaveBeenCalledWith({ type: "session.start", problem: PROBLEM, language: "python" });
    expect(hasActiveInterviewSession()).toBe(true);
  });

  it("falls back to plaintext when no snapshot is available", async () => {
    const send = vi.fn();
    mockSocket(send);
    vi.mocked(getCurrentSnapshot).mockResolvedValue(null);

    cacheProblemInfo(PROBLEM);
    await startInterviewSession();

    expect(send).toHaveBeenCalledWith({ type: "session.start", problem: PROBLEM, language: "plaintext" });
  });

  it("does not send a second session.start once already started", async () => {
    const send = vi.fn();
    mockSocket(send);
    vi.mocked(getCurrentSnapshot).mockResolvedValue({ code: "", language: "python" });

    cacheProblemInfo(PROBLEM);
    await startInterviewSession();
    await startInterviewSession();

    expect(send).toHaveBeenCalledOnce();
  });

  it("endInterviewSession allows a fresh session.start without re-caching the problem", async () => {
    const send = vi.fn();
    mockSocket(send);
    vi.mocked(getCurrentSnapshot).mockResolvedValue({ code: "", language: "python" });

    cacheProblemInfo(PROBLEM);
    await startInterviewSession();
    endInterviewSession();
    await startInterviewSession();

    expect(send).toHaveBeenCalledTimes(2);
  });

  it("resetInterviewSession clears the cached problem too", async () => {
    const send = vi.fn();
    mockSocket(send);

    cacheProblemInfo(PROBLEM);
    resetInterviewSession();
    await startInterviewSession();

    expect(send).not.toHaveBeenCalled();
  });
});
