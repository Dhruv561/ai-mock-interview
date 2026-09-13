import { formatElapsed } from "../../utils/format";
import { AudioLevelMeter } from "../AudioLevelMeter";
import { EndReviewButton } from "../EndReviewButton";
import { HintButton } from "../HintButton";
import { MuteButton } from "../MuteButton";
import { Rubric } from "../Rubric";
import { STAGE_LABELS } from "../stageInfo";
import { getLastInterviewerMessage, usePanelAudioLevels } from "./panelHelpers";
import type { PanelBodyProps } from "./PanelBodyProps";

/**
 * "Floating" (design ref 1b) — the minimal posture: just the current
 * exchange as chat-style bubbles, plus one control pill. This body renders
 * inside a bottom-anchored overlay bar (content/App.tsx's `PanelShell`,
 * revisited 2026-09-13), not the docked panel's reserved right-side column
 * — matching the design reference, which floats this above the code rather
 * than pinning it into the sidebar. See architecture.md's panel-shell note
 * for why the outer shell (not just this body) has to switch per layout.
 *
 * Geometry pulled from the actual design source (`Interview Sidebar.dc.html`
 * §1b, re-imported 2026-09-13 once design-system auth was available): the
 * message bubble and control pill are two independently-floating pieces
 * (own shadow/blur each), not one shared card — centered, max 640px wide,
 * fully pill-shaped (`rounded-full`, not `rounded-2xl`), the control pill a
 * fixed 60px tall.
 */
export function FloatingPanel({
  state,
  micStatus,
  getMicAnalyser,
  isSpeaking,
  isMuted,
  onToggleMute,
  getTtsAnalyser,
  stage,
  liveRubric,
  onHint,
  hintDisabled,
  onEnd,
}: PanelBodyProps) {
  const { ttsLevels, micLevels } = usePanelAudioLevels({
    getTtsAnalyser,
    isSpeaking,
    getMicAnalyser,
    micStatus,
  });
  const activeLevels = isSpeaking ? ttsLevels : micLevels;

  const lastInterviewerMessage = getLastInterviewerMessage(state.messages);

  return (
    // No shared card here either — matches the design's two independently
    // floating pieces (message bubble, control pill), just centered and
    // stacked with its 10px gap, not stretched full-height.
    <div className="flex w-full flex-col items-center gap-2.5">
      {lastInterviewerMessage && (
        <div className="animate-message-pop max-w-160 rounded-full bg-ink/90 px-4 py-2.5 text-center text-[14.5px] leading-snug text-white backdrop-blur">
          &ldquo;{lastInterviewerMessage.text}&rdquo;
        </div>
      )}

      {state.candidateDraft && (
        <div className="animate-message-pop max-w-160 rounded-full border border-panel-border bg-card-bg px-4 py-2 text-center text-[13px] leading-snug text-ink-muted italic">
          {state.candidateDraft}
        </div>
      )}

      <div className="flex h-15 flex-wrap items-center gap-3.5 rounded-full border border-panel-border bg-card-bg py-2.5 pr-2.5 pl-4.5 shadow-xl">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${state.status === "recording" ? "bg-accent animate-pulse" : "bg-ink-faint"}`}
            aria-hidden
          />
          <span className="font-mono text-[13px] tabular-nums text-ink">
            {formatElapsed(state.elapsedSeconds)}
          </span>
        </div>
        <div className="h-6.5 w-px bg-panel-border" />
        <span className="text-[13px] whitespace-nowrap text-ink-muted">
          {stage ? STAGE_LABELS[stage] : "—"}
        </span>
        <div className="h-6.5 w-px bg-panel-border" />
        <AudioLevelMeter levels={activeLevels} label="Current speaker audio level" />

        <div className="ml-auto flex gap-2">
          <MuteButton isMuted={isMuted} onClick={onToggleMute} />
          <HintButton onClick={onHint} disabled={hintDisabled} />
          <EndReviewButton onClick={onEnd} />
        </div>
      </div>

      {liveRubric && (
        <div className="w-full max-w-160 rounded-2xl border border-panel-border bg-card-bg px-5 py-4 shadow-lg">
          <Rubric rubric={liveRubric} label="LIVE RUBRIC PREVIEW" />
        </div>
      )}
    </div>
  );
}
