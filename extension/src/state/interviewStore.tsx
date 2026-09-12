import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { interviewReducer, type InterviewAction } from "./interviewReducer";
import { INITIAL_STATE, type InterviewUIState } from "./types";

interface InterviewContextValue {
  state: InterviewUIState;
  dispatch: Dispatch<InterviewAction>;
}

const InterviewContext = createContext<InterviewContextValue | null>(null);

export function InterviewProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(interviewReducer, INITIAL_STATE);

  // Elapsed-time ticker. In a later phase this becomes redundant with
  // server-driven state, but the header timer should still tick locally
  // between server updates rather than only on event arrival.
  useEffect(() => {
    if (state.status !== "recording") return;
    const id = window.setInterval(() => {
      dispatch({ type: "session/tick" });
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.status]);

  return (
    <InterviewContext.Provider value={{ state, dispatch }}>
      {children}
    </InterviewContext.Provider>
  );
}

export function useInterview(): InterviewContextValue {
  const ctx = useContext(InterviewContext);
  if (!ctx) {
    throw new Error("useInterview must be used within an InterviewProvider");
  }
  return ctx;
}
