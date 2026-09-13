import type { AnalyserLike } from "../../media/audioLevels";
import type { MicStatus } from "../../media/useMicrophoneCapture";
import type { InterviewStage } from "../../networking/useInterviewStage";
import type { InterviewUIState } from "../../state/types";

/** Shared data/actions all three panel-layout presets render from — same
 * real state and handlers, arranged differently per components/panels/*. */
export interface PanelBodyProps {
  state: InterviewUIState;
  micStatus: MicStatus;
  getMicAnalyser: () => AnalyserLike | null;
  isSpeaking: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  getTtsAnalyser: () => AnalyserLike | null;
  stage: InterviewStage | null;
  onHint: () => void;
  hintDisabled: boolean;
  onEnd: () => void;
}
