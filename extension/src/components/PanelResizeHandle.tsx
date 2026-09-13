import type { PointerEvent as ReactPointerEvent } from "react";

interface PanelResizeHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Drag affordance on the panel's left edge, styled like the resize handle
 * on Chrome's own built-in side panel: invisible at rest, a thin accent
 * line on hover/drag so it doesn't compete with the panel's own borders
 * (CLAUDE.md UI principles — restrained palette, thin borders).
 */
export function PanelResizeHandle({ onPointerDown }: PanelResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize interview panel"
      onPointerDown={onPointerDown}
      className="group absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize touch-none select-none"
    >
      <div className="h-full w-px bg-transparent group-hover:bg-accent group-active:bg-accent" />
    </div>
  );
}
