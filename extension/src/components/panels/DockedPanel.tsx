import { AudioLevelMeter } from "../AudioLevelMeter";
import { EndReviewButton } from "../EndReviewButton";
import { HintButton } from "../HintButton";
import { MuteButton } from "../MuteButton";
import { PhaseList } from "./PhaseList";
import { getLastInterviewerMessage, usePanelAudioLevels } from "./panelHelpers";
import type { PanelBodyProps } from "./PanelBodyProps";

const SCREEN_STATUS_LABEL: Record<PanelBodyProps["screenStatus"], string> = {
  idle: "Screen not shared",
  requesting: "Requesting screen…",
  active: "Screen recording",
  denied: "Screen sharing blocked",
  unsupported: "Screen recording unsupported",
};

/**
 * "Docked" (design ref 1a) — full presence: an interviewer avatar with a
 * live TTS level meter, the current question set large as "Last said", the
 * candidate's own live draft underneath it (with its own mic level meter),
 * and the full stage list. This is the default preset (state/panelLayout.ts).
 *
 * Deliberately omitted vs. the design reference: the "Clean session / no
 * paste, no tab switch" integrity block — that would still be fabricated,
 * not-evidence-based feedback (CLAUDE.md §10), regardless of whether
 * screen capture is on. What screen capture *does* give us — whether it's
 * actually running right now — gets one plain status line below (added
 * post-merge: this comment originally said Feature 12 didn't exist yet;
 * it has since landed). Also omitted: a "Hold to talk" push-to-talk
 * button — mic capture here runs continuously from session start
 * (media/microphone.ts), not per-press, so a hold-to-talk control would
 * misrepresent what actually happens. Ask-for-a-hint/Mute/End&review
 * (below) are real.
 */
export function DockedPanel({
  state,
  micStatus,
  getMicAnalyser,
  screenStatus,
  isSpeaking,
  isMuted,
  onToggleMute,
  getTtsAnalyser,
  stage,
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

  const lastInterviewerMessage = getLastInterviewerMessage(state.messages);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-dark-panel text-dark-ink">
      <div className="flex flex-col gap-4 border-b border-dark-border p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-on-dark to-emerald-800 font-mono text-[13px] text-dark-panel">
            AI
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-medium">Your interviewer</span>
            <span className="text-[12.5px] whitespace-nowrap text-dark-ink-muted">
              {isSpeaking ? "Speaking" : "Listening"}
            </span>
          </div>
          <div className="ml-auto flex flex-col items-end gap-1">
            <AudioLevelMeter levels={ttsLevels} tone="on-dark" label="Interviewer audio level" />
            <span className="font-mono text-[9.5px] tracking-wider text-dark-ink-muted uppercase">
              {SCREEN_STATUS_LABEL[screenStatus]}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10.5px] tracking-wider text-dark-ink-muted uppercase">
            Last said
          </span>
          <p className="text-[19px] leading-snug tracking-tight text-dark-ink">
            {lastInterviewerMessage
              ? `“${lastInterviewerMessage.text}”`
              : "Waiting for the interview to begin…"}
          </p>
        </div>
      </div>

      {(state.candidateDraft || micStatus === "active") && (
        <div className="flex items-center gap-3 border-b border-dark-border px-5 py-3">
          <AudioLevelMeter levels={micLevels} tone="on-dark" label="Your mic level" />
          <p className="min-w-0 flex-1 truncate text-[13px] text-dark-ink-muted italic">
            {state.candidateDraft ?? "Listening for your voice…"}
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto border-b border-dark-border p-5">
        <span className="font-mono text-[10.5px] tracking-wider text-dark-ink-muted uppercase">
          Stage
        </span>
        <div className="mt-3">
          <PhaseList stage={stage} />
        </div>
      </div>

      <div className="flex gap-2 p-5">
        <MuteButton isMuted={isMuted} onClick={onToggleMute} />
        <HintButton onClick={onHint} disabled={hintDisabled} />
        <EndReviewButton onClick={onEnd} />
      </div>
    </div>
  );
}
