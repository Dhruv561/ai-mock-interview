import type { TranscriptMessage } from "../state/types";

function speakerLabel(speaker: TranscriptMessage["speaker"]): string {
  return speaker === "interviewer" ? "INTERVIEWER" : "YOU";
}

function formatClock(elapsedSeconds: number): string {
  const m = Math.floor(elapsedSeconds / 60);
  const s = Math.floor(elapsedSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The most recent interviewer message is always rendered as the visually
 * prominent "current question" card, separate from the plain history above
 * it — this is a product requirement (PRD §3.3, §12), not a style choice.
 */
export function Transcript({ messages }: { messages: TranscriptMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 px-5 py-6 text-sm text-ink-faint">
        Waiting for the interview to begin…
      </div>
    );
  }

  const last = messages[messages.length - 1];
  const hasCurrentQuestion = last.speaker === "interviewer";
  const history = hasCurrentQuestion ? messages.slice(0, -1) : messages;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
      {history.map((message) => (
        <div key={message.id}>
          <div className="font-mono text-[11px] tracking-wider text-ink-faint">
            {speakerLabel(message.speaker)} · {formatClock(message.elapsedSeconds)}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink">{message.text}</p>
        </div>
      ))}

      {hasCurrentQuestion && (
        <div className="rounded-lg border border-panel-border bg-card-bg p-4 shadow-sm">
          <div className="font-mono text-[11px] tracking-wider text-ink-faint">
            INTERVIEWER · NOW
          </div>
          <p className="mt-2 text-base leading-relaxed text-ink">
            &ldquo;{last.text}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
