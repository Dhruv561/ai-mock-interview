import { useAudioLevels } from "../../media/useAudioLevels";
import type { TranscriptMessage } from "../../state/types";
import type { PanelBodyProps } from "./PanelBodyProps";

/**
 * Most recent interviewer message, or undefined before the interviewer has
 * said anything yet. DockedPanel and FloatingPanel both derived this
 * identically inline (Feature 20 cleanup).
 */
export function getLastInterviewerMessage(
  messages: TranscriptMessage[],
): TranscriptMessage | undefined {
  return [...messages].reverse().find((m) => m.speaker === "interviewer");
}

/**
 * The TTS/mic useAudioLevels() pair every panel preset calls — all three
 * tap the same two analysers the same way, just lay the resulting meters
 * out differently (Feature 20 cleanup: previously duplicated verbatim in
 * DockedPanel/FloatingPanel/SplitPanel).
 */
export function usePanelAudioLevels(
  props: Pick<PanelBodyProps, "getTtsAnalyser" | "isSpeaking" | "getMicAnalyser" | "micStatus">,
): { ttsLevels: number[]; micLevels: number[] } {
  const ttsLevels = useAudioLevels(props.getTtsAnalyser, props.isSpeaking);
  const micLevels = useAudioLevels(props.getMicAnalyser, props.micStatus === "active");
  return { ttsLevels, micLevels };
}
