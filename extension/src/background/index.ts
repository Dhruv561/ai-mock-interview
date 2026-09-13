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
  arrayBufferToBase64,
  base64ToArrayBuffer,
  type PortCommand,
  type PortUpdate,
} from "../networking/portSocket";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ai-mock-interview] installed");
});

// Keepalive (2026-09-13 live-demo fix): an MV3 service worker is evicted
// after ~30s with no *extension-API* activity — an open WebSocket does not
// count, so without this the worker (and the WS it owns) was observed being
// killed and respawned roughly every 5-10s during a real interview, forcing
// networking/websocket.ts's client to reconnect over and over. Confirmed
// live via chrome://inspect: the service worker's own devtools target id
// changed mid-session. Each reconnect drops the STT provider mid-utterance
// (a fresh Deepgram session gets headerless WebM and can't decode cleanly)
// and can orphan an in-flight TTS audio bracket — this, not provider
// latency, was the root cause of garbled transcripts and missing interviewer
// audio in that test.
//
// chrome.alarms firing is a genuine extension-API event, so it resets the
// idle timer just like any other; Chrome enforces a 30s floor on
// periodInMinutes, which is why this only reduces (not eliminates) the eviction
// window rather than closing it outright. Scoped to the lifetime of the
// interview port rather than left running always, since it only needs to
// hold the worker up while a session actually depends on it.
const KEEPALIVE_ALARM_NAME = "ai-mock-interview-keepalive";

chrome.alarms.onAlarm.addListener((alarm) => {
  // Intentionally empty: being called at all is what resets the eviction
  // timer. Nothing else needs to happen here.
  void alarm;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== INTERVIEW_PORT_NAME) return;

  chrome.alarms.create(KEEPALIVE_ALARM_NAME, { periodInMinutes: 0.5 });

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
            // JSON control events arrive as text frames; interviewer TTS
            // audio (architecture.md §M) arrives as raw binary frames
            // (ws.binaryType = "arraybuffer" below) — base64-encode those
            // for the port, which is JSON-only, same as the reverse
            // candidate-mic-audio path in portSocket.ts's send().
            if (typeof event.data === "string") {
              post({ kind: "message", data: event.data });
            } else if (event.data instanceof ArrayBuffer) {
              post({ kind: "audio", base64: arrayBufferToBase64(event.data) });
            }
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
    chrome.alarms.clear(KEEPALIVE_ALARM_NAME);
    ws?.close();
    ws = null;
  });
});
