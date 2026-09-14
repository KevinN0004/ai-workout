import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import DashboardHeader from "./DashboardHeader";

const baseProps = {
  user: { email: "tester@example.com" },
  go: vi.fn(),
  onOpenMenu: vi.fn(),
  onNavigateSummary: vi.fn(),
  profileMenuRef: { current: null },
  profileMenuOpen: false,
  onToggleProfileMenu: vi.fn(),
  onOpenSettings: vi.fn(),
  onLogout: vi.fn()
};

describe("DashboardHeader", () => {
  test("shows sign-in prompt when no user is present", async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    const onNavigateSummary = vi.fn();

    render(
      <DashboardHeader {...baseProps} user={null} go={go} onNavigateSummary={onNavigateSummary} />
    );

    expect(screen.getByText("Please sign in to access your dashboard.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /login \/ sign up/i }));
    expect(go).toHaveBeenCalledWith("/auth");

    await user.click(screen.getByRole("button", { name: /go to dashboard summary/i }));
    expect(onNavigateSummary).toHaveBeenCalled();
  });

  test("calls menu/profile actions for authenticated users", async () => {
    const user = userEvent.setup();
    const onOpenMenu = vi.fn();
    const onOpenSettings = vi.fn();
    const onLogout = vi.fn();

    render(
      <DashboardHeader
        {...baseProps}
        onOpenMenu={onOpenMenu}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
        profileMenuOpen
      />
    );

    await user.click(screen.getByRole("button", { name: /open dashboard menu/i }));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("menuitem", { name: /view profile/i }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("menuitem", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
