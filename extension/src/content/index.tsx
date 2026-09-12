import { createRoot } from "react-dom/client";
import { getInterviewSocket } from "../networking/interviewSocket";
import cssText from "../styles/globals.css?inline";
import { App } from "./App";
import { getCurrentSnapshot, watchCode } from "./editor";
import { releasePageSpace, reservePageSpace } from "./layout";
import { isSupportedProblemPage, waitForProblemInfo } from "./leetcode";

const HOST_ID = "ai-mock-interview-root";
const LOG_PREFIX = "[ai-mock-interview]";

let stopWatchingCode: (() => void) | null = null;
// Set once session.start has been sent for the current problem page, so
// watchCode's callback knows whether code.update has anywhere to go yet.
// Reset on every SPA navigation (see the MutationObserver below).
let sessionStarted = false;

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

  const socket = getInterviewSocket();

  // Extraction now feeds a real backend session (Feature 06) — the
  // interview panel itself still runs on state/mockEngine.ts until
  // Features 07/08 replace it with real server events; this transport and
  // the mock UI are independent until then.
  void waitForProblemInfo().then(async (problem) => {
    if (!problem) {
      console.warn(`${LOG_PREFIX} could not extract problem info on this page`);
      return;
    }
    console.debug(`${LOG_PREFIX} problem detected`, problem);
    const snapshot = await getCurrentSnapshot();
    socket.send({
      type: "session.start",
      problem,
      language: snapshot?.language ?? "plaintext",
    });
    sessionStarted = true;
  });

  stopWatchingCode = watchCode((snapshot) => {
    if (!sessionStarted) {
      console.debug(`${LOG_PREFIX} meaningful code change (no session yet)`, {
        language: snapshot.language,
        length: snapshot.code.length,
      });
      return;
    }
    socket.send({
      type: "code.update",
      language: snapshot.language,
      code: snapshot.code,
      timestamp: Date.now() / 1000,
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
  sessionStarted = false;
  unmount();
  mount();
}).observe(document.body, { childList: true, subtree: true });
