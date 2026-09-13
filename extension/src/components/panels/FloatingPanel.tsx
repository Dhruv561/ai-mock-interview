import { useAudioLevels } from "../../media/useAudioLevels";
import { formatElapsed } from "../../utils/format";
import { AudioLevelMeter } from "../AudioLevelMeter";
import { EndReviewButton } from "../EndReviewButton";
import { HintButton } from "../HintButton";
import { MuteButton } from "../MuteButton";
import { STAGE_LABELS } from "../stageInfo";
import type { PanelBodyProps } from "./PanelBodyProps";

/**
 * "Floating" (design ref 1b) — the minimal posture: just the current
 * exchange as chat-style bubbles, plus one control pill. The design
 * reference floats this as a full-viewport-width overlay outside the
 * docked column; here it stays inside the panel's existing reserved
 * 420px-wide column (content/layout.ts) instead of introducing a second,
 * page-width overlay/reflow mode — one page-space model, not two, per
 * CLAUDE.md's "keep the architecture simple".
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
  onHint,
  hintDisabled,
  onEnd,
}: PanelBodyProps) {
  const ttsLevels = useAudioLevels(getTtsAnalyser, isSpeaking);
  const micLevels = useAudioLevels(getMicAnalyser, micStatus === "active");
  const activeLevels = isSpeaking ? ttsLevels : micLevels;

  const lastInterviewerMessage = [...state.messages].reverse().find((m) => m.speaker === "interviewer");

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 bg-panel-bg p-4">
      {lastInterviewerMessage && (
        <div className="animate-message-pop self-center rounded-2xl bg-ink/90 px-4 py-2.5 text-center text-[14px] leading-snug text-white backdrop-blur">
          &ldquo;{lastInterviewerMessage.text}&rdquo;
        </div>
      )}

      {state.candidateDraft && (
        <div className="animate-message-pop self-center rounded-2xl border border-panel-border bg-card-bg px-4 py-2 text-center text-[13px] leading-snug text-ink-muted italic">
          {state.candidateDraft}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-full border border-panel-border bg-card-bg px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${state.status === "recording" ? "bg-accent animate-pulse" : "bg-ink-faint"}`}
            aria-hidden
          />
          <span className="font-mono text-[13px] tabular-nums text-ink">
            {formatElapsed(state.elapsedSeconds)}
          </span>
        </div>
        <div className="h-6 w-px bg-panel-border" />
        <span className="text-[13px] whitespace-nowrap text-ink-muted">
          {stage ? STAGE_LABELS[stage] : "—"}
        </span>
        <div className="h-6 w-px bg-panel-border" />
        <AudioLevelMeter levels={activeLevels} label="Current speaker audio level" />

        <div className="ml-auto flex gap-2">
          <MuteButton isMuted={isMuted} onClick={onToggleMute} />
          <HintButton onClick={onHint} disabled={hintDisabled} />
          <EndReviewButton onClick={onEnd} />
        </div>
      </div>
    </div>
  );
}
