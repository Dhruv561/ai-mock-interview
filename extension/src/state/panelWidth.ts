import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useState } from "react";
import {
  clampPanelWidth,
  DEFAULT_PANEL_WIDTH_PX,
  setPanelWidth,
} from "../content/layout";
import { loadStoredWidth, storeWidth } from "./panelWidthStorage";

/**
 * Owns the interview panel's width: the persisted/default value, applying
 * it to the page-reflow margin (content/layout.ts) on every change, and a
 * pointer-drag resize gesture that clamps to [MIN_PANEL_WIDTH_PX,
 * getMaxPanelWidthPx(viewport)]. The reflow margin is updated unanimated
 * while actively dragging (so it tracks the pointer instead of lagging
 * behind by the transition's duration) and animated for the initial mount
 * and the settle-on-release. The caller still applies `width` to the
 * panel's own element style directly (see content/App.tsx).
 */
export function usePanelWidth() {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH_PX);

  useEffect(() => {
    let cancelled = false;
    void loadStoredWidth().then((stored) => {
      if (cancelled || stored === null) return;
      const clamped = clampPanelWidth(stored, window.innerWidth);
      setWidth(clamped);
      setPanelWidth(clamped, { animate: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function startResize(event: ReactPointerEvent<HTMLElement>) {
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    // Panel is anchored to the right edge, so dragging the handle left
    // (negative clientX delta) should widen it — captured once at drag
    // start rather than re-read from state on every move.
    const startPointerX = event.clientX;
    const startWidth = width;
    element.setPointerCapture(pointerId);

    function onPointerMove(moveEvent: PointerEvent) {
      const delta = startPointerX - moveEvent.clientX;
      const next = clampPanelWidth(startWidth + delta, window.innerWidth);
      setWidth(next);
      setPanelWidth(next, { animate: false });
    }

    function onPointerUp() {
      element.releasePointerCapture(pointerId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      setWidth((current) => {
        storeWidth(current);
        setPanelWidth(current, { animate: true });
        return current;
      });
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return { width, startResize };
}
