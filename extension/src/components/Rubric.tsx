import {
  RUBRIC_CATEGORIES,
  RUBRIC_LABELS,
  RUBRIC_MAX,
  type RubricState,
} from "../state/types";

export function Rubric({ rubric }: { rubric: RubricState }) {
  return (
    <div className="border-t border-panel-border px-5 py-4">
      <div className="mb-3 font-mono text-[11px] tracking-wider text-ink-faint">
        RUBRIC SO FAR
      </div>
      <div className="space-y-2.5">
        {RUBRIC_CATEGORIES.map((category) => {
          const value = rubric[category];
          const pct = (value / RUBRIC_MAX) * 100;
          return (
            <div key={category} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm text-ink">
                {RUBRIC_LABELS[category]}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
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
    </div>
  );
}
