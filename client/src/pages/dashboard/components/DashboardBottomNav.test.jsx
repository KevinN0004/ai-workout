import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import DashboardBottomNav from "./DashboardBottomNav";

describe("DashboardBottomNav", () => {
  test("renders quick nav and marks current item active", () => {
    render(<DashboardBottomNav dashView="plans" onNavigate={vi.fn()} />);

    expect(
      screen.getByRole("navigation", { name: /dashboard quick navigation/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plans" })).toHaveClass("active");
  });

  test("navigates to selected item on click", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<DashboardBottomNav dashView="summary" onNavigate={onNavigate} />);

    await user.click(screen.getByRole("button", { name: "Goal" }));
    expect(onNavigate).toHaveBeenCalledWith("calories");

    await user.click(screen.getByRole("button", { name: "Meal" }));
    expect(onNavigate).toHaveBeenCalledWith("meal");
  });
});
