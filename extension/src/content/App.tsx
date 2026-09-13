import { useEffect } from "react";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { ConvaiInterviewPanel } from "../components/ConvaiInterviewPanel";
import { InterviewPanel } from "../components/InterviewPanel";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useConnectionState } from "../networking/useConnectionState";
import { InterviewProvider, useInterview } from "../state/interviewStore";
import { usePanelLayout } from "../state/panelLayout";
import { usePanelWidth } from "../state/panelWidth";
import { releasePageSpace, setPanelWidth } from "./layout";

// ElevenLabs Conversational AI is the default interviewer pipeline as of
// 2026-09-13 (progress.md's "Spike" section, promoted after a live
// comparison and a tuning pass on its silence handling — see
// architecture.md's "Default interviewer pipeline" addendum for the full
// decision record, including the known regressions this accepted:
// no tiered hints, no live stage tracking, thinner review evidence).
//
// The original Deepgram/Claude-controller/ElevenLabs-TTS pipeline
// (InterviewPanel.tsx, and everything under backend/app/{agents,
// interview,providers/{stt,llm,tts/elevenlabs.py}}) is kept, not deleted —
// set VITE_USE_LEGACY_PIPELINE=true to fall back to it. A build-time
// constant (import.meta.env is replaced at build time by Vite), never
// toggled at runtime, so branching to an entirely separate component below
// (rather than an if/else *inside* one component's hooks) keeps both call
// sites unconditional and rules-of-hooks-clean.
const USE_LEGACY_PIPELINE = import.meta.env.VITE_USE_LEGACY_PIPELINE === "true";

export function App() {
  return USE_LEGACY_PIPELINE ? <LegacyApp /> : <ConvaiApp />;
}

/**
 * The default pipeline: one ElevenLabs Conversational AI agent handling
 * STT+LLM+TTS+turn-taking itself, wired through components/
 * ConvaiInterviewPanel.tsx and content/convaiSession.ts.
 *
 * No ConnectionBadge here (unlike LegacyApp) — this pipeline has no
 * persistent connection until Start is clicked (see convaiSession.ts).
 *
 * Known gap vs. LegacyApp's PanelShell below: this always renders as a
 * fixed full-height right column, even when its own "floating" layout
 * preset is selected — ConvaiInterviewPanel.tsx picked that preset up
 * before PanelShell's page-overlay treatment existed (Feature 18 follow-up,
 * merged into this branch afterward) and hasn't been updated to match. Not
 * a regression introduced here; carried forward as a known, minor gap.
 */
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

/**
 * Deprecated fallback pipeline (VITE_USE_LEGACY_PIPELINE=true) — Deepgram
 * STT, the Claude interviewer/controller, and single-utterance ElevenLabs
 * TTS, with the deterministic silence/hint/rubric machinery that pipeline
 * was built around. Kept working and tested, not deleted, so this is
 * reversible if the Convai pipeline above doesn't hold up — see
 * architecture.md's "Default interviewer pipeline" addendum.
 */
function LegacyApp() {
  return (
    <InterviewProvider>
      <PanelShell />
    </InterviewProvider>
  );
}

/**
 * Chooses the legacy panel's own outer shell. The "floating" preset (1b,
 * Feature 18) isn't just a different body inside the same docked column —
 * the Interview Sidebar design floats it as a compact bar above the code
 * editor, not a full-height right-side column. So this is the one place
 * that switches between the two: a fixed full-height right column
 * (docked/split, and floating whenever the interview isn't actually
 * recording) versus a fixed bottom-anchored bar that overlays the code
 * without reserving any page space for it (content/layout.ts).
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
