import { ConnectionBadge } from "../components/ConnectionBadge";
import { InterviewPanel } from "../components/InterviewPanel";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useConnectionState } from "../networking/useConnectionState";
import { InterviewProvider } from "../state/interviewStore";
import { usePanelWidth } from "../state/panelWidth";

export function App() {
  const connectionState = useConnectionState(getInterviewSocket());
  // Applies width to both this element and LeetCode's reflow margin
  // (content/layout.ts) as it changes — see state/panelWidth.ts.
  const { width, startResize } = usePanelWidth();

  return (
    <InterviewProvider>
      <div
        className="fixed inset-y-0 right-0 z-[2147483000] flex flex-col border-l border-panel-border bg-panel-bg"
        style={{ width: `${width}px` }}
      >
        <PanelResizeHandle onPointerDown={startResize} />
        <ConnectionBadge state={connectionState} />
        <div className="min-h-0 flex-1">
          <InterviewPanel />
        </div>
      </div>
    </InterviewProvider>
  );
}
