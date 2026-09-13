import type { SessionStatus } from "../state/types";
import { formatElapsed } from "../utils/format";

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: "NOT STARTED",
  recording: "RECORDING",
  ended: "COMPLETE",
};

const STATUS_DOT_CLASS: Record<SessionStatus, string> = {
  idle: "bg-ink-faint",
  recording: "bg-accent animate-pulse",
  ended: "bg-accent",
};

export function StatusIndicator({
  status,
  elapsedSeconds,
}: {
  status: SessionStatus;
  elapsedSeconds: number;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-panel-border">
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[status]}`}
          aria-hidden
        />
        <span className="font-mono text-[11px] tracking-wider text-ink-muted">
          {STATUS_LABEL[status]}
        </span>
      </div>
      {status !== "idle" && (
        <span className="font-mono text-sm text-ink tabular-nums">
          {formatElapsed(elapsedSeconds)}
        </span>
      )}
    </div>
  );
}
