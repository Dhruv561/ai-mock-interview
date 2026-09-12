import { useInterview } from "../state/interviewStore";
import {
  buildMockReview,
  nextMockHint,
  useMockInterviewEngine,
} from "../state/mockEngine";
import { EndReviewButton } from "./EndReviewButton";
import { HintButton } from "./HintButton";
import { Review } from "./Review";
import { Rubric } from "./Rubric";
import { StartScreen } from "./StartScreen";
import { StatusIndicator } from "./StatusIndicator";
import { Transcript } from "./Transcript";

const MAX_HINT_LEVEL = 3;

/**
 * Top-level panel. Currently driven by state/mockEngine.ts (Feature 02 —
 * mocked data, no backend). A later phase replaces the mock engine's
 * dispatch calls with translated server events over the real WebSocket
 * (networking/websocket.ts) without changing this component or the
 * reducer/types beneath it.
 */
export function InterviewPanel() {
  const { state, dispatch } = useInterview();
  useMockInterviewEngine(state.status, dispatch);

  function handleStart() {
    dispatch({ type: "session/start" });
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
    dispatch({ type: "session/end" });
    dispatch({
      type: "review/ready",
      review: buildMockReview(state.elapsedSeconds),
    });
  }

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg font-sans text-[13px] text-ink">
      <StatusIndicator status={state.status} elapsedSeconds={state.elapsedSeconds} />

      {state.status === "idle" && <StartScreen onStart={handleStart} />}

      {(state.status === "recording" || state.status === "paused") && (
        <>
          <Transcript messages={state.messages} />
          <Rubric rubric={state.rubric} />
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
