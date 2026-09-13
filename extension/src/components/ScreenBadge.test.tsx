import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScreenBadge } from "./ScreenBadge";

describe("ScreenBadge", () => {
  it("shows SCREEN REC while capturing", () => {
    render(<ScreenBadge status="active" />);
    expect(screen.getByText("SCREEN REC")).toBeInTheDocument();
  });

  it("shows SCREEN BLOCKED when permission was denied", () => {
    render(<ScreenBadge status="denied" />);
    expect(screen.getByText("SCREEN BLOCKED")).toBeInTheDocument();
  });

  it("shows SCREEN OFF while idle", () => {
    render(<ScreenBadge status="idle" />);
    expect(screen.getByText("SCREEN OFF")).toBeInTheDocument();
  });
});
