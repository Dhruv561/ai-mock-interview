import { PANEL_LAYOUT_OPTIONS, type PanelLayout } from "../state/panelLayout";

/**
 * Lets the candidate compare the three panel presets live, in place, rather
 * than picking blind from a settings screen — a same-session comparison
 * tool (state/panelLayout.ts), not a persisted preference.
 */
export function LayoutSwitcher({
  value,
  onChange,
}: {
  value: PanelLayout;
  onChange: (layout: PanelLayout) => void;
}) {
  return (
    <div
      className="flex gap-0.5 rounded-md border border-panel-border bg-panel-bg p-0.5"
      role="group"
      aria-label="Panel layout"
    >
      {PANEL_LAYOUT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded px-2 py-1 font-mono text-[10px] tracking-wider uppercase transition ${
            value === option.value
              ? "bg-ink text-white"
              : "text-ink-faint hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
