import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageBadge } from "./StageBadge";

describe("StageBadge", () => {
  it("renders nothing before the first interviewer.state event arrives", () => {
    const { container } = render(<StageBadge stage={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the backend's real interview stage, labeled", () => {
    render(<StageBadge stage="complexity" />);
    expect(screen.getByText("STAGE: COMPLEXITY")).toBeInTheDocument();
  });
});
