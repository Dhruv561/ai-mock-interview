import {
  INITIAL_STATE,
  type FinalReview,
  type HintEntry,
  type InterviewUIState,
  type TranscriptMessage,
} from "./types";

export type InterviewAction =
  | { type: "session/start" }
  | { type: "session/tick" }
  | { type: "session/end" }
  | { type: "message/add"; message: TranscriptMessage }
  | { type: "candidateDraft/set"; text: string | null }
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

    case "message/add":
      // A finished message always supersedes whatever draft was building
      // towards it (transcript.final follows its own transcript.partial
      // stream) — otherwise the draft would linger under the new bubble.
      return {
        ...state,
        messages: [...state.messages, action.message],
        candidateDraft: null,
      };

    case "candidateDraft/set":
      return { ...state, candidateDraft: action.text };

    case "hint/add":
      return { ...state, hints: [...state.hints, action.hint] };

    case "review/ready":
      return { ...state, review: action.review };

    default:
      return state;
  }
}
