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
import { useConvaiProgress } from "../content/convaiProgress";
import { useConvaiInterviewEngine } from "../state/convaiInterviewEngine";
import { useInterview } from "../state/interviewStore";
import type { EvidenceItem, RubricState } from "../state/types";
import { DockedPanel } from "./panels/DockedPanel";
import type { PanelBodyProps } from "./panels/PanelBodyProps";
import { Review } from "./Review";
import { StartScreen, type MicBlockedReason } from "./StartScreen";
import { StatusIndicator } from "./StatusIndicator";

/**
 * ElevenLabs Conversational AI panel (see spikes/elevenlabs-convai/
 * README.md and progress.md's "Spike" section for the original comparison
 * this grew out of) — the default panel (content/App.tsx), rendered unless
 * VITE_USE_LEGACY_PIPELINE=true. Reuses the same visual components as
 * InterviewPanel.tsx (DockedPanel, StartScreen, Review, StatusIndicator) —
 * a single fixed docked layout, no layout switcher (removed by user
 * request 2026-09-13, see progress.md) — so only the wiring underneath
 * (this file, convaiSession.ts, convaiInterviewEngine.ts, the media/
 * useConvai* hooks) is pipeline-specific.
 *
 * Known gaps vs. InterviewPanel.tsx (documented, not bugs — see the spike
 * README): the live rubric here is a preview refreshed from the backend's
 * `/api/convai/{analyse-code,live-rubric}` heuristics on code/transcript/
 * hint progress, not the legacy pipeline's fully evidence-linked live
 * rubric (architecture.md §O) — that still only exists on this pipeline's
 * final Review screen. Stage and hint progression are wired through a
 * local progress store so the shared stage views and hint cap behave like
 * the legacy pipeline. No screen capture — unlike the legacy pipeline,
 * this panel never sends screen.recording.* events anywhere (this
 * pipeline has no InterviewSocket at all), and nothing ever reads the
 * recorded blob, so it bought a permission prompt for zero product value
 * — deliberately dropped rather than left half-wired (2026-09-13).
 */
export function ConvaiInterviewPanel() {
  const { state, dispatch } = useInterview();
  const [socket, setSocket] = useState<ConvaiSocket | null>(null);
  const mic = useConvaiMicrophoneCapture();
  const audio = useConvaiAudioPlayback(socket);
  const progress = useConvaiProgress();
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
    screenStatus: "idle", // no screen capture in this pipeline — see header comment
    isSpeaking: audio.isSpeaking,
    isMuted: audio.isMuted,
    onToggleMute: audio.toggleMute,
    getTtsAnalyser: audio.getAnalyser,
    stage: progress.stage,
    liveRubric: progress.liveRubric,
    onHint: handleHint,
    hintDisabled: progress.pendingHintLevel !== null || progress.hints.length >= 3,
    onEnd: () => void handleEnd(),
  };

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg font-sans text-[13px] text-ink">
      <StatusIndicator status={state.status} elapsedSeconds={state.elapsedSeconds} />

      {state.status === "idle" && (
        <StartScreen onStart={() => void handleStart()} micBlockedReason={micBlockedReason ?? undefined} />
      )}

      {isActive && <DockedPanel {...panelBodyProps} />}

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
