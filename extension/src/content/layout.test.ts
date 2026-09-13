import { describe, expect, it } from "vitest";
import { clampPanelWidth, getMaxPanelWidthPx, MIN_PANEL_WIDTH_PX } from "./layout";

describe("getMaxPanelWidthPx", () => {
  it("caps at the hard ceiling on a wide viewport", () => {
    expect(getMaxPanelWidthPx(2560)).toBe(720);
  });

  it("caps at a fraction of a narrow viewport instead", () => {
    expect(getMaxPanelWidthPx(1000)).toBe(600);
  });
});

describe("clampPanelWidth", () => {
  it("passes through a value already in range", () => {
    expect(clampPanelWidth(500, 1920)).toBe(500);
  });

  it("floors to MIN_PANEL_WIDTH_PX", () => {
    expect(clampPanelWidth(100, 1920)).toBe(MIN_PANEL_WIDTH_PX);
  });

  it("ceils to the hard max on a wide viewport", () => {
    expect(clampPanelWidth(10_000, 1920)).toBe(720);
  });

  it("ceils to the viewport-fraction max on a narrow viewport", () => {
    expect(clampPanelWidth(900, 1000)).toBe(600);
  });
});
