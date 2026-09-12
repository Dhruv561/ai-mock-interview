import { ConnectionBadge } from "../components/ConnectionBadge";
import { InterviewPanel } from "../components/InterviewPanel";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useConnectionState } from "../networking/useConnectionState";
import { InterviewProvider } from "../state/interviewStore";
import { PANEL_WIDTH_PX } from "./layout";

export function App() {
  const connectionState = useConnectionState(getInterviewSocket());

  return (
    <InterviewProvider>
      <div
        className="fixed inset-y-0 right-0 z-[2147483000] flex flex-col border-l border-panel-border bg-panel-bg"
        style={{ width: `${PANEL_WIDTH_PX}px` }}
      >
        <ConnectionBadge state={connectionState} />
        <div className="min-h-0 flex-1">
          <InterviewPanel />
        </div>
      </div>
    </InterviewProvider>
  );
}
