import type { MicStatus } from "../media/useMicrophoneCapture";

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
  return (
    <div className="flex items-center gap-2 px-5 py-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[status]}`} aria-hidden />
      <span className="font-mono text-[10px] tracking-wider text-ink-faint">{LABEL[status]}</span>
    </div>
  );
}
