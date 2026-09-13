// Shared audio-level-meter math (the "spectrogram" bars). Used for both
// directions of audio in the interview: the candidate's mic input
// (microphone.ts) and the interviewer's TTS playback
// (interviewerAudioPlayer.ts) — same bucket-averaging logic, fed by
// whichever AnalyserNode is currently relevant. Kept separate from either
// so it's plain, framework-free and unit-testable without a browser.

// Minimal structural subset of AnalyserNode this module needs — same
// "believable structural subset" approach as interviewerAudioPlayer.ts's
// AudioContextLike.
export interface AnalyserLike {
  readonly frequencyBinCount: number;
  getByteFrequencyData(array: Uint8Array): void;
}

/**
 * Buckets an AnalyserNode's frequency-domain snapshot into `barCount`
 * levels in [0, 1], each the average of an equal slice of the byte array.
 * Pure function so the bar math is testable without a real AnalyserNode —
 * the analyser itself (a browser API with no meaningful jsdom shape) stays
 * untested, same tradeoff microphone.ts documents for MediaRecorder.
 */
export function computeBarLevels(data: Uint8Array, barCount: number): number[] {
  if (barCount <= 0 || data.length === 0) return [];

  const bucketSize = Math.max(1, Math.floor(data.length / barCount));
  const levels: number[] = [];

  for (let bar = 0; bar < barCount; bar += 1) {
    const start = bar * bucketSize;
    const end = bar === barCount - 1 ? data.length : start + bucketSize;
    let sum = 0;
    let count = 0;
    for (let i = start; i < end && i < data.length; i += 1) {
      sum += data[i];
      count += 1;
    }
    levels.push(count === 0 ? 0 : sum / count / 255);
  }

  return levels;
}

/** Reads one frequency-domain snapshot from an analyser as bar levels. */
export function readBarLevels(analyser: AnalyserLike, barCount: number): number[] {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return computeBarLevels(data, barCount);
}
