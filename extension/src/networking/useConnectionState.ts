import { useEffect, useState } from "react";
import type { ConnectionState, InterviewSocket } from "./websocket";

export function useConnectionState(socket: InterviewSocket): ConnectionState {
  const [state, setState] = useState<ConnectionState>("connecting");

  useEffect(() => socket.onStateChange(setState), [socket]);

  return state;
}
