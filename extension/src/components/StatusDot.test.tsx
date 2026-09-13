import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot } from "./StatusDot";

describe("StatusDot", () => {
  it("renders the label and applies the given tone class to the dot", () => {
    render(<StatusDot label="MIC ON" toneClass="bg-accent animate-pulse" />);
    const label = screen.getByText("MIC ON");
    expect(label).toBeInTheDocument();
    const dot = label.parentElement?.querySelector("[aria-hidden]");
    expect(dot).toHaveClass("bg-accent", "animate-pulse");
  });

  it("appends an optional extra className to the wrapper", () => {
    const { container } = render(
      <StatusDot label="BACKEND CONNECTED" toneClass="bg-accent" className="border-b" />,
    );
    expect(container.firstElementChild).toHaveClass("border-b");
  });
});
