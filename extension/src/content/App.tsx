import { InterviewPanel } from "../components/InterviewPanel";
import { InterviewProvider } from "../state/interviewStore";

export function App() {
  return (
    <InterviewProvider>
      <div className="fixed inset-y-0 right-0 z-[2147483000] w-[420px] border-l border-panel-border">
        <InterviewPanel />
      </div>
    </InterviewProvider>
  );
}
