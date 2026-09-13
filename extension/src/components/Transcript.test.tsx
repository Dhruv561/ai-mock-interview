import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Transcript } from "./Transcript";
import type { TranscriptMessage } from "../state/types";

const candidateMessage: TranscriptMessage = {
  id: "m1",
  speaker: "candidate",
  text: "I'll sort by start time.",
  elapsedSeconds: 12,
};

describe("Transcript", () => {
  it("shows a waiting placeholder with no messages and no draft", () => {
    render(<Transcript messages={[]} />);
    expect(screen.getByText(/waiting for the interview/i)).toBeInTheDocument();
  });

  it("renders the live candidate draft even with no messages yet", () => {
    render(<Transcript messages={[]} candidateDraft="I'll use a..." />);
    expect(screen.queryByText(/waiting for the interview/i)).not.toBeInTheDocument();
    expect(screen.getByText("YOU · NOW")).toBeInTheDocument();
    expect(screen.getByText(/I'll use a\.\.\./)).toBeInTheDocument();
  });

  it("renders the draft below history without touching finished messages", () => {
    render(<Transcript messages={[candidateMessage]} candidateDraft="and then extend it" />);
    expect(screen.getByText("I'll sort by start time.")).toBeInTheDocument();
    expect(screen.getByText(/and then extend it/)).toBeInTheDocument();
  });

  it("omits the draft line once it is cleared", () => {
    render(<Transcript messages={[candidateMessage]} candidateDraft={null} />);
    expect(screen.queryByText("YOU · NOW")).not.toBeInTheDocument();
  });
});
