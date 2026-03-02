import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import DashboardDrawer from "./DashboardDrawer";

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

    expect(
      screen.queryByRole("heading", { name: /dashboard menu/i })
    ).not.toBeInTheDocument();
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
});
