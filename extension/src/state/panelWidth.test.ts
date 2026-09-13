import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PANEL_WIDTH_PX } from "../content/layout";
import * as storage from "./panelWidthStorage";
import { usePanelWidth } from "./panelWidth";

vi.mock("./panelWidthStorage");

function fakePointerDownEvent(clientX: number) {
  const element = document.createElement("div");
  element.setPointerCapture = vi.fn();
  element.releasePointerCapture = vi.fn();
  return {
    clientX,
    pointerId: 1,
    currentTarget: element,
  } as unknown as ReactPointerEvent<HTMLElement>;
}

describe("usePanelWidth", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(storage.loadStoredWidth).mockResolvedValue(null);
  });

  it("starts at the default width when nothing is persisted", async () => {
    const { result } = renderHook(() => usePanelWidth());
    // Let the storage-load effect settle.
    await act(async () => {});
    expect(result.current.width).toBe(DEFAULT_PANEL_WIDTH_PX);
  });

  it("restores a clamped persisted width on mount", async () => {
    vi.mocked(storage.loadStoredWidth).mockResolvedValue(100);
    const { result } = renderHook(() => usePanelWidth());
    await act(async () => {});
    expect(result.current.width).toBeGreaterThanOrEqual(320);
    expect(result.current.width).not.toBe(DEFAULT_PANEL_WIDTH_PX);
  });

  it("widens the panel when the handle is dragged left, and persists on release", async () => {
    const { result } = renderHook(() => usePanelWidth());
    await act(async () => {});

    const downEvent = fakePointerDownEvent(500);
    act(() => {
      result.current.startResize(downEvent);
    });
    expect(downEvent.currentTarget.setPointerCapture).toHaveBeenCalledWith(1);

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 400 }));
    });
    expect(result.current.width).toBe(DEFAULT_PANEL_WIDTH_PX + 100);
    expect(storage.storeWidth).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    expect(downEvent.currentTarget.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(storage.storeWidth).toHaveBeenCalledWith(DEFAULT_PANEL_WIDTH_PX + 100);
  });

  it("clamps the dragged width to the minimum", async () => {
    const { result } = renderHook(() => usePanelWidth());
    await act(async () => {});

    const downEvent = fakePointerDownEvent(500);
    act(() => {
      result.current.startResize(downEvent);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 5000 }));
    });
    expect(result.current.width).toBe(320);
  });

  it("stops reacting to pointer events once released", async () => {
    const { result } = renderHook(() => usePanelWidth());
    await act(async () => {});

    const downEvent = fakePointerDownEvent(500);
    act(() => {
      result.current.startResize(downEvent);
    });
    act(() => {
      window.dispatchEvent(new PointerEvent("pointerup"));
    });
    const widthAfterRelease = result.current.width;

    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 0 }));
    });
    expect(result.current.width).toBe(widthAfterRelease);
  });
});
