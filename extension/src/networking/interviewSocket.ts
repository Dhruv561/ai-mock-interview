// Lazy module-level singleton so content/index.tsx (non-React glue code
// that owns watchCode/waitForProblemInfo) and App.tsx's connection badge
// (React) share exactly one WebSocket connection per content-script
// instance, instead of each opening their own.
import { connectInterviewSocket, type InterviewSocket } from "./websocket";
import { portSocketFactory } from "./portSocket";

// 127.0.0.1, not "localhost", on purpose: "localhost" resolves to IPv6
// ::1 first on macOS, while `uvicorn --host 0.0.0.0` binds IPv4 only — so
// Chrome's WebSocket hits [::1]:8000, finds nothing listening, and fails
// with "WebSocket connection ... failed" forever (curl hides this because
// it falls back to IPv4 on its own). Pinning the literal IPv4 address
// removes the resolution ambiguity entirely. Don't "tidy" this back to
// localhost.
const DEFAULT_BACKEND_WS_URL = "ws://127.0.0.1:8000/ws/interview";

let singleton: InterviewSocket | null = null;

export function getInterviewSocket(): InterviewSocket {
  // portSocketFactory, not a direct `new WebSocket`: the socket has to be
  // opened from the service worker, because leetcode.com's CSP blocks a
  // page-context connection to the backend outright. See portSocket.ts.
  singleton ??= connectInterviewSocket(
    import.meta.env.VITE_BACKEND_WS_URL || DEFAULT_BACKEND_WS_URL,
    portSocketFactory,
  );
  return singleton;
}
