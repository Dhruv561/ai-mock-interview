import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MicBadge } from "./MicBadge";

describe("MicBadge", () => {
  it("shows MIC ON while capturing", () => {
    render(<MicBadge status="active" />);
    expect(screen.getByText("MIC ON")).toBeInTheDocument();
  });

  it("shows MIC BLOCKED when permission was denied", () => {
    render(<MicBadge status="denied" />);
    expect(screen.getByText("MIC BLOCKED")).toBeInTheDocument();
  });

  it("shows MIC OFF while idle", () => {
    render(<MicBadge status="idle" />);
    expect(screen.getByText("MIC OFF")).toBeInTheDocument();
  });
});
