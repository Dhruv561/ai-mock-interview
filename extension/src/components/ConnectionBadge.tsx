import type { ConnectionState } from "../networking/websocket";
import { StatusDot } from "./StatusDot";

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
    <StatusDot
      label={LABEL[state]}
      toneClass={DOT_CLASS[state]}
      className="border-b border-panel-border"
    />
  );
}
