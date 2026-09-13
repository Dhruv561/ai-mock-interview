import { useAudioLevels } from "../../media/useAudioLevels";
import type { TranscriptMessage } from "../../state/types";
import type { PanelBodyProps } from "./PanelBodyProps";

/**
 * Most recent interviewer message, or undefined before the interviewer has
 * said anything yet.
 */
export function getLastInterviewerMessage(
  messages: TranscriptMessage[],
): TranscriptMessage | undefined {
  return [...messages].reverse().find((m) => m.speaker === "interviewer");
}

/**
 * The TTS/mic useAudioLevels() pair DockedPanel calls to drive its two
 * level meters.
 */
export function usePanelAudioLevels(
  props: Pick<PanelBodyProps, "getTtsAnalyser" | "isSpeaking" | "getMicAnalyser" | "micStatus">,
): { ttsLevels: number[]; micLevels: number[] } {
  const ttsLevels = useAudioLevels(props.getTtsAnalyser, props.isSpeaking);
  const micLevels = useAudioLevels(props.getMicAnalyser, props.micStatus === "active");
  return { ttsLevels, micLevels };
}
