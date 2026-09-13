import { createRoot } from "react-dom/client";
import { getInterviewSocket } from "../networking/interviewSocket";
import cssText from "../styles/globals.css?inline";
import { App } from "./App";
import { hasActiveConvaiSession, resetConvaiSession, sendConvaiCodeUpdate } from "./convaiSession";
import { watchCode } from "./editor";
import { cacheProblemInfo, hasActiveInterviewSession, resetInterviewSession } from "./interviewSession";
import { stopAllMicrophoneCapture } from "../media/microphone";
import { stopAllConvaiMicrophoneCapture } from "../media/convaiMicrophone";
import { releasePageSpace, reservePageSpace } from "./layout";
import { isSupportedProblemPage, waitForProblemInfo } from "./leetcode";

const HOST_ID = "ai-mock-interview-root";
const LOG_PREFIX = "[ai-mock-interview]";

let stopWatchingCode: (() => void) | null = null;
// Retained so unmount() can actually unmount React. Removing the host from
// the DOM does NOT unmount a root or run component cleanup — that was the
// root cause of the mic outliving the panel on SPA navigation (2026-09-13).
let reactRoot: ReturnType<typeof createRoot> | null = null;

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

  reactRoot = createRoot(mountPoint);
  reactRoot.render(<App />);
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
    // Both checked, not else-if: the two pipelines are mutually exclusive in
    // practice (App.tsx mounts one or the other per VITE_USE_ELEVENLABS_CONVAI),
    // but this keeps that assumption from silently breaking either one.
    const real = hasActiveInterviewSession();
    const convai = hasActiveConvaiSession();

    if (real) {
      socket.send({
        type: "code.update",
        language: snapshot.language,
        code: snapshot.code,
        timestamp: Date.now() / 1000,
      });
    }
    if (convai) {
      sendConvaiCodeUpdate(snapshot.code, snapshot.language);
    }
    if (!real && !convai) {
      console.debug(`${LOG_PREFIX} meaningful code change (no session yet)`, {
        language: snapshot.language,
        length: snapshot.code.length,
      });
    }
  });
}

function unmount() {
  // Unmount React BEFORE removing the host, so component cleanup actually
  // runs (this is what stops the microphone). Detaching the DOM node first
  // leaves the root mounted against an orphaned container and silently
  // skips every effect teardown.
  reactRoot?.unmount();
  reactRoot = null;

  document.getElementById(HOST_ID)?.remove();
  releasePageSpace();
  stopWatchingCode?.();
  stopWatchingCode = null;

  // Belt and braces: even if a future change loses the React cleanup path,
  // teardown must never leave the mic live. Cheap and idempotent. Both
  // pipelines' kill switches are called unconditionally, same reasoning as
  // watchCode's dual check above — whichever one is actually live gets torn
  // down, and calling the other one is a no-op.
  stopAllMicrophoneCapture();
  stopAllConvaiMicrophoneCapture();
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
  resetConvaiSession();
  unmount();
  mount();
}).observe(document.body, { childList: true, subtree: true });
