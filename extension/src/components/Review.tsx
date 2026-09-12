import {
  RUBRIC_CATEGORIES,
  RUBRIC_LABELS,
  RUBRIC_MAX,
  type FinalReview,
} from "../state/types";
import { formatElapsed } from "../utils/format";

export function Review({
  review,
  onRestart,
}: {
  review: FinalReview;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="space-y-6 px-5 py-5">
        <div>
          <div className="text-xs text-ink-faint">Overall</div>
          <div className="text-3xl font-semibold text-ink">
            {review.overallScore.toFixed(1)}
            <span className="text-base font-normal text-ink-faint"> / 10</span>
          </div>
        </div>

        <div className="space-y-2.5">
          {RUBRIC_CATEGORIES.map((category) => {
            const value = review.rubric[category];
            const pct = (value / RUBRIC_MAX) * 100;
            return (
              <div key={category} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-ink">
                  {RUBRIC_LABELS[category]}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-xs text-ink-faint">
                  {value}/{RUBRIC_MAX}
                </span>
              </div>
            );
          })}
        </div>

        <div>
          <div className="mb-2 font-mono text-[11px] tracking-wider text-ink-faint">
            WHAT YOU DID WELL
          </div>
          <ul className="space-y-1.5">
            {review.strengths.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-ink">
                <span className="text-accent">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 font-mono text-[11px] tracking-wider text-ink-faint">
            WORK ON
          </div>
          <ul className="space-y-1.5">
            {review.areasToImprove.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-ink">
                <span className="text-ink-faint">⚠</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 font-mono text-[11px] tracking-wider text-ink-faint">
            TIMELINE
          </div>
          <ul className="space-y-1.5">
            {review.timeline.map((event) => (
              <li key={event.label} className="flex justify-between text-sm">
                <span className="text-ink">{event.label}</span>
                <span className="font-mono text-xs text-ink-faint">
                  {formatElapsed(event.elapsedSeconds)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-auto border-t border-panel-border px-5 py-4">
        <button
          type="button"
          onClick={onRestart}
          className="w-full rounded-md border border-panel-border bg-card-bg px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-panel-bg"
        >
          Start a new interview
        </button>
      </div>
    </div>
  );
}
