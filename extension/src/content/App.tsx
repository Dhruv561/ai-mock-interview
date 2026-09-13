import { ConnectionBadge } from "../components/ConnectionBadge";
import { ConvaiInterviewPanel } from "../components/ConvaiInterviewPanel";
import { InterviewPanel } from "../components/InterviewPanel";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useConnectionState } from "../networking/useConnectionState";
import { InterviewProvider } from "../state/interviewStore";
import { usePanelWidth } from "../state/panelWidth";

// ElevenLabs Conversational AI spike toggle (spikes/elevenlabs-convai/
// README.md, progress.md's "Spike" section) — a build-time constant
// (import.meta.env is replaced at build time by Vite), never toggled at
// runtime, so branching to an entirely separate component below (rather
// than an if/else *inside* one component's hooks) keeps both call sites
// unconditional and rules-of-hooks-clean.
const USE_CONVAI = import.meta.env.VITE_USE_ELEVENLABS_CONVAI === "true";

export function App() {
  return USE_CONVAI ? <ConvaiApp /> : <RealApp />;
}

function RealApp() {
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

/** Same shell as RealApp, minus the real backend's ConnectionBadge (this
 * pipeline has no persistent connection until Start is clicked — see
 * content/convaiSession.ts) and pointed at ConvaiInterviewPanel instead. */
function ConvaiApp() {
  const { width, startResize } = usePanelWidth();

  return (
    <InterviewProvider>
      <div
        className="fixed inset-y-0 right-0 z-[2147483000] flex flex-col border-l border-panel-border bg-panel-bg"
        style={{ width: `${width}px` }}
      >
        <PanelResizeHandle onPointerDown={startResize} />
        <div className="min-h-0 flex-1">
          <ConvaiInterviewPanel />
        </div>
      </div>
    </InterviewProvider>
  );
}
