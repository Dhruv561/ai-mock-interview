import type { MicStatus } from "../media/useMicrophoneCapture";
import { StatusDot } from "./StatusDot";

const LABEL: Record<MicStatus, string> = {
  idle: "MIC OFF",
  requesting: "REQUESTING MIC…",
  active: "MIC ON",
  denied: "MIC BLOCKED",
  unsupported: "MIC UNSUPPORTED",
};

const DOT_CLASS: Record<MicStatus, string> = {
  idle: "bg-ink-faint",
  requesting: "bg-ink-faint animate-pulse",
  active: "bg-accent animate-pulse",
  denied: "bg-ink-faint",
  unsupported: "bg-ink-faint",
};

/** Reflects real mic capture state (Feature 05) — shown only once the interview has started, since idle beforehand would just be clutter. */
export function MicBadge({ status }: { status: MicStatus }) {
  return <StatusDot label={LABEL[status]} toneClass={DOT_CLASS[status]} />;
}
