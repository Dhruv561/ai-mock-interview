// Deliberately minimal — see architecture.md §B. The content script owns UI,
// media capture, and the WebSocket connection; the service worker only
// exists to satisfy the MV3 manifest requirement and is not relied on to
// hold any session state (MV3 workers can be evicted at any time).

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ai-mock-interview] installed");
});
