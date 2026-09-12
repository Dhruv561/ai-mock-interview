import type { ConnectionState } from "../networking/websocket";

const LABEL: Record<ConnectionState, string> = {
  connecting: "CONNECTING…",
  open: "BACKEND CONNECTED",
  reconnecting: "RECONNECTING…",
  closed: "BACKEND OFFLINE",
};

const DOT_CLASS: Record<ConnectionState, string> = {
  connecting: "bg-ink-faint animate-pulse",
  open: "bg-accent",
  reconnecting: "bg-ink-faint animate-pulse",
  closed: "bg-ink-faint",
};

/**
 * Reflects the raw WS transport state only (Feature 06) — independent of
 * state/interviewStore's mock-driven session status, which still powers the
 * demo UI until Features 07/08 replace it with real server events.
 */
export function ConnectionBadge({ state }: { state: ConnectionState }) {
  return (
    <div className="flex items-center gap-2 border-b border-panel-border px-5 py-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[state]}`} aria-hidden />
      <span className="font-mono text-[10px] tracking-wider text-ink-faint">{LABEL[state]}</span>
    </div>
  );
}
