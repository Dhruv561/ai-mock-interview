import { useState } from "react";

// Three interview-panel presets explored in the "Interview Sidebar" design
// (Claude Design canvas, imported 2026-09-13): docked (1a, full presence —
// avatar, big last-said line, phase list), floating (1b, a minimal bottom
// bar), split (1c, a scrolling transcript + rubric-shaped column — closest
// to what was already built). All three read the same real interview
// state; this only controls how it's arranged. Not persisted — it's a
// same-session comparison tool, not a saved preference.
export type PanelLayout = "docked" | "floating" | "split";

export const PANEL_LAYOUT_OPTIONS: Array<{ value: PanelLayout; label: string }> = [
  { value: "docked", label: "Docked" },
  { value: "floating", label: "Floating" },
  { value: "split", label: "Split" },
];

// "docked" most literally matches CLAUDE.md's "persistent right-side
// interview panel, full presence" framing of the three.
export const DEFAULT_PANEL_LAYOUT: PanelLayout = "docked";

export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(DEFAULT_PANEL_LAYOUT);
  return { layout, setLayout };
}
