import { describe, expect, it } from "vitest";
import { computeBarLevels, readBarLevels, type AnalyserLike } from "./audioLevels";

describe("computeBarLevels", () => {
  it("averages each equal slice of the frequency data into [0, 1]", () => {
    // 4 bytes, 2 bars -> [0,255] and [255,0] averaged per bucket
    const data = new Uint8Array([0, 255, 255, 0]);
    expect(computeBarLevels(data, 2)).toEqual([0.5, 0.5]);
  });

  it("puts any remainder into the last bucket", () => {
    // 5 bytes, 2 bars -> bucketSize=2: [0,1] then [2,3,4]
    const data = new Uint8Array([255, 255, 0, 0, 0]);
    const levels = computeBarLevels(data, 2);
    expect(levels[0]).toBeCloseTo(1);
    expect(levels[1]).toBeCloseTo(0);
  });

  it("returns an empty array for zero or negative bar counts", () => {
    expect(computeBarLevels(new Uint8Array([1, 2, 3]), 0)).toEqual([]);
    expect(computeBarLevels(new Uint8Array([1, 2, 3]), -1)).toEqual([]);
  });

  it("returns an empty array for empty data", () => {
    expect(computeBarLevels(new Uint8Array([]), 5)).toEqual([]);
  });

  it("silence (all-zero data) produces all-zero levels", () => {
    expect(computeBarLevels(new Uint8Array(8), 4)).toEqual([0, 0, 0, 0]);
  });
});

describe("readBarLevels", () => {
  it("reads one snapshot from the analyser and buckets it", () => {
    const analyser: AnalyserLike = {
      frequencyBinCount: 4,
      getByteFrequencyData(array) {
        array.set([255, 255, 0, 0]);
      },
    };
    expect(readBarLevels(analyser, 2)).toEqual([1, 0]);
  });
});
