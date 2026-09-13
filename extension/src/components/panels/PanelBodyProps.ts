import type { AnalyserLike } from "../../media/audioLevels";
import type { MicStatus } from "../../media/useMicrophoneCapture";
import type { ScreenStatus } from "../../media/useScreenCapture";
import type { InterviewStage } from "../../networking/useInterviewStage";
import type { InterviewUIState, RubricState } from "../../state/types";

/** Shared data/actions DockedPanel renders from. */
export interface PanelBodyProps {
  state: InterviewUIState;
  micStatus: MicStatus;
  getMicAnalyser: () => AnalyserLike | null;
  screenStatus: ScreenStatus;
  isSpeaking: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  getTtsAnalyser: () => AnalyserLike | null;
  stage: InterviewStage | null;
  liveRubric: RubricState | null;
  onHint: () => void;
  hintDisabled: boolean;
  onEnd: () => void;
}
