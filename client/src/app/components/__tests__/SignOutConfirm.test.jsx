/**
 * Pins SignOutConfirm: it asks only while entries are unsent, names how many,
 * and every way out but Sign out anyway keeps the visitor signed in.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import SignOutConfirm from "../SignOutConfirm";

const renderConfirm = (count) => {
  const handlers = { onCancel: vi.fn(), onConfirm: vi.fn() };
  render(<SignOutConfirm count={count} {...handlers} />);
  return handlers;
};

describe("SignOutConfirm", () => {
  test("shows nothing while no entry is waiting", () => {
    renderConfirm(0);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("is a dialog named by its question, saying how many entries would be lost", () => {
    renderConfirm(3);

    const dialog = screen.getByRole("dialog", { name: "Sign out?" });
    expect(dialog).toHaveAccessibleDescription(
      "3 entries haven't reached the server and will be lost."
    );
  });

  test("speaks of one entry in the singular", () => {
    renderConfirm(1);

    expect(
      screen.getByText("1 entry hasn't reached the server and will be lost.")
    ).toBeInTheDocument();
  });

  test("Sign out anyway signs out", async () => {
    const { onConfirm, onCancel } = renderConfirm(2);

    await userEvent.click(screen.getByRole("button", { name: "Sign out anyway" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  test("Cancel, Escape and the backdrop each keep the visitor signed in", async () => {
    const { onCancel, onConfirm } = renderConfirm(2);

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.keyboard("{Escape}");
    fireEvent.click(screen.getByRole("dialog"));

    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("a click inside the box is not a click on the backdrop", () => {
    const { onCancel } = renderConfirm(2);

    fireEvent.click(screen.getByText("2 entries haven't reached the server and will be lost."));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
