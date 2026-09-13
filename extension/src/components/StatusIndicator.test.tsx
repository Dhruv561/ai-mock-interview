import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusIndicator } from "./StatusIndicator";

describe("StatusIndicator", () => {
  it("shows RECORDING and an elapsed timer while recording", () => {
    render(<StatusIndicator status="recording" elapsedSeconds={125} />);
    expect(screen.getByText("RECORDING")).toBeInTheDocument();
    expect(screen.getByText("02:05")).toBeInTheDocument();
  });

  it("shows COMPLETE with the final elapsed timer once ended", () => {
    render(<StatusIndicator status="ended" elapsedSeconds={90} />);
    expect(screen.getByText("COMPLETE")).toBeInTheDocument();
    expect(screen.getByText("01:30")).toBeInTheDocument();
  });

  it("hides the timer before the interview has started", () => {
    render(<StatusIndicator status="idle" elapsedSeconds={0} />);
    expect(screen.getByText("NOT STARTED")).toBeInTheDocument();
    expect(screen.queryByText("00:00")).not.toBeInTheDocument();
  });
});
