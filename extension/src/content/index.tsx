import { createRoot } from "react-dom/client";
import cssText from "../styles/globals.css?inline";
import { App } from "./App";

const HOST_ID = "ai-mock-interview-root";

function isSupportedProblemPage(): boolean {
  return /^\/problems\/[^/]+/.test(window.location.pathname);
}

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
}

function unmount() {
  document.getElementById(HOST_ID)?.remove();
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
