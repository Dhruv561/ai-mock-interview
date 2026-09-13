const STORAGE_KEY = "panelWidthPx";

/**
 * Reads the persisted panel width, if any. Wrapped in try/catch because
 * chrome.storage calls can reject if the extension context is mid-reload
 * (rare, but not worth crashing the panel over) — falls back to "never
 * persisted" in that case.
 */
export async function loadStoredWidth(): Promise<number | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    return typeof stored === "number" ? stored : null;
  } catch {
    return null;
  }
}

export function storeWidth(widthPx: number) {
  chrome.storage.local.set({ [STORAGE_KEY]: widthPx }).catch(() => {
    // Best-effort persistence — losing the remembered width is not worth
    // surfacing an error over.
  });
}
