import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INITIAL_RUBRIC } from "../state/types";
import { Rubric } from "./Rubric";

describe("Rubric", () => {
  it("renders every rubric category with its current score", () => {
    render(
      <Rubric rubric={{ ...INITIAL_RUBRIC, clarifying: 3, approach: 2 }} />,
    );
    expect(screen.getByText("Clarifying")).toBeInTheDocument();
    expect(screen.getByText("3/3")).toBeInTheDocument();
    expect(screen.getByText("Approach")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("Testing")).toBeInTheDocument();
    expect(screen.getAllByText("0/3")).toHaveLength(4);
  });
});
