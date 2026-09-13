import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MuteButton } from "./MuteButton";

describe("MuteButton", () => {
  it("shows Mute and calls onClick when unmuted", () => {
    const onClick = vi.fn();
    render(<MuteButton isMuted={false} onClick={onClick} />);

    const button = screen.getByRole("button", { name: "Mute" });
    button.click();

    expect(onClick).toHaveBeenCalled();
  });

  it("shows Unmute when muted", () => {
    render(<MuteButton isMuted={true} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
  });
});
