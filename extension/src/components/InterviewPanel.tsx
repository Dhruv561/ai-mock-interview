import { endInterviewSession, startInterviewSession } from "../content/interviewSession";
import { useInterviewerAudioPlayback } from "../media/useInterviewerAudioPlayback";
import { useMicrophoneCapture } from "../media/useMicrophoneCapture";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useInterviewStage } from "../networking/useInterviewStage";
import { useLiveInterviewEngine } from "../state/liveInterviewEngine";
import { useInterview } from "../state/interviewStore";
import { buildMockReview } from "../state/mockEngine";
import { EndReviewButton } from "./EndReviewButton";
import { HintButton } from "./HintButton";
import { MicBadge } from "./MicBadge";
import { MuteButton } from "./MuteButton";
import { Review } from "./Review";
import { SpeakingBadge } from "./SpeakingBadge";
import { StageBadge } from "./StageBadge";
import { StartScreen } from "./StartScreen";
import { StatusIndicator } from "./StatusIndicator";
import { Transcript } from "./Transcript";

const MAX_HINT_LEVEL = 3;

/**
 * Top-level panel. The transcript (interviewer questions, hints, candidate
 * speech) is driven by real backend events via state/liveInterviewEngine.ts
 * (Feature 08) — session.start now fires from handleStart below, not
 * automatically on page load (see content/interviewSession.ts), so nothing
 * the interviewer says can arrive before the candidate has actually
 * started. The final review is still state/mockEngine.ts's hardcoded
 * placeholder until Feature 14 exists.
 */
export function InterviewPanel() {
  const { state, dispatch } = useInterview();
  const socket = getInterviewSocket();
  const mic = useMicrophoneCapture(socket);
  const stage = useInterviewStage(socket);
  const audio = useInterviewerAudioPlayback(socket);
  useLiveInterviewEngine(socket, state.elapsedSeconds, dispatch);

  function handleStart() {
    dispatch({ type: "session/start" });
    void mic.start();
    void startInterviewSession();
  }

  function handleHint() {
    socket.send({ type: "hint.requested" });
  }

  function handleEnd() {
    mic.stop();
    socket.send({ type: "session.end" });
    endInterviewSession();
    dispatch({ type: "session/end" });
    dispatch({
      type: "review/ready",
      review: buildMockReview(state.rubric, state.elapsedSeconds),
    });
  }

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg font-sans text-[13px] text-ink">
      <StatusIndicator status={state.status} elapsedSeconds={state.elapsedSeconds} />

      {state.status === "idle" && <StartScreen onStart={handleStart} />}

      {(state.status === "recording" || state.status === "paused") && (
        <>
          {/*
           * Deliberate deviation from PRD §3.3 / docs/ui-reference.png,
           * which show a live "RUBRIC SO FAR" section: product decision
           * (2026-09-12) to only reveal scores on the Review screen so
           * candidates aren't watching live numbers during the interview.
           * See architecture.md §1 and progress.md decisions log.
           */}
          <MicBadge status={mic.status} />
          <SpeakingBadge isSpeaking={audio.isSpeaking} />
          <StageBadge stage={stage} />
          <Transcript messages={state.messages} />
          <div className="flex gap-2 px-5 py-4">
            <MuteButton isMuted={audio.isMuted} onClick={audio.toggleMute} />
            <HintButton
              onClick={handleHint}
              disabled={state.hints.length >= MAX_HINT_LEVEL}
            />
            <EndReviewButton onClick={handleEnd} />
          </div>
        </>
      )}

      {state.status === "ended" && state.review && (
        <Review review={state.review} onRestart={handleStart} />
      )}
    </div>
  );
}
