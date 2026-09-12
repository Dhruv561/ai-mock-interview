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
  host_permissions: ["https://leetcode.com/*"],
});
