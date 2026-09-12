import { createRoot } from "react-dom/client";
import { getInterviewSocket } from "../networking/interviewSocket";
import cssText from "../styles/globals.css?inline";
import { App } from "./App";
import { watchCode } from "./editor";
import { cacheProblemInfo, hasActiveInterviewSession, resetInterviewSession } from "./interviewSession";
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

  const socket = getInterviewSocket();

  // The real session.start now fires from InterviewPanel's Start button
  // (see interviewSession.ts), not automatically here — this just caches
  // the detected problem so that click has something to send.
  void waitForProblemInfo().then((problem) => {
    if (!problem) {
      console.warn(`${LOG_PREFIX} could not extract problem info on this page`);
      return;
    }
    console.debug(`${LOG_PREFIX} problem detected`, problem);
    cacheProblemInfo(problem);
  });

  stopWatchingCode = watchCode((snapshot) => {
    if (!hasActiveInterviewSession()) {
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
  resetInterviewSession();
  unmount();
  mount();
}).observe(document.body, { childList: true, subtree: true });
