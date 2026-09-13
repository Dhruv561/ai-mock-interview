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
import { EndReviewButton } from "./EndReviewButton";
import { HintButton } from "./HintButton";
import { MicBadge } from "./MicBadge";
import { Review } from "./Review";
import { StageBadge } from "./StageBadge";
import { StartScreen, type MicBlockedReason } from "./StartScreen";
import { StatusIndicator } from "./StatusIndicator";
import { Transcript } from "./Transcript";

/**
 * ElevenLabs Conversational AI panel (see spikes/elevenlabs-convai/
 * README.md and progress.md's "Spike" section for the original comparison
 * this grew out of) — the default panel (content/App.tsx), rendered unless
 * VITE_USE_LEGACY_PIPELINE=true. Body rendering matches Dhruv Verma's
 * original visual UI exactly (commit 596fe96, restored by user request
 * 2026-09-13): a plain stack of MicBadge/StageBadge/Transcript plus the
 * two action buttons — no dark-panel avatar, no live rubric preview, no
 * mute button, no screen-share status line (this pipeline never captured
 * screen anyway, see the removal note below). Only the wiring underneath
 * (this file, convaiSession.ts, convaiInterviewEngine.ts, the media/
 * useConvai* hooks) is pipeline-specific — the interviewer's TTS audio
 * still plays automatically (useConvaiAudioPlayback runs regardless of
 * whether a meter/mute control is rendered for it), and stage/hint
 * progression and the backend-authored live rubric are still computed by
 * the progress store — they're just not surfaced live in this UI anymore
 * (the rubric still reaches the final review as evidence either way).
 *
 * Known gap vs. the legacy pipeline (documented, not a bug — see the spike
 * README): the final review's rubric/evidence trail is thinner than the
 * legacy pipeline's fully evidence-linked one (architecture.md §O). No
 * screen capture — this pipeline never sends screen.recording.* events
 * anywhere (it has no InterviewSocket at all), and nothing ever reads the
 * recorded blob, so it bought a permission prompt for zero product value
 * — deliberately dropped rather than left half-wired (2026-09-13).
 */
export function ConvaiInterviewPanel() {
  const { state, dispatch } = useInterview();
  const [socket, setSocket] = useState<ConvaiSocket | null>(null);
  const mic = useConvaiMicrophoneCapture();
  // TTS audio still plays automatically via this hook's own effects — no
  // meter/mute UI surfaces it anymore (see header comment), so its return
  // value goes unused here.
  useConvaiAudioPlayback(socket);
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

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg font-sans text-[13px] text-ink">
      <StatusIndicator status={state.status} elapsedSeconds={state.elapsedSeconds} />

      {state.status === "idle" && (
        <StartScreen onStart={() => void handleStart()} micBlockedReason={micBlockedReason ?? undefined} />
      )}

      {state.status === "recording" && (
        <>
          <MicBadge status={mic.status} />
          <StageBadge stage={progress.stage} />
          <Transcript messages={state.messages} />
          <div className="flex gap-2 px-5 py-4">
            <HintButton
              onClick={handleHint}
              disabled={progress.pendingHintLevel !== null || progress.hints.length >= 3}
            />
            <EndReviewButton onClick={() => void handleEnd()} />
          </div>
        </>
      )}

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
