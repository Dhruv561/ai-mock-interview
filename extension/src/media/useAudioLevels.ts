import { useEffect, useMemo, useState } from "react";
import { readBarLevels, type AnalyserLike } from "./audioLevels";

const DEFAULT_BAR_COUNT = 5;

/**
 * Polls an AnalyserNode on every animation frame and returns its current
 * bar levels — the live "spectrogram" driving AudioLevelMeter. `getAnalyser`
 * is a function (not the analyser itself) so callers whose analyser is
 * created lazily (interviewerAudioPlayer.ts creates its on first utterance)
 * don't need to thread a changing value through React state: this hook
 * just asks again next frame. Both callers pass a stable function
 * reference (useCallback / a memoized instance method), so `getAnalyser`
 * is safe to depend on directly.
 *
 * Returns an all-zero array whenever `active` is false or no analyser is
 * available yet, so AudioLevelMeter can render unconditionally.
 */
export function useAudioLevels(
  getAnalyser: () => AnalyserLike | null,
  active: boolean,
  barCount: number = DEFAULT_BAR_COUNT,
): number[] {
  const zeroLevels = useMemo(() => new Array(barCount).fill(0), [barCount]);
  const [levels, setLevels] = useState<number[]>(zeroLevels);

  useEffect(() => {
    // Nothing to poll while inactive — the render return below already
    // falls back to zeroLevels, so there's no state to reset here.
    if (!active) return;

    let frame: number;
    const tick = () => {
      const analyser = getAnalyser();
      setLevels(analyser ? readBarLevels(analyser, barCount) : zeroLevels);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [active, barCount, getAnalyser, zeroLevels]);

  return active ? levels : zeroLevels;
}
