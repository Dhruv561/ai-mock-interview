import { STAGE_LABELS, STAGE_ORDER } from "../stageInfo";
import type { InterviewStage } from "../../networking/useInterviewStage";

/**
 * The docked layout's (1a) phase list. The design reference shows a
 * per-phase elapsed time next to each row — we don't track stage-entry
 * timestamps anywhere in state (useInterviewStage.ts only reports the
 * *current* stage), so inventing times per phase would be exactly the
 * fabricated, non-evidence-based feedback CLAUDE.md §10 rules out. This
 * shows real progress (which stages are behind/current/ahead) without a
 * time column.
 */
export function PhaseList({ stage }: { stage: InterviewStage | null }) {
  const activeIndex = stage ? STAGE_ORDER.indexOf(stage) : -1;

  return (
    <div className="flex flex-col gap-2.5">
      {STAGE_ORDER.map((s, i) => {
        const isCurrent = i === activeIndex;
        const isPast = activeIndex >= 0 && i < activeIndex;
        return (
          <div key={s} className="flex items-center gap-2.5">
            <span
              className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                isCurrent
                  ? "bg-accent-on-dark"
                  : isPast
                    ? "bg-dark-ink-muted"
                    : "bg-dark-border"
              }`}
            />
            <span
              className={`text-sm ${isCurrent ? "text-dark-ink" : "text-dark-ink-muted"}`}
            >
              {STAGE_LABELS[s]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
