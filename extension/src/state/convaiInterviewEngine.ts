import { useEffect, type Dispatch } from "react";
import type { ConvaiSocket } from "../networking/convaiSocket";
import type { InterviewAction } from "./interviewReducer";

let messageCounter = 0;

/**
 * Convai analog of state/liveInterviewEngine.ts — dispatches into the exact
 * same reducer/UI state as the real pipeline, so Transcript/StatusIndicator/
 * etc. don't know or care which pipeline is live. Only
 * components/ConvaiInterviewPanel.tsx, content/convaiSession.ts, and this
 * file are pipeline-specific.
 *
 * Known gap vs. the real engine (documented in spikes/elevenlabs-convai/
 * README.md, not a bug): there is no transcript.partial equivalent —
 * Convai only reports a finished user_transcript, no mid-utterance
 * partials — so candidateDraft is simply never set here.
 */
export function useConvaiInterviewEngine(
  socket: ConvaiSocket | null,
  elapsedSeconds: number,
  dispatch: Dispatch<InterviewAction>,
  onTranscriptEntry: (speaker: "candidate" | "interviewer", text: string) => void,
) {
  useEffect(() => {
    if (!socket) return;

    return socket.onEvent((event) => {
      switch (event.type) {
        case "agent_response":
          messageCounter += 1;
          dispatch({
            type: "message/add",
            message: {
              id: `convai-${messageCounter}`,
              speaker: "interviewer",
              elapsedSeconds,
              text: event.text,
            },
          });
          onTranscriptEntry("interviewer", event.text);
          break;

        case "user_transcript":
          messageCounter += 1;
          dispatch({
            type: "message/add",
            message: {
              id: `convai-${messageCounter}`,
              speaker: "candidate",
              elapsedSeconds,
              text: event.text,
            },
          });
          onTranscriptEntry("candidate", event.text);
          break;

        default:
          break;
      }
    });
  }, [socket, dispatch, elapsedSeconds, onTranscriptEntry]);
}
