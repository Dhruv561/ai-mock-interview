import { useSyncExternalStore } from "react";
import type { InterviewStage } from "../networking/useInterviewStage";
import { INITIAL_RUBRIC, type RubricState } from "../state/types";

type HintLevel = 1 | 2 | 3;

export interface ConvaiHintRecord {
  level: HintLevel;
  text: string;
  timestamp: number;
}

export interface ConvaiStageHistoryEntry {
  stage: InterviewStage;
  timestamp: number;
}

export interface ConvaiProgressSnapshot {
  stage: InterviewStage | null;
  hints: ConvaiHintRecord[];
  stageHistory: ConvaiStageHistoryEntry[];
  pendingHintLevel: HintLevel | null;
  transcriptCount: number;
  currentCode: string;
  currentLanguage: string;
  codeAnalysisObservations: string[];
  liveRubric: RubricState;
}

const STAGE_SEQUENCE: InterviewStage[] = [
  "intro",
  "clarification",
  "approach",
  "coding",
  "complexity",
  "testing",
  "optimisation",
  "review",
];

const MAX_HINT_LEVEL: HintLevel = 3;
const HINT_STAGE_BY_LEVEL: Record<HintLevel, InterviewStage> = {
  1: "complexity",
  2: "testing",
  3: "optimisation",
};

const INITIAL_PROGRESS: ConvaiProgressSnapshot = {
  stage: null,
  hints: [],
  stageHistory: [],
  pendingHintLevel: null,
  transcriptCount: 0,
  currentCode: "",
  currentLanguage: "plaintext",
  codeAnalysisObservations: [],
  liveRubric: { ...INITIAL_RUBRIC },
};

let progress = INITIAL_PROGRESS;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function stageIndex(stage: InterviewStage): number {
  return STAGE_SEQUENCE.indexOf(stage);
}

function cloneProgress(next: ConvaiProgressSnapshot): ConvaiProgressSnapshot {
  return {
    stage: next.stage,
    hints: [...next.hints],
    stageHistory: [...next.stageHistory],
    pendingHintLevel: next.pendingHintLevel,
    transcriptCount: next.transcriptCount,
    currentCode: next.currentCode,
    currentLanguage: next.currentLanguage,
    codeAnalysisObservations: [...next.codeAnalysisObservations],
    liveRubric: { ...next.liveRubric },
  };
}

function stageReached(progressSnapshot: ConvaiProgressSnapshot, stage: InterviewStage): boolean {
  return progressSnapshot.stageHistory.some((entry) => entry.stage === stage) || progressSnapshot.stage === stage;
}

function refreshLiveRubric(progressSnapshot: ConvaiProgressSnapshot): void {
  const rubric = { ...INITIAL_RUBRIC };
  rubric.clarifying = stageReached(progressSnapshot, "clarification") || progressSnapshot.transcriptCount > 0 ? 1 : 0;
  rubric.approach = stageReached(progressSnapshot, "approach") || progressSnapshot.transcriptCount > 1 ? 1 : 0;
  rubric.code_quality = progressSnapshot.currentCode.trim()
    ? Math.max(0, 3 - Math.min(progressSnapshot.codeAnalysisObservations.length, 3))
    : 0;
  rubric.complexity = stageReached(progressSnapshot, "complexity") ? 1 : 0;
  rubric.communication = Math.min(3, Math.floor(progressSnapshot.transcriptCount / 2) + (progressSnapshot.hints.length > 0 ? 1 : 0));
  rubric.testing = stageReached(progressSnapshot, "testing") ? 1 : 0;
  progressSnapshot.liveRubric = rubric;
}

function setProgress(mutator: (draft: ConvaiProgressSnapshot) => void) {
  const draft = cloneProgress(progress);
  mutator(draft);
  refreshLiveRubric(draft);
  progress = draft;
  emit();
}

// Deliberately bypasses setProgress: that helper unconditionally recomputes
// the client-side heuristic (refreshLiveRubric) after every mutation, which
// would immediately clobber a backend-authored rubric passed in here.
export function setConvaiLiveRubric(liveRubric: RubricState): void {
  progress = { ...cloneProgress(progress), liveRubric: { ...liveRubric } };
  emit();
}

function advanceStage(target: InterviewStage, timestamp: number) {
  setProgress((draft) => {
    if (draft.stage === target) return;
    if (draft.stage !== null && stageIndex(target) <= stageIndex(draft.stage)) return;
    draft.stage = target;
    if (target !== "intro") {
      draft.stageHistory.push({ stage: target, timestamp });
    }
  });
}

export function resetConvaiProgress() {
  progress = cloneProgress(INITIAL_PROGRESS);
  emit();
}

export function startConvaiProgress() {
  setProgress((draft) => {
    draft.stage = "intro";
    draft.stageHistory = [];
    draft.hints = [];
    draft.pendingHintLevel = null;
    draft.transcriptCount = 0;
    draft.currentCode = "";
    draft.currentLanguage = "plaintext";
    draft.codeAnalysisObservations = [];
  });
}

export function recordConvaiTranscript(
  speaker: "candidate" | "interviewer",
  text: string,
  timestamp: number,
) {
  setProgress((draft) => {
    draft.transcriptCount += 1;
  });

  if (speaker === "interviewer") {
    if (progress.pendingHintLevel !== null) {
      const level = progress.pendingHintLevel;
      const hintStage = HINT_STAGE_BY_LEVEL[level];
      setProgress((draft) => {
        draft.hints.push({ level, text, timestamp });
        draft.pendingHintLevel = null;
      });
      if (
        progress.stage !== null &&
        stageIndex(progress.stage) >= stageIndex("coding") &&
        stageIndex(hintStage) > stageIndex(progress.stage)
      ) {
        advanceStage(hintStage, timestamp);
      }
      return;
    }
    advanceStage("clarification", timestamp);
    return;
  }

  advanceStage("approach", timestamp);
}

export function recordConvaiCodeUpdate(code: string, language: string, timestamp: number) {
  setProgress((draft) => {
    draft.currentCode = code;
    draft.currentLanguage = language;
  });
  advanceStage("coding", timestamp);
}

export function recordConvaiCodeAnalysis(observations: string[]): void {
  setProgress((draft) => {
    draft.codeAnalysisObservations = observations;
  });
}

export function requestConvaiHint(): HintLevel | null {
  let requestedLevel: HintLevel | null = null;
  setProgress((draft) => {
    if (draft.pendingHintLevel !== null) return;
    const nextLevel = Math.min(draft.hints.length + 1, MAX_HINT_LEVEL) as HintLevel;
    if (draft.hints.length >= MAX_HINT_LEVEL) return;
    draft.pendingHintLevel = nextLevel;
    requestedLevel = nextLevel;
  });
  return requestedLevel;
}

export function completeConvaiProgress(timestamp: number) {
  advanceStage("review", timestamp);
  setProgress((draft) => {
    draft.pendingHintLevel = null;
  });
}

export function getConvaiProgressSnapshot(): ConvaiProgressSnapshot {
  return progress;
}

export function subscribeConvaiProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConvaiProgress(): ConvaiProgressSnapshot {
  return useSyncExternalStore(subscribeConvaiProgress, getConvaiProgressSnapshot, getConvaiProgressSnapshot);
}