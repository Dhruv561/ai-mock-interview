import { createRoot } from "react-dom/client";
import cssText from "../styles/globals.css?inline";
import { App } from "./App";
import { watchCode } from "./editor";
import { releasePageSpace, reservePageSpace } from "./layout";
import { isSupportedProblemPage, waitForProblemInfo } from "./leetcode";

const HOST_ID = "ai-mock-interview-root";
const LOG_PREFIX = "[ai-mock-interview]";

let stopWatchingCode: (() => void) | null = null;

function mount() {
  if (!isSupportedProblemPage() || document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.body.appendChild(host);

  // Shadow root isolates our Tailwind output from LeetCode's own CSS (and
  // vice versa) — see architecture.md §B/§C.
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = cssText;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.id = "app-root";
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(<App />);
  reservePageSpace();

  // Extraction is not yet wired into the (still mock-data) interview panel —
  // that lands in Phase 3/6 when this replaces the mock engine. For now it
  // runs for real and logs, so Feature 03/04 can be verified against real
  // pages without a backend to send events to yet. See FEATURE_PROGRESS.md
  // Feature 03/04.
  void waitForProblemInfo().then((problem) => {
    if (problem) {
      console.debug(`${LOG_PREFIX} problem detected`, problem);
    } else {
      console.warn(`${LOG_PREFIX} could not extract problem info on this page`);
    }
  });

  stopWatchingCode = watchCode((snapshot) => {
    console.debug(`${LOG_PREFIX} meaningful code change`, {
      language: snapshot.language,
      length: snapshot.code.length,
    });
  });
}

function unmount() {
  document.getElementById(HOST_ID)?.remove();
  releasePageSpace();
  stopWatchingCode?.();
  stopWatchingCode = null;
}

mount();

// LeetCode is a client-rendered SPA — navigating between problems doesn't
// reload the page, so a MutationObserver is used to notice the route change
// and re-mount (or tear down, if the new page isn't a supported problem).
let lastPath = window.location.pathname;
new MutationObserver(() => {
  if (window.location.pathname === lastPath) return;
  lastPath = window.location.pathname;
  unmount();
  mount();
}).observe(document.body, { childList: true, subtree: true });
