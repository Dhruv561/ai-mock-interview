import { useMicrophoneCapture } from "../media/useMicrophoneCapture";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useInterview } from "../state/interviewStore";
import {
  buildMockReview,
  nextMockHint,
  useMockInterviewEngine,
} from "../state/mockEngine";
import { EndReviewButton } from "./EndReviewButton";
import { HintButton } from "./HintButton";
import { MicBadge } from "./MicBadge";
import { Review } from "./Review";
import { StartScreen } from "./StartScreen";
import { StatusIndicator } from "./StatusIndicator";
import { Transcript } from "./Transcript";

const MAX_HINT_LEVEL = 3;

/**
 * Top-level panel. Currently driven by state/mockEngine.ts (Feature 02 —
 * mocked data, no backend). A later phase replaces the mock engine's
 * dispatch calls with translated server events over the real WebSocket
 * (networking/websocket.ts) without changing this component or the
 * reducer/types beneath it. Mic capture (Feature 05) is real and wired
 * directly to Start/End here, independent of the mock engine — same
 * pattern as the connection badge in App.tsx.
 */
export function InterviewPanel() {
  const { state, dispatch } = useInterview();
  useMockInterviewEngine(state.status, dispatch);
  const mic = useMicrophoneCapture(getInterviewSocket());

  function handleStart() {
    dispatch({ type: "session/start" });
    void mic.start();
  }

  function handleHint() {
    const hint = nextMockHint(state.hints.length);
    dispatch({ type: "hint/add", hint });
    dispatch({
      type: "message/add",
      message: {
        id: `hint-${state.hints.length + 1}`,
        speaker: "interviewer",
        elapsedSeconds: state.elapsedSeconds,
        text: `Hint (level ${hint.level}): ${hint.text}`,
      },
    });
  }

  function handleEnd() {
    mic.stop();
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
          <Transcript messages={state.messages} />
          <div className="flex gap-2 px-5 py-4">
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
