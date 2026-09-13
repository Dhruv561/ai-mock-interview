// DEPRECATED FALLBACK (2026-09-13): this is no longer the default panel —
// content/App.tsx renders ConvaiInterviewPanel.tsx by default and only
// falls back to this one when VITE_USE_LEGACY_PIPELINE=true. Kept working
// and tested (not deleted) as a reversible fallback; see architecture.md's
// "Default interviewer pipeline" addendum for the full decision record,
// including what the default pipeline gives up by not using this one
// (tiered hints, live stage tracking, rubric-evidenced review).
import { useState } from "react";
import { endInterviewSession, startInterviewSession } from "../content/interviewSession";
import { useInterviewerAudioPlayback } from "../media/useInterviewerAudioPlayback";
import { useMicrophoneCapture } from "../media/useMicrophoneCapture";
import { useScreenCapture } from "../media/useScreenCapture";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useInterviewStage } from "../networking/useInterviewStage";
import { useLiveInterviewEngine } from "../state/liveInterviewEngine";
import { useInterview } from "../state/interviewStore";
import { EndReviewButton } from "./EndReviewButton";
import { HintButton } from "./HintButton";
import { MicBadge } from "./MicBadge";
import { Review } from "./Review";
import { StageBadge } from "./StageBadge";
import { StartScreen, type MicBlockedReason } from "./StartScreen";
import { StatusIndicator } from "./StatusIndicator";
import { Transcript } from "./Transcript";

const MAX_HINT_LEVEL = 3;

/**
 * Top-level panel. The transcript (interviewer questions, hints, candidate
 * speech) and the final review are both driven by real backend events via
 * state/liveInterviewEngine.ts (Features 08 and 14) — session.start now
 * fires from handleStart below, not automatically on page load (see
 * content/interviewSession.ts), so nothing the interviewer says can arrive
 * before the candidate has actually started.
 *
 * Body rendering matches Dhruv Verma's original visual UI exactly (commit
 * 596fe96, restored by user request 2026-09-13): a plain stack of
 * MicBadge/StageBadge/Transcript plus the two action buttons, replacing the
 * dark-panel "DockedPanel" redesign (Features 10/13/18) that had sat here.
 * The pipeline work underneath (hints, TTS audio playback, screen capture)
 * still runs exactly as before — this file only lost the newer visual
 * surface for it (TTS mute button/level meter, screen-share status line),
 * not the underlying functionality. See architecture.md/progress.md for
 * the full record.
 */
export function InterviewPanel() {
  const { state, dispatch } = useInterview();
  const socket = getInterviewSocket();
  const mic = useMicrophoneCapture(socket);
  const screenCapture = useScreenCapture(socket);
  const stage = useInterviewStage(socket);
  // TTS audio still plays automatically via this hook's own effects — no
  // meter/mute UI surfaces it anymore (see header comment), so its return
  // value goes unused here.
  useInterviewerAudioPlayback(socket);
  useLiveInterviewEngine(socket, state.elapsedSeconds, dispatch);
  const [micBlockedReason, setMicBlockedReason] = useState<MicBlockedReason | null>(null);

  // Mic is required in the MVP's only mode (PRD §14, architecture.md §V):
  // "show a clear message and prevent starting the interview if audio is
  // essential." Screen capture stays best-effort/non-blocking (genuinely
  // optional — architecture.md §F/§V), so it's only started once the mic
  // gate has actually passed, not in parallel with it.
  async function handleStart() {
    setMicBlockedReason(null);
    const result = await mic.start();
    if (result !== "active") {
      setMicBlockedReason(result === "unsupported" ? "unsupported" : "denied");
      return;
    }
    dispatch({ type: "session/start" });
    void screenCapture.start();
    void startInterviewSession();
  }

  function handleHint() {
    socket.send({ type: "hint.requested" });
  }

  function handleEnd() {
    mic.stop();
    screenCapture.stop();
    socket.send({ type: "session.end" });
    endInterviewSession();
    // status flips to "ended" immediately as local UI feedback; the review
    // itself arrives slightly later via review.ready (see
    // useLiveInterviewEngine) once the backend finishes evaluating the
    // session, so state.review stays null in between.
    dispatch({ type: "session/end" });
  }

  return (
    <div className="flex h-full w-full flex-col bg-panel-bg font-sans text-[13px] text-ink">
      <StatusIndicator status={state.status} elapsedSeconds={state.elapsedSeconds} />

      {state.status === "idle" && (
        <StartScreen onStart={handleStart} micBlockedReason={micBlockedReason ?? undefined} />
      )}

      {state.status === "recording" && (
        <>
          {/*
           * Deliberate deviation from PRD §3.3 / docs/ui-reference.png,
           * which show a live "RUBRIC SO FAR" section: product decision
           * (2026-09-12) to only reveal scores on the Review screen so
           * candidates aren't watching live numbers during the interview.
           * See architecture.md §1 and progress.md decisions log.
           */}
          <MicBadge status={mic.status} />
          <StageBadge stage={stage} />
          <Transcript messages={state.messages} />
          <div className="flex gap-2 px-5 py-4">
            <HintButton onClick={handleHint} disabled={state.hints.length >= MAX_HINT_LEVEL} />
            <EndReviewButton onClick={handleEnd} />
          </div>
        </>
      )}

      {state.status === "ended" && state.review && (
        <Review review={state.review} onRestart={handleStart} />
      )}

      {/*
       * review.ready lags session.end by however long the backend's
       * evaluator call takes — this bridges that gap rather than rendering
       * a blank panel. Reuses StatusIndicator's existing dot+label
       * convention instead of inventing a new spinner (minimal-animation
       * rule, CLAUDE.md §9).
       */}
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
