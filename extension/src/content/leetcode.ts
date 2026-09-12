// LeetCode problem detection + metadata extraction. Selectors below were
// confirmed live (not guessed) against leetcode.com/problems/two-sum and
// leetcode.com/problems/merge-intervals before writing this file — see
// architecture.md §D. If LeetCode changes its markup these will need
// updating; that's exactly why this is isolated in its own module rather
// than spread through the codebase.

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface ProblemInfo {
  slug: string;
  /** LeetCode's own problem number, e.g. "1" for Two Sum. Not always present. */
  number: string | null;
  title: string;
  difficulty: Difficulty | null;
  description: string;
}

const PROBLEM_PATH_PATTERN = /^\/problems\/([^/]+)/;
const TITLE_PATTERN = /^(\d+)\.\s*(.+)$/;
const DIFFICULTIES: ReadonlySet<string> = new Set(["Easy", "Medium", "Hard"]);

export function isSupportedProblemPage(pathname: string = window.location.pathname): boolean {
  return PROBLEM_PATH_PATTERN.test(pathname);
}

export function getProblemSlug(pathname: string = window.location.pathname): string | null {
  return PROBLEM_PATH_PATTERN.exec(pathname)?.[1] ?? null;
}

/**
 * Best-effort synchronous extraction. Returns null if the page isn't a
 * problem page, or if the expected elements aren't in the DOM yet (e.g.
 * this ran before LeetCode's client-side render finished) — callers doing
 * a one-shot extraction on mount should use waitForProblemInfo instead.
 */
export function extractProblemInfo(doc: Document = document): ProblemInfo | null {
  const slug = getProblemSlug();
  if (!slug) return null;

  const titleText = doc.querySelector(".text-title-large")?.textContent?.trim() ?? "";
  const titleMatch = TITLE_PATTERN.exec(titleText);
  const number = titleMatch?.[1] ?? null;
  const title = (titleMatch?.[2] ?? titleText).trim();

  const difficultyText =
    doc.querySelector('[class*="text-difficulty-"]')?.textContent?.trim() ?? "";
  const difficulty = DIFFICULTIES.has(difficultyText) ? (difficultyText as Difficulty) : null;

  const description =
    doc.querySelector('[data-track-load="description_content"]')?.textContent?.trim() ?? "";

  if (!title || !description) return null;

  return { slug, number, title, difficulty, description };
}

/**
 * Polls extractProblemInfo until it succeeds or timeoutMs elapses — the SPA
 * can still be rendering the description/title when the content script's
 * document_idle listener fires.
 */
export function waitForProblemInfo(
  timeoutMs = 5000,
  intervalMs = 200,
): Promise<ProblemInfo | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    function attempt() {
      const info = extractProblemInfo();
      if (info) {
        resolve(info);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }
      window.setTimeout(attempt, intervalMs);
    }

    attempt();
  });
}
