// The service worker owns the real WebSocket to the backend.
//
// This reverses architecture.md §B's original "content script owns the
// WebSocket connection" decision. It is a forced correction, not a
// preference: a content script physically cannot open this connection —
// leetcode.com's `default-src 'none'; connect-src 'self'` CSP kills a
// page-context socket to 127.0.0.1 inside Chrome, with no packet ever
// reaching the backend. See the header comment in networking/portSocket.ts
// for the full evidence, and architecture.md §B for the decision record.
//
// §B's original reasoning still stands and is respected here: MV3 workers
// are evicted at will, so this worker holds NO session state. It is a pipe
// between one runtime port and one WebSocket, and nothing more. Session id,
// sequence numbers, reconnect backoff and resume all remain in the content
// script (networking/websocket.ts), which survives eviction.
import {
  INTERVIEW_PORT_NAME,
  base64ToArrayBuffer,
  type PortCommand,
  type PortUpdate,
} from "../networking/portSocket";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ai-mock-interview] installed");
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== INTERVIEW_PORT_NAME) return;

  let ws: WebSocket | null = null;

  const post = (update: PortUpdate) => {
    try {
      port.postMessage(update);
    } catch {
      /* content script went away (tab closed/navigated) */
    }
  };

  port.onMessage.addListener((command: PortCommand) => {
    switch (command.kind) {
      case "open": {
        if (ws) return;
        try {
          ws = new WebSocket(command.url);
          ws.binaryType = "arraybuffer";
          ws.addEventListener("open", () => post({ kind: "open" }));
          ws.addEventListener("message", (event) => {
            // The backend only sends JSON text frames; anything binary is
            // not part of the event contract and is ignored rather than
            // silently mangled into a string.
            if (typeof event.data === "string") post({ kind: "message", data: event.data });
          });
          ws.addEventListener("error", () => post({ kind: "error" }));
          ws.addEventListener("close", (event) => post({ kind: "close", code: event.code }));
        } catch {
          post({ kind: "error" });
          post({ kind: "close" });
        }
        break;
      }
      case "text":
        if (ws?.readyState === WebSocket.OPEN) ws.send(command.data);
        break;
      case "binary":
        if (ws?.readyState === WebSocket.OPEN) ws.send(base64ToArrayBuffer(command.base64));
        break;
      case "close":
        ws?.close();
        ws = null;
        break;
    }
  });

  // Tab closed, navigated, or the content script was torn down — don't leave
  // an orphaned socket (and an orphaned backend session) behind.
  port.onDisconnect.addListener(() => {
    ws?.close();
    ws = null;
  });
});
