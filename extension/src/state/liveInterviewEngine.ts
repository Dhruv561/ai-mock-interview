import { useEffect, type Dispatch } from "react";
import type { InterviewSocket } from "../networking/websocket";
import type { InterviewAction } from "./interviewReducer";

function clampHintLevel(level: number): 1 | 2 | 3 {
  if (level <= 1) return 1;
  if (level >= 3) return 3;
  return 2;
}

/**
 * Drives the transcript and final review from real backend events
 * (Features 08 and 14) — replaces the scripted timeline and hardcoded
 * review that used to live in mockEngine.ts, now that the backend
 * genuinely produces interviewer.transcript/hint.response/transcript.final/
 * review.ready. transcript.partial (mid-speech) used to be dropped
 * entirely (TranscriptMessage had no "update in place" concept, and
 * appending a new message per partial would have spammed near-duplicates).
 * It's now routed into state.candidateDraft instead — a single slot that
 * each partial replaces rather than appends to — so the candidate sees
 * their own speech land as they say it. transcript.final still produces
 * the real TranscriptMessage and clears the draft (interviewReducer.ts).
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

          // Snake_case backend FinalReview -> camelCase client FinalReview
          // (state/types.ts), same translation discipline as every other
          // case here — the client type exists so the rest of the UI never
          // has to think in the wire format.
          case "review.ready":
            dispatch({
              type: "review/ready",
              review: {
                overallScore: event.review.overall_score,
                rubric: event.review.rubric,
                strengths: event.review.strengths.map((point) => ({
                  text: point.text,
                  evidenceIds: point.evidence_ids,
                })),
                areasToImprove: event.review.areas_to_improve.map((point) => ({
                  text: point.text,
                  evidenceIds: point.evidence_ids,
                })),
                timeline: event.review.timeline.map((entry) => ({
                  label: entry.label,
                  elapsedSeconds: entry.elapsed_seconds,
                })),
                evidence: event.review.evidence.map((item) => ({
                  id: item.id,
                  kind: item.kind,
                  text: item.text,
                })),
              },
            });
            break;

          case "transcript.partial":
            dispatch({ type: "candidateDraft/set", text: event.text });
            break;

          default:
            break;
        }
      }),
    [socket, dispatch, elapsedSeconds],
  );
}
