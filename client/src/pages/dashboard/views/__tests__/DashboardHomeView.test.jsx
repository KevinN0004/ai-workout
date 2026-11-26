import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import DashboardHomeView from "../DashboardHomeView";

// Pins where the dashboard's Home view sends a visitor. It only renders for a
// signed-in visitor, whom App would send from "/" straight back to
// /dashboard, so the button names and goes to the dashboard. `go` is a spy.

test("the button goes back to the dashboard", () => {
  const go = vi.fn();
  render(<DashboardHomeView go={go} />);

  fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));

  expect(go).toHaveBeenCalledWith("/dashboard");
});

test("says where the button goes", () => {
  render(<DashboardHomeView go={vi.fn()} />);

  expect(screen.getByText("Return to your dashboard summary.")).toBeInTheDocument();
});
