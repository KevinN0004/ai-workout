import { describe, expect, test } from "vitest";
import { resolveDashViewFromPath } from "./routing.js";

describe("resolveDashViewFromPath", () => {
  test.each([
    ["/dashboard", "summary"],
    ["/dashboard/", "summary"],
    ["/dashboard/summary", "summary"],
    ["/dashboard/workouts", "workouts"],
    ["/dashboard/calories", "calories"],
    ["/dashboard/plans", "plans"],
    ["/dashboard/meal", "meal"],
    ["/dashboard/tips", "tips"],
    ["/dashboard/settings", "settings"],
    ["/dashboard/home", "home"]
  ])("%s resolves to %s", (path, expected) => {
    expect(resolveDashViewFromPath(path)).toBe(expected);
  });

  test("ignores anything after the first path segment", () => {
    // The dashboard views are flat; a deeper path still selects the view.
    expect(resolveDashViewFromPath("/dashboard/tips/extra")).toBe("tips");
    expect(resolveDashViewFromPath("/dashboard/meal/123/edit")).toBe("meal");
  });

  test.each([["/"], [""], ["/dashboardfoo"], ["/settings"], ["/dashboar"]])(
    "%s is not a dashboard route and resolves to null",
    (path) => {
      // `/dashboardfoo` is the interesting one -- a prefix check without the
      // trailing slash would wrongly claim it.
      expect(resolveDashViewFromPath(path)).toBeNull();
    }
  );

  test("an unknown dashboard slug resolves to null rather than undefined", () => {
    // Callers branch on `=== null`; undefined would slip through.
    expect(resolveDashViewFromPath("/dashboard/nope")).toBeNull();
  });

  test("a doubled slash falls back to the summary view", () => {
    // "/dashboard//x" leaves an empty first segment, and the route map has an
    // explicit "" -> summary entry for exactly this.
    expect(resolveDashViewFromPath("/dashboard//x")).toBe("summary");
  });
});
