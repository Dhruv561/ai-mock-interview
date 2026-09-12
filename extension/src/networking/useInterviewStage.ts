import type { ServerEvent } from "@ai-mock-interview/shared";
import { useEffect, useState } from "react";
import type { InterviewSocket } from "./websocket";

export type InterviewStage = Extract<ServerEvent, { type: "interviewer.state" }>["stage"];

/**
 * Tracks the backend's real interview stage (Feature 07) — independent of
 * state/interviewStore's mock-driven session status, same pattern as
 * useConnectionState/useMicrophoneCapture. Returns null until the first
 * interviewer.state event arrives (sent right after session.started).
 */
export function useInterviewStage(socket: InterviewSocket): InterviewStage | null {
  const [stage, setStage] = useState<InterviewStage | null>(null);

  useEffect(
    () =>
      socket.onEvent((event) => {
        if (event.type === "interviewer.state") setStage(event.stage);
      }),
    [socket],
  );

  return stage;
}
