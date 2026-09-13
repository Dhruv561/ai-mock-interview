import { AudioLevelMeter } from "../AudioLevelMeter";
import { EndReviewButton } from "../EndReviewButton";
import { HintButton } from "../HintButton";
import { MicBadge } from "../MicBadge";
import { MuteButton } from "../MuteButton";
import { ScreenBadge } from "../ScreenBadge";
import { SpeakingBadge } from "../SpeakingBadge";
import { StageBadge } from "../StageBadge";
import { Rubric } from "../Rubric";
import { Transcript } from "../Transcript";
import { usePanelAudioLevels } from "./panelHelpers";
import type { PanelBodyProps } from "./PanelBodyProps";

/**
 * "Split" (design ref 1c) — the coaching-column posture: full scrolling
 * transcript with badges above it. This is closest to what the panel
 * already was before this feature, plus the two additions every preset
 * gets: the live candidate draft (Transcript's candidateDraft prop) and a
 * small real level meter next to each badge instead of just a status dot.
 *
 * Deliberately not restored here: the design reference's live "Rubric so
 * far" section. Showing rubric scores during the interview (rather than
 * only on the Review screen) was a deliberate product decision — see
 * InterviewPanel.tsx's comment, architecture.md §1, progress.md — that a
 * design exploration doesn't override on its own, and it's Feature 13's
 * job if that decision changes.
 */
export function SplitPanel({
  state,
  micStatus,
  getMicAnalyser,
  screenStatus,
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

  return (
    <>
      <div className="flex items-center justify-between px-5 py-1.5">
        <MicBadge status={micStatus} />
        <AudioLevelMeter levels={micLevels} label="Your mic level" />
      </div>
      <ScreenBadge status={screenStatus} />
      <div className="flex items-center justify-between px-5 py-1.5">
        <SpeakingBadge isSpeaking={isSpeaking} />
        <AudioLevelMeter levels={ttsLevels} label="Interviewer audio level" />
      </div>
      <StageBadge stage={stage} />
      {liveRubric && <div className="px-5 py-2"><Rubric rubric={liveRubric} label="LIVE RUBRIC PREVIEW" /></div>}
      <Transcript messages={state.messages} candidateDraft={state.candidateDraft} />
      <div className="flex gap-2 px-5 py-4">
        <MuteButton isMuted={isMuted} onClick={onToggleMute} />
        <HintButton onClick={onHint} disabled={hintDisabled} />
        <EndReviewButton onClick={onEnd} />
      </div>
    </>
  );
}
