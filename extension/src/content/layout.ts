// Single source of truth for the panel's reserved width, shared between the
// panel's own inline style (content/App.tsx / state/panelWidth.ts) and the
// page-reflow logic below.
export const DEFAULT_PANEL_WIDTH_PX = 420;
export const MIN_PANEL_WIDTH_PX = 320;
// Hard ceiling on how wide the panel can grow, further capped to a fraction
// of the viewport so it can never swallow the whole window on a narrow
// screen (see getMaxPanelWidthPx).
const MAX_PANEL_WIDTH_PX = 720;
const MAX_PANEL_WIDTH_VIEWPORT_FRACTION = 0.6;

export function getMaxPanelWidthPx(viewportWidthPx: number): number {
  return Math.min(MAX_PANEL_WIDTH_PX, Math.round(viewportWidthPx * MAX_PANEL_WIDTH_VIEWPORT_FRACTION));
}

/** Clamps a candidate panel width to [MIN_PANEL_WIDTH_PX, getMaxPanelWidthPx(viewportWidthPx)]. */
export function clampPanelWidth(widthPx: number, viewportWidthPx: number): number {
  const max = getMaxPanelWidthPx(viewportWidthPx);
  return Math.min(Math.max(widthPx, MIN_PANEL_WIDTH_PX), max);
}

/**
 * Sets <html>'s right margin to widthPx, so LeetCode's own (fluid) layout
 * shrinks to fit beside the panel instead of the panel floating on top of
 * it. This is the same technique other docked-sidebar extensions use
 * (e.g. Grammarly): margin on the root element shifts the initial
 * containing block that `position: fixed` elements are measured against,
 * so LeetCode's own fixed-positioned UI (nav bars, floating buttons) moves
 * with it rather than staying pinned under the panel.
 *
 * `animate: false` (used while the user is actively dragging the resize
 * handle) drops the transition so the page reflow tracks the pointer
 * instead of lagging behind it by the transition's duration.
 */
export function setPanelWidth(widthPx: number, { animate = true }: { animate?: boolean } = {}) {
  document.documentElement.style.setProperty(
    "transition",
    animate ? "margin-right 0.15s ease-out" : "none",
  );
  document.documentElement.style.setProperty("margin-right", `${widthPx}px`, "important");
}

export function reservePageSpace(widthPx: number = DEFAULT_PANEL_WIDTH_PX) {
  setPanelWidth(widthPx, { animate: true });
}

export function releasePageSpace() {
  document.documentElement.style.removeProperty("margin-right");
  document.documentElement.style.removeProperty("transition");
}
