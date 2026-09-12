// Isolated-world adapter for reading the candidate's live code. Prefers the
// MAIN-world bridge (mainWorldBridge.ts, real Monaco model access); falls
// back to scraping rendered DOM text if the bridge doesn't respond (e.g.
// LeetCode changes how it loads Monaco). The DOM fallback is inherently
// incomplete for long files — Monaco virtualizes off-screen lines — this is
// a documented, accepted limitation (architecture.md §D), not a bug.
import { createCodeChangeDetector, type CodeSnapshot } from "./codeChangeDetector";

const MESSAGE_SOURCE = "ai-mock-interview";
const BRIDGE_TIMEOUT_MS = 500;
const POLL_MS = 1000;
const CODE_EDITOR_CONTAINER_SELECTOR = '[data-track-load="code_editor"]';

interface CodeResponseMessage {
  source: typeof MESSAGE_SOURCE;
  type: "code-response";
  code: string | null;
  language: string | null;
}

function isCodeResponseMessage(data: unknown): data is CodeResponseMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as CodeResponseMessage).source === MESSAGE_SOURCE &&
    (data as CodeResponseMessage).type === "code-response"
  );
}

function requestFromBridge(): Promise<CodeSnapshot | null> {
  return new Promise((resolve) => {
    let settled = false;

    function finish(result: CodeSnapshot | null) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleResponse);
      resolve(result);
    }

    function handleResponse(event: MessageEvent) {
      if (event.source !== window || !isCodeResponseMessage(event.data)) return;
      const { code, language } = event.data;
      finish(typeof code === "string" && typeof language === "string" ? { code, language } : null);
    }

    const timeout = window.setTimeout(() => finish(null), BRIDGE_TIMEOUT_MS);

    window.addEventListener("message", handleResponse);
    window.postMessage({ source: MESSAGE_SOURCE, type: "request-code" }, window.location.origin);
  });
}

// LeetCode's language-selector button shows one of these labels. Used only
// by the DOM-scrape fallback (the bridge returns Monaco's own languageId,
// e.g. "cpp", directly).
const LANGUAGE_BUTTON_LABELS: Record<string, string> = {
  "C++": "cpp",
  C: "c",
  "C#": "csharp",
  Java: "java",
  Python: "python",
  Python3: "python3",
  JavaScript: "javascript",
  TypeScript: "typescript",
  Go: "go",
  Rust: "rust",
  Kotlin: "kotlin",
  Swift: "swift",
  Ruby: "ruby",
  PHP: "php",
};

function scrapeFromDom(): CodeSnapshot | null {
  const container = document.querySelector(CODE_EDITOR_CONTAINER_SELECTOR);
  if (!container) return null;

  const lineNodes = container.querySelectorAll(".view-line");
  if (lineNodes.length === 0) return null;

  const code = Array.from(lineNodes)
    .map((node) => node.textContent ?? "")
    .join("\n");

  const languageButton = Array.from(document.querySelectorAll("button")).find((button) =>
    Object.hasOwn(LANGUAGE_BUTTON_LABELS, button.textContent?.trim() ?? ""),
  );
  const language = languageButton
    ? LANGUAGE_BUTTON_LABELS[languageButton.textContent!.trim()]
    : "plaintext";

  return { code, language };
}

export async function getCurrentSnapshot(): Promise<CodeSnapshot | null> {
  const fromBridge = await requestFromBridge();
  if (fromBridge) return fromBridge;
  return scrapeFromDom();
}

/** Polls for the current code and calls onMeaningfulChange once it settles. Returns a stop function. */
export function watchCode(onMeaningfulChange: (snapshot: CodeSnapshot) => void): () => void {
  const detector = createCodeChangeDetector();

  const interval = window.setInterval(() => {
    void getCurrentSnapshot().then((snapshot) => {
      if (!snapshot) return;
      const emitted = detector.feed(snapshot);
      if (emitted) onMeaningfulChange(emitted);
    });
  }, POLL_MS);

  return () => window.clearInterval(interval);
}
