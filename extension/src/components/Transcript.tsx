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
 *
 * `candidateDraft` (state.candidateDraft, fed by transcript.partial — see
 * liveInterviewEngine.ts) renders below the rest as a live, in-place-
 * updating line so the candidate sees their own speech land in real time
 * instead of only once the utterance is finished. `tone` lets the same
 * component sit inside a dark-panel layout preset (docked/floating) without
 * duplicating this logic per layout.
 */
export function Transcript({
  messages,
  candidateDraft = null,
  tone = "light",
}: {
  messages: TranscriptMessage[];
  candidateDraft?: string | null;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";

  if (messages.length === 0 && !candidateDraft) {
    return (
      <div className={`flex-1 px-5 py-6 text-sm ${dark ? "text-dark-ink-muted" : "text-ink-faint"}`}>
        Waiting for the interview to begin…
      </div>
    );
  }

  const last = messages[messages.length - 1];
  const hasCurrentQuestion = last?.speaker === "interviewer";
  const history = hasCurrentQuestion ? messages.slice(0, -1) : messages;

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
      {history.map((message) => (
        <div key={message.id} className="animate-message-pop">
          <div
            className={`font-mono text-[11px] tracking-wider ${dark ? "text-dark-ink-muted" : "text-ink-faint"}`}
          >
            {speakerLabel(message.speaker)} · {formatClock(message.elapsedSeconds)}
          </div>
          <p className={`mt-1 text-sm leading-relaxed ${dark ? "text-dark-ink" : "text-ink"}`}>
            {message.text}
          </p>
        </div>
      ))}

      {hasCurrentQuestion && (
        <div
          className={`animate-message-pop rounded-lg border p-4 shadow-sm ${
            dark
              ? "border-dark-border bg-black/20"
              : "border-panel-border bg-card-bg"
          }`}
        >
          <div
            className={`font-mono text-[11px] tracking-wider ${dark ? "text-accent-on-dark" : "text-ink-faint"}`}
          >
            INTERVIEWER · NOW
          </div>
          <p className={`mt-2 text-base leading-relaxed ${dark ? "text-dark-ink" : "text-ink"}`}>
            &ldquo;{last.text}&rdquo;
          </p>
        </div>
      )}

      {candidateDraft && (
        <div className="animate-message-pop">
          <div
            className={`font-mono text-[11px] tracking-wider ${dark ? "text-dark-ink-muted" : "text-ink-faint"}`}
          >
            YOU · NOW
          </div>
          <p
            className={`mt-1 text-sm italic leading-relaxed ${dark ? "text-dark-ink-muted" : "text-ink-muted"}`}
          >
            {candidateDraft}
            <span className="ml-0.5 inline-block animate-pulse">▍</span>
          </p>
        </div>
      )}
    </div>
  );
}
