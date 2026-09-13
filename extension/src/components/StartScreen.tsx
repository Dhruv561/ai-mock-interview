export type MicBlockedReason = "denied" | "unsupported";

const BLOCKED_MESSAGE: Record<MicBlockedReason, string> = {
  denied:
    "Microphone access was blocked. Allow microphone access for this site in your browser's address-bar permissions, then try again.",
  unsupported:
    "This browser doesn't support the audio recording format this extension needs, so the interview can't start.",
};

/**
 * PRD §14 ("Microphone failure"): "Show a clear message and prevent
 * starting the interview if audio is essential to the chosen mode" — mic
 * is required in the MVP's only mode (architecture.md §V), so a denied/
 * unsupported mic blocks Start entirely rather than silently starting a
 * mic-less session, unlike screen-capture denial (which is genuinely
 * optional and always degrades gracefully instead).
 */
export function StartScreen({
  onStart,
  micBlockedReason,
}: {
  onStart: () => void;
  micBlockedReason?: MicBlockedReason;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="font-mono text-[11px] tracking-wider text-ink-faint">
        AI MOCK INTERVIEW
      </div>
      <p className="max-w-[26ch] text-sm text-ink-muted">
        Starting records your microphone and reads the code editor on this
        page. You can pause or end at any time.
      </p>
      {micBlockedReason && (
        <p
          role="alert"
          className="max-w-[30ch] rounded-md border border-panel-border bg-card-bg px-3 py-2 text-xs text-ink-muted"
        >
          {BLOCKED_MESSAGE[micBlockedReason]}
        </p>
      )}
      <button
        type="button"
        onClick={onStart}
        className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
      >
        {micBlockedReason ? "Try Again" : "Start AI Interview"}
      </button>
    </div>
  );
}
