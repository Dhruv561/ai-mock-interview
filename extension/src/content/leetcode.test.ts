import { afterEach, describe, expect, it } from "vitest";
import { extractProblemInfo, getProblemSlug, isSupportedProblemPage } from "./leetcode";

function renderProblemPage({
  title,
  difficulty,
  description,
}: {
  title: string;
  difficulty: string;
  description: string;
}) {
  document.body.innerHTML = `
    <div class="text-title-large"><a>${title}</a></div>
    <div class="relative inline-flex text-difficulty-${difficulty.toLowerCase()}">${difficulty}</div>
    <div data-track-load="description_content">${description}</div>
  `;
}

describe("isSupportedProblemPage / getProblemSlug", () => {
  it("recognizes a problem page and extracts its slug", () => {
    expect(isSupportedProblemPage("/problems/two-sum/description/")).toBe(true);
    expect(getProblemSlug("/problems/two-sum/description/")).toBe("two-sum");
    expect(getProblemSlug("/problems/merge-intervals/")).toBe("merge-intervals");
  });

  it("rejects non-problem pages", () => {
    expect(isSupportedProblemPage("/")).toBe(false);
    expect(isSupportedProblemPage("/explore/")).toBe(false);
    expect(getProblemSlug("/discuss/")).toBeNull();
  });
});

describe("extractProblemInfo", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("parses title (splitting the leading number), difficulty, and description", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/problems/two-sum/description/" },
      writable: true,
    });
    renderProblemPage({
      title: "1. Two Sum",
      difficulty: "Easy",
      description: "You are given an array of integers nums...",
    });

    const info = extractProblemInfo();
    expect(info).toEqual({
      slug: "two-sum",
      number: "1",
      title: "Two Sum",
      difficulty: "Easy",
      description: "You are given an array of integers nums...",
    });
  });

  it("handles a Medium problem with a multi-digit number", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/problems/merge-intervals/description/" },
      writable: true,
    });
    renderProblemPage({
      title: "56. Merge Intervals",
      difficulty: "Medium",
      description: "Given an array of intervals...",
    });

    const info = extractProblemInfo();
    expect(info?.number).toBe("56");
    expect(info?.title).toBe("Merge Intervals");
    expect(info?.difficulty).toBe("Medium");
  });

  it("returns null when not on a problem page", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/explore/" },
      writable: true,
    });
    expect(extractProblemInfo()).toBeNull();
  });

  it("returns null when the expected elements haven't rendered yet", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/problems/two-sum/description/" },
      writable: true,
    });
    document.body.innerHTML = "<div>loading…</div>";
    expect(extractProblemInfo()).toBeNull();
  });
});
