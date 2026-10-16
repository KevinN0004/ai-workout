import { act } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Pins the wiring in main.jsx: App renders inside the root error boundary, so
// a crash anywhere in it leaves a message in #root rather than an empty page.
// App is replaced by one that always throws. reportError, which jsdom lacks,
// is stubbed, and console.error is silenced because React logs the caught
// error. Error tracking stays off: the test build has no VITE_SENTRY_DSN.
vi.mock("../App.jsx", () => ({
  default: () => {
    throw new Error("App crashed");
  }
}));

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a crash in App leaves a message in #root, not an empty page", async () => {
  await act(async () => {
    await import("../main.jsx");
  });

  expect(document.getElementById("root").textContent).toContain("Reload the page to try again.");
  expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "App crashed" }));
});
