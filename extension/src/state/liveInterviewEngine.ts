import { useEffect, type Dispatch } from "react";
import type { InterviewSocket } from "../networking/websocket";
import type { InterviewAction } from "./interviewReducer";

function clampHintLevel(level: number): 1 | 2 | 3 {
  if (level <= 1) return 1;
  if (level >= 3) return 3;
  return 2;
}

/**
 * Drives the transcript from real backend events (Feature 08) — replaces
 * the scripted timeline that used to live in mockEngine.ts, now that the
 * backend genuinely produces interviewer.transcript/hint.response/
 * transcript.final. transcript.partial (mid-speech) is intentionally not
 * rendered here: TranscriptMessage has no "update in place" concept, and
 * appending a new message per partial would spam near-duplicates — only
 * the finished utterance is shown.
 */
export function useLiveInterviewEngine(
  socket: InterviewSocket,
  elapsedSeconds: number,
  dispatch: Dispatch<InterviewAction>,
) {
  useEffect(
    () =>
      socket.onEvent((event) => {
        switch (event.type) {
          case "interviewer.transcript":
            dispatch({
              type: "message/add",
              message: {
                id: `live-${event.seq}`,
                speaker: "interviewer",
                elapsedSeconds,
                text: event.text,
              },
            });
            break;

          case "hint.response":
            dispatch({
              type: "hint/add",
              hint: { level: clampHintLevel(event.level), text: event.text },
            });
            dispatch({
              type: "message/add",
              message: {
                id: `live-${event.seq}`,
                speaker: "interviewer",
                elapsedSeconds,
                text: `Hint (level ${event.level}): ${event.text}`,
              },
            });
            break;

          case "transcript.final":
            dispatch({
              type: "message/add",
              message: {
                id: `live-${event.seq}`,
                speaker: "candidate",
                elapsedSeconds,
                text: event.text,
              },
            });
            break;

          default:
            break;
        }
      }),
    [socket, dispatch, elapsedSeconds],
  );
}
