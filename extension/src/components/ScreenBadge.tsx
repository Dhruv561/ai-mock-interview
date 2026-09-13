import type { ScreenStatus } from "../media/useScreenCapture";

const LABEL: Record<ScreenStatus, string> = {
  idle: "SCREEN OFF",
  requesting: "REQUESTING SCREEN…",
  active: "SCREEN REC",
  denied: "SCREEN BLOCKED",
  unsupported: "SCREEN UNSUPPORTED",
};

const DOT_CLASS: Record<ScreenStatus, string> = {
  idle: "bg-ink-faint",
  requesting: "bg-ink-faint animate-pulse",
  active: "bg-accent animate-pulse",
  denied: "bg-ink-faint",
  unsupported: "bg-ink-faint",
};

/**
 * Reflects real screen/tab capture state (Feature 12) — optional/best-effort
 * signal, shown only once the interview has started, mirroring MicBadge
 * exactly (same layout, palette, and monospace-uppercase label convention;
 * CLAUDE.md §9).
 */
export function ScreenBadge({ status }: { status: ScreenStatus }) {
  return (
    <div className="flex items-center gap-2 px-5 py-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]}`} aria-hidden />
      <span className="font-mono text-[10px] tracking-wider text-ink-faint">{LABEL[status]}</span>
    </div>
  );
}
