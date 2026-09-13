/**
 * Reflects live interviewer TTS playback (Feature 10, architecture.md §M) —
 * same small dot+label convention as MicBadge, shown only once the
 * interview has started (mirrors MicBadge's own reasoning for why idle
 * beforehand would just be clutter).
 */
export function SpeakingBadge({ isSpeaking }: { isSpeaking: boolean }) {
  return (
    <div className="flex items-center gap-2 px-5 py-1.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${isSpeaking ? "bg-accent animate-pulse" : "bg-ink-faint"}`}
        aria-hidden
      />
      <span className="font-mono text-[10px] tracking-wider text-ink-faint">
        {isSpeaking ? "INTERVIEWER SPEAKING" : "INTERVIEWER SILENT"}
      </span>
    </div>
  );
}
