// Deterministic "meaningful code change" gate (architecture.md §L rule 3):
// a snapshot is only emitted once the code has been stable (unchanged) for
// `debounceMs`, AND differs from the last *emitted* snapshot by at least
// `minDiffChars`. This is what keeps editor.ts from firing on every
// keystroke — it's kept pure/DOM-free specifically so it can be unit
// tested without a browser.
export interface CodeSnapshot {
  code: string;
  language: string;
}

export interface CodeChangeDetectorOptions {
  debounceMs?: number;
  minDiffChars?: number;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
}

const DEFAULT_DEBOUNCE_MS = 2500;
const DEFAULT_MIN_DIFF_CHARS = 15;

/** Length of the non-shared middle segment once common prefix/suffix are trimmed off. */
function diffSize(a: string, b: string): number {
  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start++;

  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  return Math.max(endA - start, endB - start);
}

export function createCodeChangeDetector(options: CodeChangeDetectorOptions = {}) {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const minDiffChars = options.minDiffChars ?? DEFAULT_MIN_DIFF_CHARS;
  const now = options.now ?? (() => Date.now());

  let lastSeen: CodeSnapshot | null = null;
  let stableSince = 0;
  let lastEmitted: CodeSnapshot | null = null;
  let settledResultReady = false;

  /**
   * Call on every poll tick with the current snapshot. Returns the snapshot
   * to emit as a meaningful change, or null if nothing should be emitted
   * yet (still typing, still settling, or the settled change was too small).
   */
  function feed(snapshot: CodeSnapshot): CodeSnapshot | null {
    const changedSinceLastSeen =
      !lastSeen || snapshot.code !== lastSeen.code || snapshot.language !== lastSeen.language;

    if (changedSinceLastSeen) {
      lastSeen = snapshot;
      stableSince = now();
      settledResultReady = false;
      return null;
    }

    if (settledResultReady) return null;
    if (now() - stableSince < debounceMs) return null;

    settledResultReady = true;

    const changedEnough =
      !lastEmitted ||
      snapshot.language !== lastEmitted.language ||
      diffSize(snapshot.code, lastEmitted.code) >= minDiffChars;

    if (!changedEnough) return null;

    lastEmitted = snapshot;
    return snapshot;
  }

  return { feed };
}
