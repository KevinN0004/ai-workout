import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import DashboardDrawer from "../DashboardDrawer";

const items = [
  { key: "summary", label: "Home" },
  { key: "workouts", label: "Logs" },
  { key: "settings", label: "Settings" }
];

describe("DashboardDrawer", () => {
  test("renders nothing when closed", () => {
    render(
      <DashboardDrawer
        open={false}
        dashView="summary"
        items={items}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.queryByRole("heading", { name: /dashboard menu/i })).not.toBeInTheDocument();
  });

  test("renders nav buttons, keeps settings in footer, and triggers callbacks", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    const { container } = render(
      <DashboardDrawer
        open
        dashView="summary"
        items={items}
        onClose={onClose}
        onNavigate={onNavigate}
      />
    );

    const drawer = screen.getByRole("navigation");
    const drawerLinks = drawer.querySelector(".drawer-links");
    expect(within(drawerLinks).queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Logs" }));
    expect(onNavigate).toHaveBeenCalledWith("workouts");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(onNavigate).toHaveBeenCalledWith("settings");

    await user.click(container.querySelector(".drawer-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  // The drawer is the one overlay that does not go through ModalPortal, so it
  // calls useCloseOnEscape itself. Before that it could only be dismissed with
  // a mouse on the backdrop or by tabbing to the Close button.
  describe("closing with Escape", () => {
    const renderDrawer = (open, onClose) =>
      render(
        <DashboardDrawer
          open={open}
          dashView="summary"
          items={items}
          onClose={onClose}
          onNavigate={vi.fn()}
        />
      );

    test("closes when Escape is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderDrawer(true, onClose);

      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("ignores other keys", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderDrawer(true, onClose);

      await user.keyboard("{Enter}a");

      expect(onClose).not.toHaveBeenCalled();
    });

    test("does not listen while closed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderDrawer(false, onClose);

      await user.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });

    // A listener left behind would fire a closed drawer's handler.
    test("stops listening once unmounted", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const { unmount } = renderDrawer(true, onClose);

      unmount();
      await user.keyboard("{Escape}");

      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
