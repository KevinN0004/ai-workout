import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./pages/HomePage", () => ({
  default: () => <div data-testid="home-page">Home page</div>
}));

vi.mock("./pages/AuthPage", () => ({
  default: () => <div data-testid="auth-page">Auth page</div>
}));

vi.mock("./pages/DashboardPage", () => ({
  default: () => <div data-testid="dashboard-page">Dashboard page</div>
}));

vi.mock("./pages/WorkoutResultPage", () => ({
  default: () => <div data-testid="workout-result-page">Workout result page</div>
}));

import App from "./App";

const setPath = (path) => {
  window.history.pushState({}, "", path);
};

describe("App route rendering", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({})
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setPath("/");
  });

  test("renders HomePage on root route", () => {
    setPath("/");
    render(<App />);
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  test("renders AuthPage on /auth route", () => {
    setPath("/auth");
    render(<App />);
    expect(screen.getByTestId("auth-page")).toBeInTheDocument();
  });

  test("renders DashboardPage on /dashboard route", () => {
    setPath("/dashboard");
    render(<App />);
    expect(screen.getByTestId("dashboard-page")).toBeInTheDocument();
  });

  test("renders WorkoutResultPage on /plan route", () => {
    setPath("/plan");
    render(<App />);
    expect(screen.getByTestId("workout-result-page")).toBeInTheDocument();
  });
});
