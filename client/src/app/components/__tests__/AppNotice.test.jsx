/**
 * Pins AppNotice's buttons: Dismiss when given `onDismiss`, and an action named
 * by `actionLabel` only when `onAction` comes with it.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import AppNotice from "../AppNotice";

describe("AppNotice", () => {
  test("is a status line with no buttons by default", () => {
    render(<AppNotice message="Trying again..." />);

    expect(screen.getByRole("status")).toHaveTextContent("Trying again...");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("offers the action by its label, and runs it", async () => {
    const onAction = vi.fn();
    render(
      <AppNotice message="A new version is ready." actionLabel="Reload" onAction={onAction} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test("offers no action without both a label and a handler", () => {
    const { rerender } = render(<AppNotice message="Ready." actionLabel="Reload" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<AppNotice message="Ready." onAction={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("puts the action before Dismiss when it has both", () => {
    render(
      <AppNotice message="Ready." actionLabel="Reload" onAction={() => {}} onDismiss={() => {}} />
    );

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Reload",
      "Dismiss"
    ]);
  });
});
