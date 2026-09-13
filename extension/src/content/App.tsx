import { ConnectionBadge } from "../components/ConnectionBadge";
import { ConvaiInterviewPanel } from "../components/ConvaiInterviewPanel";
import { InterviewPanel } from "../components/InterviewPanel";
import { PanelResizeHandle } from "../components/PanelResizeHandle";
import { getInterviewSocket } from "../networking/interviewSocket";
import { useConnectionState } from "../networking/useConnectionState";
import { InterviewProvider } from "../state/interviewStore";
import { usePanelWidth } from "../state/panelWidth";

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
