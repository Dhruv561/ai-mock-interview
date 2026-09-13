import type { EvidenceItem, FinalReview, ReviewPoint } from "../state/types";
import { formatElapsed } from "../utils/format";
import { Rubric } from "./Rubric";

// Evidence is the entire point of an evidence-based review (CLAUDE.md §10)
// — a strength/area bullet with no visible citation is just an assertion.
// Resolved once per render via a Map, not per bullet: evidence lists can
// grow to dozens of entries across a full interview.
function resolveEvidence(
  ids: string[],
  evidenceById: Map<string, EvidenceItem>,
): EvidenceItem[] {
  return ids
    .map((id) => evidenceById.get(id))
    .filter((item): item is EvidenceItem => item !== undefined);
}

/**
 * One strength/area-to-improve bullet plus its resolved evidence, shown as a
 * muted secondary line underneath (same text-ink-faint/small-font treatment
 * as the timeline's timestamps and the badges' labels elsewhere in this
 * panel). An id that doesn't resolve (shouldn't happen — finalReviewSchema's
 * refine guarantees it server-side — but defended anyway per "no silent
 * fallbacks that hide errors") is simply dropped from the citation rather
 * than crashing the render.
 */
function ReviewPointItem({
  point,
  evidenceById,
  marker,
  markerClassName,
}: {
  point: ReviewPoint;
  evidenceById: Map<string, EvidenceItem>;
  marker: string;
  markerClassName: string;
}) {
  const [firstEvidence, ...restEvidence] = resolveEvidence(point.evidenceIds, evidenceById);

  return (
    <li>
      <div className="flex gap-2 text-sm text-ink">
        <span className={markerClassName}>{marker}</span>
        <span>{point.text}</span>
      </div>
      {firstEvidence && (
        <div className="pl-5 text-xs text-ink-faint">
          &mdash; &ldquo;{firstEvidence.text}&rdquo;
          {restEvidence.length > 0 && ` (+${restEvidence.length} more)`}
        </div>
      )}
    </li>
  );
}

export function Review({
  review,
  onRestart,
}: {
  review: FinalReview;
  onRestart: () => void;
}) {
  const evidenceById = new Map(review.evidence.map((item) => [item.id, item]));

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

        <Rubric rubric={review.rubric} label="RUBRIC BREAKDOWN" />

        <div>
          <div className="mb-2 font-mono text-[11px] tracking-wider text-ink-faint">
            WHAT YOU DID WELL
          </div>
          <ul className="space-y-2">
            {review.strengths.map((point, index) => (
              <ReviewPointItem
                key={index}
                point={point}
                evidenceById={evidenceById}
                marker="✓"
                markerClassName="text-accent"
              />
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 font-mono text-[11px] tracking-wider text-ink-faint">
            WORK ON
          </div>
          <ul className="space-y-2">
            {review.areasToImprove.map((point, index) => (
              <ReviewPointItem
                key={index}
                point={point}
                evidenceById={evidenceById}
                marker="⚠"
                markerClassName="text-ink-faint"
              />
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 font-mono text-[11px] tracking-wider text-ink-faint">
            TIMELINE
          </div>
          <ul className="space-y-1.5">
            {review.timeline.map((event, index) => (
              <li key={index} className="flex justify-between text-sm">
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
