import { InterviewPanel } from "../components/InterviewPanel";
import { InterviewProvider } from "../state/interviewStore";
import { PANEL_WIDTH_PX } from "./layout";

export function App() {
  return (
    <InterviewProvider>
      <div
        className="fixed inset-y-0 right-0 z-[2147483000] border-l border-panel-border"
        style={{ width: `${PANEL_WIDTH_PX}px` }}
      >
        <InterviewPanel />
      </div>
    </InterviewProvider>
  );
}
