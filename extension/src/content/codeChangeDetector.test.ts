import { describe, expect, it } from "vitest";
import { createCodeChangeDetector } from "./codeChangeDetector";

function makeClock(startMs = 0) {
  let time = startMs;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createCodeChangeDetector", () => {
  it("does not emit while the code is still changing every tick (no keystroke spam)", () => {
    const clock = makeClock();
    const { feed } = createCodeChangeDetector({ now: clock.now, debounceMs: 2500 });

    expect(feed({ code: "a", language: "python" })).toBeNull();
    clock.advance(500);
    expect(feed({ code: "ab", language: "python" })).toBeNull();
    clock.advance(500);
    expect(feed({ code: "abc", language: "python" })).toBeNull();
  });

  it("emits once the code has been stable for debounceMs", () => {
    const clock = makeClock();
    const { feed } = createCodeChangeDetector({ now: clock.now, debounceMs: 2500, minDiffChars: 1 });

    feed({ code: "def solve():\n    pass", language: "python" });
    clock.advance(2500);
    const emitted = feed({ code: "def solve():\n    pass", language: "python" });
    expect(emitted).toEqual({ code: "def solve():\n    pass", language: "python" });
  });

  it("does not re-emit the same settled snapshot on subsequent ticks", () => {
    const clock = makeClock();
    const { feed } = createCodeChangeDetector({ now: clock.now, debounceMs: 1000, minDiffChars: 1 });

    feed({ code: "x = 1", language: "python" });
    clock.advance(1000);
    expect(feed({ code: "x = 1", language: "python" })).not.toBeNull();
    expect(feed({ code: "x = 1", language: "python" })).toBeNull();
    expect(feed({ code: "x = 1", language: "python" })).toBeNull();
  });

  it("skips emission when a later settled change is below minDiffChars against the last emission", () => {
    const clock = makeClock();
    const { feed } = createCodeChangeDetector({ now: clock.now, debounceMs: 1000, minDiffChars: 15 });

    // First-ever settle always emits — there's no prior emission to diff against.
    feed({ code: "x = 1", language: "python" });
    clock.advance(1000);
    expect(feed({ code: "x = 1", language: "python" })).not.toBeNull();

    // A trivial one-character edit settles next — below the 15-char threshold.
    feed({ code: "x = 2", language: "python" });
    clock.advance(1000);
    expect(feed({ code: "x = 2", language: "python" })).toBeNull();
  });

  it("emits a second time once a later change settles and clears the threshold", () => {
    const clock = makeClock();
    const { feed } = createCodeChangeDetector({ now: clock.now, debounceMs: 1000, minDiffChars: 10 });

    feed({ code: "x = 1", language: "python" });
    clock.advance(1000);
    feed({ code: "x = 1", language: "python" }); // first settle, emits (nothing to diff against yet)

    const bigger = "def solve(nums):\n    return sorted(nums)";
    feed({ code: bigger, language: "python" });
    clock.advance(1000);
    const emitted = feed({ code: bigger, language: "python" });
    expect(emitted).toEqual({ code: bigger, language: "python" });
  });

  it("treats a language change as meaningful even with identical code", () => {
    const clock = makeClock();
    const { feed } = createCodeChangeDetector({ now: clock.now, debounceMs: 1000, minDiffChars: 100 });

    feed({ code: "1 + 1", language: "python" });
    clock.advance(1000);
    feed({ code: "1 + 1", language: "python" });

    feed({ code: "1 + 1", language: "javascript" });
    clock.advance(1000);
    const emitted = feed({ code: "1 + 1", language: "javascript" });
    expect(emitted).toEqual({ code: "1 + 1", language: "javascript" });
  });
});
