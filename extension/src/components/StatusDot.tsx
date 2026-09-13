/**
 * Shared dot+label primitive behind MicBadge/ScreenBadge/SpeakingBadge/
 * ConnectionBadge — those four repeated this exact markup verbatim, each
 * with their own status->label/tone maps (Feature 20 cleanup). StageBadge
 * is deliberately not built on this: it has no dot, just a label.
 */
export function StatusDot({
  label,
  toneClass,
  className = "",
}: {
  label: string;
  toneClass: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-5 py-1.5 ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${toneClass}`} aria-hidden />
      <span className="font-mono text-[10px] tracking-wider text-ink-faint">{label}</span>
    </div>
  );
}
