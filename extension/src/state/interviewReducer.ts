import {
  INITIAL_STATE,
  type FinalReview,
  type HintEntry,
  type InterviewStage,
  type InterviewUIState,
  type RubricCategory,
  type TranscriptMessage,
} from "./types";

export type InterviewAction =
  | { type: "session/start" }
  | { type: "session/tick" }
  | { type: "session/end" }
  | { type: "stage/set"; stage: InterviewStage }
  | { type: "message/add"; message: TranscriptMessage }
  | { type: "rubric/update"; category: RubricCategory; value: number }
  | { type: "hint/add"; hint: HintEntry }
  | { type: "review/ready"; review: FinalReview };

export function interviewReducer(
  state: InterviewUIState,
  action: InterviewAction,
): InterviewUIState {
  switch (action.type) {
    case "session/start":
      return { ...INITIAL_STATE, status: "recording" };

    case "session/tick":
      if (state.status !== "recording") return state;
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    case "session/end":
      return { ...state, status: "ended" };

    case "stage/set":
      return { ...state, stage: action.stage };

    case "message/add":
      return { ...state, messages: [...state.messages, action.message] };

    case "rubric/update": {
      const clamped = Math.max(0, Math.min(3, action.value));
      return {
        ...state,
        rubric: { ...state.rubric, [action.category]: clamped },
      };
    }

    case "hint/add":
      return { ...state, hints: [...state.hints, action.hint] };

    case "review/ready":
      return { ...state, review: action.review };

    default:
      return state;
  }
}
