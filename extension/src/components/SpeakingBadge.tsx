import { StatusDot } from "./StatusDot";

/**
 * Reflects live interviewer TTS playback (Feature 10, architecture.md §M) —
 * same small dot+label convention as MicBadge, shown only once the
 * interview has started (mirrors MicBadge's own reasoning for why idle
 * beforehand would just be clutter).
 */
export function SpeakingBadge({ isSpeaking }: { isSpeaking: boolean }) {
  return (
    <StatusDot
      label={isSpeaking ? "INTERVIEWER SPEAKING" : "INTERVIEWER SILENT"}
      toneClass={isSpeaking ? "bg-accent animate-pulse" : "bg-ink-faint"}
    />
  );
}
