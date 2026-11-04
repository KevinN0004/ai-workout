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

      // Not Enter or Space: the drawer focuses its Close button when it opens,
      // and those would press it.
      await user.keyboard("a{ArrowDown}");

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

  // The drawer is not portalled through ModalPortal, so it holds focus with
  // the same hook directly: focus moves in, Tab goes round inside the panel,
  // and closing hands focus back to the menu button.
  test("holds keyboard focus while open and returns it on close", async () => {
    const user = userEvent.setup();
    const Page = ({ open }) => (
      <>
        <button type="button">Open dashboard menu</button>
        <DashboardDrawer
          open={open}
          dashView="summary"
          items={items}
          onClose={vi.fn()}
          onNavigate={vi.fn()}
        />
        <button type="button">Behind</button>
      </>
    );
    const view = render(<Page open={false} />);
    const menuButton = screen.getByRole("button", { name: "Open dashboard menu" });
    menuButton.focus();

    view.rerender(<Page open />);
    expect(screen.getByRole("button", { name: "Close dashboard menu" })).toHaveFocus();

    // Close, Home, Logs, Settings: four Tabs come back round to Close.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close dashboard menu" })).toHaveFocus();

    view.rerender(<Page open={false} />);
    expect(menuButton).toHaveFocus();
  });
});
