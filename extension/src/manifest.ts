import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

// MV3 manifest. Content script owns UI, media capture, and the WebSocket
// connection (see architecture.md §B) — the background service worker is
// deliberately minimal because MV3 service workers can be evicted at any
// time and must not hold session-critical state.
export default defineManifest({
  manifest_version: 3,
  name: "AI Mock Interview",
  description:
    "Turns a LeetCode coding problem into a realistic AI technical interview.",
  version: pkg.version,
  action: {
    default_title: "AI Mock Interview",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["https://leetcode.com/problems/*"],
      js: ["src/content/index.tsx"],
      run_at: "document_idle",
    },
    // Isolated-world content scripts cannot see window.monaco — it's a
    // page-global set by LeetCode's own bundle. This second script runs in
    // the page's MAIN world so it can read it, and talks to the isolated
    // world (content/editor.ts) via window.postMessage. See architecture.md
    // §D — confirmed live against real leetcode.com problem pages before
    // implementing (window.monaco.editor.getEditors() is populated).
    {
      matches: ["https://leetcode.com/problems/*"],
      js: ["src/content/mainWorldBridge.ts"],
      world: "MAIN",
      run_at: "document_start",
    },
  ],
  permissions: ["scripting", "storage"],
  // The local backend must be declared here, not just leetcode.com.
  // leetcode.com serves `default-src 'none'; connect-src 'self'
  // https://challenges.cloudflare.com`, which blocks any connection to
  // 127.0.0.1. A content script's fetch/WebSocket is exempt from the host
  // page's CSP *only* when the extension holds host permission for the
  // target origin; without it Chrome treats the request as page-context and
  // the page CSP kills it. Match patterns have no ws:// scheme — Chrome
  // checks ws:// against the http:// permission (and wss:// against
  // https://), so the http entry is what authorises the WebSocket.
  host_permissions: [
    "https://leetcode.com/*",
    "http://127.0.0.1:8000/*",
    "http://localhost:8000/*",
    // Feature 19: the VPS-hosted backend (DEPLOY.md), reachable over plain
    // HTTP on a dedicated nginx port (no domain/TLS assigned yet). Kept
    // alongside the localhost entries above so the same built extension
    // works against either a local dev backend or the deployed one,
    // whichever VITE_BACKEND_WS_URL points at.
    "http://46.250.244.213:8080/*",
    // Spike: Gemini Live API WebSocket endpoint (generativelanguage.googleapis.com).
    // Service worker connects directly from its CSP-exempt context via
    // portSocketFactory relay to the client.
    "wss://generativelanguage.googleapis.com/*",
  ],
});
