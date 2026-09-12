// Lazy module-level singleton so content/index.tsx (non-React glue code
// that owns watchCode/waitForProblemInfo) and App.tsx's connection badge
// (React) share exactly one WebSocket connection per content-script
// instance, instead of each opening their own.
import { connectInterviewSocket, type InterviewSocket } from "./websocket";

const DEFAULT_BACKEND_WS_URL = "ws://localhost:8000/ws/interview";

let singleton: InterviewSocket | null = null;

export function getInterviewSocket(): InterviewSocket {
  singleton ??= connectInterviewSocket(import.meta.env.VITE_BACKEND_WS_URL || DEFAULT_BACKEND_WS_URL);
  return singleton;
}
