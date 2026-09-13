/**
 * Toggles interviewer TTS playback muting (Feature 10). Secondary/outlined
 * style matching EndReviewButton — this is a control, not the primary
 * action in the row. No persistence across reloads; in-session only.
 */
export function MuteButton({
  isMuted,
  onClick,
}: {
  isMuted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isMuted}
      className="shrink-0 rounded-md border border-panel-border bg-card-bg px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-panel-bg"
    >
      {isMuted ? "Unmute" : "Mute"}
    </button>
  );
}
