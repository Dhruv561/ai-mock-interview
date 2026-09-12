// Single source of truth for the panel's reserved width, shared between the
// panel's own CSS (content/App.tsx) and the page-reflow logic below.
export const PANEL_WIDTH_PX = 420;

/**
 * Reserves PANEL_WIDTH_PX of horizontal space on the right edge of the
 * viewport by adding margin to <html>, so LeetCode's own (fluid) layout
 * shrinks to fit beside the panel instead of the panel floating on top of
 * it. This is the same technique other docked-sidebar extensions use
 * (e.g. Grammarly): margin on the root element shifts the initial
 * containing block that `position: fixed` elements are measured against,
 * so LeetCode's own fixed-positioned UI (nav bars, floating buttons) moves
 * with it rather than staying pinned under the panel.
 */
export function reservePageSpace() {
  document.documentElement.style.setProperty(
    "margin-right",
    `${PANEL_WIDTH_PX}px`,
    "important",
  );
  document.documentElement.style.setProperty(
    "transition",
    "margin-right 0.15s ease-out",
  );
}

export function releasePageSpace() {
  document.documentElement.style.removeProperty("margin-right");
  document.documentElement.style.removeProperty("transition");
}
