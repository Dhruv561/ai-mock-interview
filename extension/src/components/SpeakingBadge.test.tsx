import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpeakingBadge } from "./SpeakingBadge";

describe("SpeakingBadge", () => {
  it("shows INTERVIEWER SPEAKING while audio is playing", () => {
    render(<SpeakingBadge isSpeaking={true} />);
    expect(screen.getByText("INTERVIEWER SPEAKING")).toBeInTheDocument();
  });

  it("shows INTERVIEWER SILENT otherwise", () => {
    render(<SpeakingBadge isSpeaking={false} />);
    expect(screen.getByText("INTERVIEWER SILENT")).toBeInTheDocument();
  });
});
