import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import AppErrorBoundary from "../AppErrorBoundary";

// Pins the root error boundary: a child that throws while rendering or in an
// effect leaves a message on screen instead of an empty page, and the error
// still reaches reportError, the way an uncaught one would. jsdom has no
// reportError, so it is stubbed. console.error is silenced because React logs
// every error a boundary catches.

const ThrowsWhileRendering = () => {
  throw new Error("render failed");
};

const ThrowsInAnEffect = () => {
  useEffect(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  }, []);
  return <p>Loaded</p>;
};

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  test("renders its children while nothing throws", () => {
    render(
      <AppErrorBoundary>
        <p>Dashboard</p>
      </AppErrorBoundary>
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("replaces a child that throws while rendering with a message", () => {
    render(
      <AppErrorBoundary>
        <ThrowsWhileRendering />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Reload the page to try again.");
  });

  test("catches a throw from an effect too", () => {
    // The blocked-storage crash came from an effect, not from a render.
    render(
      <AppErrorBoundary>
        <ThrowsInAnEffect />
      </AppErrorBoundary>
    );

    expect(screen.queryByText("Loaded")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  test("reports what it caught, as an uncaught error is reported", () => {
    render(
      <AppErrorBoundary>
        <ThrowsWhileRendering />
      </AppErrorBoundary>
    );

    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "render failed" }));
  });
});
