import { describe, expect, test } from "vitest";
import { defaultDashboardData, mergeOptimisticDashboard } from "./dashboard.js";

// Optimistic entries are built in useOptimisticLogs as
// { type, item: { ...item, isOptimistic: true }, createdAt: Date.now() }.
const entry = (type, id, createdAt) => ({ type, item: { id }, createdAt });

const emptyDashboard = () => ({
  workoutSessions: [],
  workouts: [],
  calories: [],
  mealLogs: []
});

describe("defaultDashboardData", () => {
  test("carries the goal defaults the UI falls back to", () => {
    expect(defaultDashboardData().goals).toEqual({
      targetWeight: 160,
      targetCalories: 2200,
      weeklyWorkouts: 3
    });
  });

  test("returns a fresh object each call", () => {
    // It is used as a mutable base below, so a shared reference would let one
    // merge leak into the next.
    const first = defaultDashboardData();
    const second = defaultDashboardData();
    expect(first).not.toBe(second);
    expect(first.goals).not.toBe(second.goals);
    first.workouts.push("mutated");
    expect(second.workouts).toEqual([]);
  });
});

describe("mergeOptimisticDashboard", () => {
  test("returns null when there is no dashboard and nothing pending", () => {
    expect(mergeOptimisticDashboard(null, [])).toBeNull();
    expect(mergeOptimisticDashboard(undefined, [])).toBeNull();
  });

  test("returns the dashboard unchanged when nothing is pending", () => {
    const dashboard = { ...emptyDashboard(), goals: { targetWeight: 200 } };
    const merged = mergeOptimisticDashboard(dashboard, []);
    expect(merged).toEqual(dashboard);
    // A copy, not the same reference -- App.jsx holds this in a useMemo.
    expect(merged).not.toBe(dashboard);
  });

  test("falls back to defaults when entries arrive before the dashboard loads", () => {
    const merged = mergeOptimisticDashboard(null, [entry("workout", "w1", 1)]);
    expect(merged.goals).toEqual(defaultDashboardData().goals);
    expect(merged.workouts).toEqual([{ id: "w1" }]);
  });

  test("does not mutate the dashboard it was given", () => {
    const dashboard = emptyDashboard();
    mergeOptimisticDashboard(dashboard, [entry("workout", "w1", 1), entry("meal", "m1", 2)]);
    expect(dashboard).toEqual(emptyDashboard());
  });

  test("a workout entry lands in both workoutSessions and workouts", () => {
    const merged = mergeOptimisticDashboard(emptyDashboard(), [entry("workout", "w1", 1)]);
    expect(merged.workoutSessions).toEqual([{ id: "w1" }]);
    expect(merged.workouts).toEqual([{ id: "w1" }]);
  });

  test("a calorie entry lands only in calories", () => {
    const merged = mergeOptimisticDashboard(emptyDashboard(), [entry("calorie", "c1", 1)]);
    expect(merged.calories).toEqual([{ id: "c1" }]);
    expect(merged.mealLogs).toEqual([]);
    expect(merged.workouts).toEqual([]);
  });

  test("a meal entry lands only in mealLogs", () => {
    const merged = mergeOptimisticDashboard(emptyDashboard(), [entry("meal", "m1", 1)]);
    expect(merged.mealLogs).toEqual([{ id: "m1" }]);
    expect(merged.calories).toEqual([]);
  });

  test("an unrecognised entry type is dropped rather than throwing", () => {
    const merged = mergeOptimisticDashboard(emptyDashboard(), [entry("sleep", "s1", 1)]);
    expect(merged.workouts).toEqual([]);
    expect(merged.calories).toEqual([]);
    expect(merged.mealLogs).toEqual([]);
  });

  test("pending entries are placed ahead of what the server already returned", () => {
    const dashboard = { ...emptyDashboard(), mealLogs: [{ id: "server" }] };
    const merged = mergeOptimisticDashboard(dashboard, [entry("meal", "pending", 1)]);
    expect(merged.mealLogs).toEqual([{ id: "pending" }, { id: "server" }]);
  });

  test.each([["workoutSessions"], ["workouts"], ["calories"], ["mealLogs"]])(
    "replaces a non-array %s rather than spreading it",
    (field) => {
      // The server has returned null for these fields before; spreading one
      // would throw and take the whole dashboard down.
      const merged = mergeOptimisticDashboard({ ...emptyDashboard(), [field]: null }, [
        entry("workout", "w1", 1)
      ]);
      expect(Array.isArray(merged[field])).toBe(true);
    }
  );

  test("an entry with no createdAt sorts as though it were the oldest", () => {
    const merged = mergeOptimisticDashboard(emptyDashboard(), [
      entry("meal", "no-timestamp", undefined),
      entry("meal", "timestamped", 5)
    ]);
    // Missing timestamps read as 0, so it sorts last.
    expect(merged.mealLogs.map((item) => item.id)).toEqual(["timestamped", "no-timestamp"]);
  });

  test("entries with no createdAt at all keep their original order", () => {
    // Exercises both sides of the `|| 0` fallback in the comparator: the case
    // above only reaches one of them, because a two-element sort calls the
    // comparator once and only `a` is missing a timestamp there.
    const merged = mergeOptimisticDashboard(emptyDashboard(), [
      entry("meal", "first", undefined),
      entry("meal", "second", undefined)
    ]);
    // Array.prototype.sort is stable, so equal keys keep their input order.
    expect(merged.mealLogs.map((item) => item.id)).toEqual(["first", "second"]);
  });

  test("pending entries render newest first", () => {
    // This test previously pinned the opposite, because the code sorted
    // descending and then unshift()ed each entry onto the front, undoing the
    // sort. Nothing re-sorted calories or mealLogs downstream, so meals logged
    // in quick succession genuinely rendered oldest-first.
    const merged = mergeOptimisticDashboard(emptyDashboard(), [
      entry("meal", "oldest", 100),
      entry("meal", "newest", 300),
      entry("meal", "middle", 200)
    ]);
    expect(merged.mealLogs.map((item) => item.id)).toEqual(["newest", "middle", "oldest"]);
  });
});
