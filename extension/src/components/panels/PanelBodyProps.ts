import type { AnalyserLike } from "../../media/audioLevels";
import type { MicStatus } from "../../media/useMicrophoneCapture";
import type { ScreenStatus } from "../../media/useScreenCapture";
import type { InterviewStage } from "../../networking/useInterviewStage";
import type { InterviewUIState } from "../../state/types";

/** Shared data/actions all three panel-layout presets render from — same
 * real state and handlers, arranged differently per components/panels/*. */
export interface PanelBodyProps {
  state: InterviewUIState;
  micStatus: MicStatus;
  getMicAnalyser: () => AnalyserLike | null;
  // Added post-merge (Feature 12 landed after this design work did — see
  // DockedPanel.tsx's comment): only SplitPanel surfaces it today.
  screenStatus: ScreenStatus;
  isSpeaking: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  getTtsAnalyser: () => AnalyserLike | null;
  stage: InterviewStage | null;
  onHint: () => void;
  hintDisabled: boolean;
  onEnd: () => void;
}
