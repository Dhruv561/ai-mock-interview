import { endInterviewSession, startInterviewSession } from "../content/interviewSession";
import { useInterviewerAudioPlayback } from "../media/useInterviewerAudioPlayback";
import { useMicrophoneCapture } from "../media/useMicrophoneCapture";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useInterviewStage } from "../networking/useInterviewStage";
import { usePanelLayout } from "../state/panelLayout";
import { useLiveInterviewEngine } from "../state/liveInterviewEngine";
import { useInterview } from "../state/interviewStore";
import { buildMockReview } from "../state/mockEngine";
import { LayoutSwitcher } from "./LayoutSwitcher";
import { DockedPanel } from "./panels/DockedPanel";
import { FloatingPanel } from "./panels/FloatingPanel";
import { SplitPanel } from "./panels/SplitPanel";
import type { PanelBodyProps } from "./panels/PanelBodyProps";
import { Review } from "./Review";
import { StartScreen } from "./StartScreen";
import { StatusIndicator } from "./StatusIndicator";

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
  const { layout, setLayout } = usePanelLayout();
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

  const isActive = state.status === "recording" || state.status === "paused";

  const panelBodyProps: PanelBodyProps = {
    state,
    micStatus: mic.status,
    getMicAnalyser: mic.getAnalyser,
    isSpeaking: audio.isSpeaking,
    isMuted: audio.isMuted,
    onToggleMute: audio.toggleMute,
    getTtsAnalyser: audio.getAnalyser,
    stage,
    onHint: handleHint,
    hintDisabled: state.hints.length >= MAX_HINT_LEVEL,
    onEnd: handleEnd,
  };

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg font-sans text-[13px] text-ink">
      <StatusIndicator status={state.status} elapsedSeconds={state.elapsedSeconds} />

      {isActive && (
        <div className="flex justify-end px-5 py-2">
          <LayoutSwitcher value={layout} onChange={setLayout} />
        </div>
      )}

      {state.status === "idle" && <StartScreen onStart={handleStart} />}

      {isActive &&
        (layout === "docked" ? (
          <DockedPanel {...panelBodyProps} />
        ) : layout === "floating" ? (
          <FloatingPanel {...panelBodyProps} />
        ) : (
          <SplitPanel {...panelBodyProps} />
        ))}

      {state.status === "ended" && state.review && (
        <Review review={state.review} onRestart={handleStart} />
      )}
    </div>
  );
}
