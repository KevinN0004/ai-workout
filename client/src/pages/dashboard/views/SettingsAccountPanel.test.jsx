import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import SettingsAccountPanel from "./SettingsAccountPanel";

// Two independent, unrelated flows in one panel: changing a password and
// deleting the account. Both handlers resolve to { ok } / { ok, error } and
// never throw -- see client/src/app/events.js -- so every branch here is
// driven by the resolved value rather than by a thrown error.

const renderPanel = (props = {}) =>
  render(<SettingsAccountPanel onChangePassword={vi.fn()} onDeleteAccount={vi.fn()} {...props} />);

describe("SettingsAccountPanel", () => {
  test("renders the password form and the initial delete button, with no confirmation showing", () => {
    renderPanel();

    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  test("marks the password inputs with the autocomplete tokens password managers expect", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByLabelText("Current password")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");

    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  describe("changing the password", () => {
    test("submits exactly the typed values to onChangePassword", async () => {
      const user = userEvent.setup();
      const onChangePassword = vi.fn().mockResolvedValue({ ok: true });
      renderPanel({ onChangePassword });

      await user.type(screen.getByLabelText("Current password"), "old-secret");
      await user.type(screen.getByLabelText("New password"), "new-secret-1");
      await user.click(screen.getByRole("button", { name: "Change password" }));

      await waitFor(() =>
        expect(onChangePassword).toHaveBeenCalledWith({
          currentPassword: "old-secret",
          newPassword: "new-secret-1"
        })
      );
    });

    test("shows the error and keeps the fields when the change fails", async () => {
      const user = userEvent.setup();
      const onChangePassword = vi
        .fn()
        .mockResolvedValue({ ok: false, error: "Current password is incorrect." });
      renderPanel({ onChangePassword });

      await user.type(screen.getByLabelText("Current password"), "wrong-secret");
      await user.type(screen.getByLabelText("New password"), "new-secret-1");
      await user.click(screen.getByRole("button", { name: "Change password" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Current password is incorrect.");
      expect(screen.getByLabelText("Current password")).toBeInTheDocument();
      expect(screen.getByLabelText("New password")).toBeInTheDocument();
    });

    test("falls back to a default message when the change fails without one", async () => {
      const user = userEvent.setup();
      const onChangePassword = vi.fn().mockResolvedValue({ ok: false });
      renderPanel({ onChangePassword });

      await user.type(screen.getByLabelText("Current password"), "wrong-secret");
      await user.type(screen.getByLabelText("New password"), "new-secret-1");
      await user.click(screen.getByRole("button", { name: "Change password" }));

      expect(await screen.findByText("Unable to change password.")).toBeInTheDocument();
    });

    test("clears both password fields after a successful change", async () => {
      const user = userEvent.setup();
      const onChangePassword = vi.fn().mockResolvedValue({ ok: true });
      renderPanel({ onChangePassword });

      await user.type(screen.getByLabelText("Current password"), "old-secret");
      await user.type(screen.getByLabelText("New password"), "new-secret-1");
      await user.click(screen.getByRole("button", { name: "Change password" }));

      await waitFor(() => expect(screen.getByLabelText("Current password")).toHaveValue(""));
      expect(screen.getByLabelText("New password")).toHaveValue("");
    });

    // Driven with a promise this test controls, rather than an already-resolved
    // one, so the pending state can actually be observed instead of having
    // resolved before the next assertion runs.
    test("disables the submit button while a change is in flight, so a double-click cannot fire two requests", async () => {
      const user = userEvent.setup();
      let resolveChange;
      const onChangePassword = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveChange = resolve;
          })
      );
      renderPanel({ onChangePassword });

      await user.type(screen.getByLabelText("Current password"), "old-secret");
      await user.type(screen.getByLabelText("New password"), "new-secret-1");
      await user.click(screen.getByRole("button", { name: "Change password" }));

      expect(screen.getByRole("button", { name: "Changing..." })).toBeDisabled();
      expect(onChangePassword).toHaveBeenCalledTimes(1);

      resolveChange({ ok: true });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled()
      );
    });
  });

  describe("deleting the account", () => {
    test("clicking Delete account only reveals the confirmation -- it never deletes directly", async () => {
      const user = userEvent.setup();
      const onDeleteAccount = vi.fn();
      renderPanel({ onDeleteAccount });

      await user.click(screen.getByRole("button", { name: "Delete account" }));

      expect(onDeleteAccount).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
    });

    test("warns what is removed and that it cannot be undone", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: "Delete account" }));

      expect(screen.getByText(/workout/i)).toBeInTheDocument();
      expect(screen.getByText(/meal/i)).toBeInTheDocument();
      expect(screen.getByText(/metric/i)).toBeInTheDocument();
      expect(screen.getByText(/plan/i)).toBeInTheDocument();
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    });

    test("confirming with a password calls onDeleteAccount with exactly that password", async () => {
      const user = userEvent.setup();
      const onDeleteAccount = vi.fn().mockResolvedValue({ ok: true });
      renderPanel({ onDeleteAccount });

      await user.click(screen.getByRole("button", { name: "Delete account" }));
      await user.type(screen.getByLabelText("Password"), "correct-secret");
      await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

      await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledWith("correct-secret"));
    });

    test("cancelling the confirmation backs out without deleting, and the confirmation input disappears", async () => {
      const user = userEvent.setup();
      const onDeleteAccount = vi.fn();
      renderPanel({ onDeleteAccount });

      await user.click(screen.getByRole("button", { name: "Delete account" }));
      await user.type(screen.getByLabelText("Password"), "some-secret");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onDeleteAccount).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Password")).toBeNull();
      expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
    });

    test("shows the error when deletion fails", async () => {
      const user = userEvent.setup();
      const onDeleteAccount = vi
        .fn()
        .mockResolvedValue({ ok: false, error: "Incorrect password." });
      renderPanel({ onDeleteAccount });

      await user.click(screen.getByRole("button", { name: "Delete account" }));
      await user.type(screen.getByLabelText("Password"), "wrong-secret");
      await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Incorrect password.");
    });

    test("falls back to a default message when deletion fails without one", async () => {
      const user = userEvent.setup();
      const onDeleteAccount = vi.fn().mockResolvedValue({ ok: false });
      renderPanel({ onDeleteAccount });

      await user.click(screen.getByRole("button", { name: "Delete account" }));
      await user.type(screen.getByLabelText("Password"), "wrong-secret");
      await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

      expect(await screen.findByText("Unable to delete account.")).toBeInTheDocument();
    });

    // After a *successful* deletion the handler navigates away itself and
    // clears app state, so there is nothing left in this component to assert --
    // only that the call happened, which the test above already pins. This one
    // instead pins the failure path: the user must be able to correct a typo
    // without starting the reveal-password-confirm sequence over again.
    test("keeps the confirmation open with the password field after a failed deletion", async () => {
      const user = userEvent.setup();
      const onDeleteAccount = vi
        .fn()
        .mockResolvedValue({ ok: false, error: "Incorrect password." });
      renderPanel({ onDeleteAccount });

      await user.click(screen.getByRole("button", { name: "Delete account" }));
      await user.type(screen.getByLabelText("Password"), "wrong-secret");
      await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

      await screen.findByRole("alert");
      expect(screen.getByLabelText("Password")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm deletion" })).toBeInTheDocument();
    });

    // Same technique as the password form: a promise this test controls, so the
    // pending state is actually observed rather than already resolved.
    test("disables the confirm button while a deletion is in flight, so a double-click cannot fire two requests", async () => {
      const user = userEvent.setup();
      let resolveDelete;
      const onDeleteAccount = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveDelete = resolve;
          })
      );
      renderPanel({ onDeleteAccount });

      await user.click(screen.getByRole("button", { name: "Delete account" }));
      await user.type(screen.getByLabelText("Password"), "correct-secret");
      await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

      expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();
      expect(onDeleteAccount).toHaveBeenCalledTimes(1);

      resolveDelete({ ok: false, error: "Incorrect password." });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Confirm deletion" })).toBeEnabled()
      );
    });
  });
});
