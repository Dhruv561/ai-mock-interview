import { useEffect } from "react";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { InterviewPanel } from "../components/InterviewPanel";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useConnectionState } from "../networking/useConnectionState";
import { InterviewProvider, useInterview } from "../state/interviewStore";
import { usePanelLayout } from "../state/panelLayout";
import { usePanelWidth } from "../state/panelWidth";
import { releasePageSpace, setPanelWidth } from "./layout";

export function App() {
  return (
    <InterviewProvider>
      <PanelShell />
    </InterviewProvider>
  );
}

/**
 * Chooses the panel's own outer shell. The "floating" preset (1b, Feature
 * 18) isn't just a different body inside the same docked column — the
 * Interview Sidebar design floats it as a compact bar above the code editor,
 * not a full-height right-side column. So this is the one place that
 * switches between the two: a fixed full-height right column (docked/split,
 * and floating whenever the interview isn't actually recording) versus a
 * fixed bottom-anchored bar that overlays the code without reserving any
 * page space for it (content/layout.ts).
 */
function PanelShell() {
  const connectionState = useConnectionState(getInterviewSocket());
  const { state } = useInterview();
  const { layout, setLayout } = usePanelLayout();
  const { width, startResize } = usePanelWidth();
  // Kept in sync with InterviewPanel's own isFloatingActive check.
  const isActive = state.status === "recording";
  const isFloating = isActive && layout === "floating";

  useEffect(() => {
    // Only the floating/non-floating transition should re-run this — width
    // changes while docked/split are already applied directly by
    // usePanelWidth's own mount/resize handlers.
    if (isFloating) {
      releasePageSpace();
    } else {
      setPanelWidth(width, { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFloating]);

  if (isFloating) {
    // No card/border/background here — the design (1b) floats the message
    // bubble and control pill as two independent pieces, each with its own
    // shadow/blur, not one shared panel card wrapping both. This container
    // exists only to center and width-limit them, matching the design's
    // 720px-wide floating column, centered at `bottom: 26px`.
    return (
      <div className="fixed inset-x-0 bottom-6 z-[2147483000] flex justify-center px-6">
        <div className="flex w-full max-w-[720px] flex-col items-center font-sans text-[13px] text-ink">
          <InterviewPanel layout={layout} setLayout={setLayout} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-y-0 right-0 z-[2147483000] flex flex-col border-l border-panel-border bg-panel-bg"
      style={{ width: `${width}px` }}
    >
      <PanelResizeHandle onPointerDown={startResize} />
      <ConnectionBadge state={connectionState} />
      <div className="min-h-0 flex-1">
        <InterviewPanel layout={layout} setLayout={setLayout} />
      </div>
    </div>
  );
}
