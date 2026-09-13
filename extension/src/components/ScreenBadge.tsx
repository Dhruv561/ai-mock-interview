import type { ScreenStatus } from "../media/useScreenCapture";
import { StatusDot } from "./StatusDot";

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
  return <StatusDot label={LABEL[status]} toneClass={DOT_CLASS[status]} />;
}
