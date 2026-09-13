import { useState } from "react";
import {
  endConvaiSession,
  recordConvaiTranscriptEntry,
  requestConvaiHint,
  startConvaiSession,
} from "../content/convaiSession";
import { useConvaiAudioPlayback } from "../media/useConvaiAudioPlayback";
import { useConvaiMicrophoneCapture } from "../media/useConvaiMicrophoneCapture";
import type { ConvaiSocket } from "../networking/convaiSocket";
import { usePanelLayout } from "../state/panelLayout";
import { useConvaiInterviewEngine } from "../state/convaiInterviewEngine";
import { useInterview } from "../state/interviewStore";
import type { EvidenceItem, RubricState } from "../state/types";
import { LayoutSwitcher } from "./LayoutSwitcher";
import { DockedPanel } from "./panels/DockedPanel";
import { FloatingPanel } from "./panels/FloatingPanel";
import { SplitPanel } from "./panels/SplitPanel";
import type { PanelBodyProps } from "./panels/PanelBodyProps";
import { Review } from "./Review";
import { StartScreen, type MicBlockedReason } from "./StartScreen";
import { StatusIndicator } from "./StatusIndicator";

/**
 * ElevenLabs Conversational AI spike's panel (see spikes/elevenlabs-convai/
 * README.md and progress.md's "Spike" section) — a parallel, opt-in
 * alternative to components/InterviewPanel.tsx, rendered instead of it
 * when VITE_USE_ELEVENLABS_CONVAI=true (content/App.tsx). Deliberately
 * reuses every visual component the real panel does (DockedPanel/
 * FloatingPanel/SplitPanel, StartScreen, Review, StatusIndicator) so the
 * comparison is about the interviewer pipeline, not the UI around it —
 * only the wiring underneath (this file, convaiSession.ts,
 * convaiInterviewEngine.ts, the media/useConvai* hooks) is pipeline-specific.
 *
 * Known gaps vs. InterviewPanel.tsx (documented, not bugs — see the spike
 * README): no screen capture, no live interview stage (always shown as
 * null/hidden), no rubric (Convai has no rubric evidence to score).
 */
export function ConvaiInterviewPanel() {
  const { state, dispatch } = useInterview();
  const [socket, setSocket] = useState<ConvaiSocket | null>(null);
  const mic = useConvaiMicrophoneCapture();
  const audio = useConvaiAudioPlayback(socket);
  const { layout, setLayout } = usePanelLayout();
  useConvaiInterviewEngine(socket, state.elapsedSeconds, dispatch, recordConvaiTranscriptEntry);
  const [micBlockedReason, setMicBlockedReason] = useState<MicBlockedReason | null>(null);

  async function handleStart() {
    setMicBlockedReason(null);
    const newSocket = await startConvaiSession();
    if (!newSocket) {
      // Covers both "problem not detected yet" and "backend/ElevenLabs
      // unreachable" — StartScreen only distinguishes denied/unsupported,
      // and this spike doesn't warrant a third UI-level reason.
      setMicBlockedReason("unsupported");
      return;
    }

    const result = await mic.start(newSocket);
    if (result !== "active") {
      newSocket.close();
      setMicBlockedReason(result === "unsupported" ? "unsupported" : "denied");
      return;
    }

    setSocket(newSocket);
    dispatch({ type: "session/start" });
  }

  function handleHint() {
    requestConvaiHint();
  }

  async function handleEnd() {
    mic.stop();
    dispatch({ type: "session/end" });
    const review = await endConvaiSession();
    setSocket(null);
    if (review) {
      dispatch({
        type: "review/ready",
        review: {
          overallScore: review.overall_score as number,
          rubric: review.rubric as RubricState,
          strengths: (review.strengths as Array<{ text: string; evidence_ids: string[] }>).map(
            (point) => ({ text: point.text, evidenceIds: point.evidence_ids }),
          ),
          areasToImprove: (
            review.areas_to_improve as Array<{ text: string; evidence_ids: string[] }>
          ).map((point) => ({ text: point.text, evidenceIds: point.evidence_ids })),
          timeline: (review.timeline as Array<{ label: string; elapsed_seconds: number }>).map(
            (entry) => ({ label: entry.label, elapsedSeconds: entry.elapsed_seconds }),
          ),
          // Field names already match EvidenceItem 1:1 (id/kind/text) — no
          // snake_case translation needed here, unlike the points above.
          evidence: review.evidence as EvidenceItem[],
        },
      });
    }
  }

  const isActive = state.status === "recording";

  const panelBodyProps: PanelBodyProps = {
    state,
    micStatus: mic.status,
    getMicAnalyser: mic.getAnalyser,
    screenStatus: "idle", // no screen capture in this spike — see header comment
    isSpeaking: audio.isSpeaking,
    isMuted: audio.isMuted,
    onToggleMute: audio.toggleMute,
    getTtsAnalyser: audio.getAnalyser,
    stage: null, // no live stage machine in this pipeline — see header comment
    onHint: handleHint,
    hintDisabled: false, // no hint-level cap to enforce (no tiered hints at all — see convaiSession.ts)
    onEnd: () => void handleEnd(),
  };

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg font-sans text-[13px] text-ink">
      <StatusIndicator status={state.status} elapsedSeconds={state.elapsedSeconds} />

      {isActive && (
        <div className="flex justify-end px-5 py-2">
          <LayoutSwitcher value={layout} onChange={setLayout} />
        </div>
      )}

      {state.status === "idle" && (
        <StartScreen onStart={() => void handleStart()} micBlockedReason={micBlockedReason ?? undefined} />
      )}

      {isActive &&
        (layout === "docked" ? (
          <DockedPanel {...panelBodyProps} />
        ) : layout === "floating" ? (
          <FloatingPanel {...panelBodyProps} />
        ) : (
          <SplitPanel {...panelBodyProps} />
        ))}

      {state.status === "ended" && state.review && (
        <Review review={state.review} onRestart={() => void handleStart()} />
      )}

      {state.status === "ended" && !state.review && (
        <div className="flex flex-1 items-center justify-center gap-2 px-5 py-5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" aria-hidden />
          <span className="font-mono text-[11px] tracking-wider text-ink-faint">
            GENERATING REVIEW…
          </span>
        </div>
      )}
    </div>
  );
}
