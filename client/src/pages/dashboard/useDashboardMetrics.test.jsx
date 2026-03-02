import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useDashboardMetrics from "./useDashboardMetrics";

const weekDays = [
  { label: "Mon", key: "Monday" },
  { label: "Tue", key: "Tuesday" },
  { label: "Wed", key: "Wednesday" }
];

describe("useDashboardMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("dedupes merged workout data and computes progress metrics", () => {
    const dashboard = {
      workoutSessions: [
        {
          id: "session-1",
          date: "2026-03-02",
          focus: "Strength",
          duration: 45,
          createdAt: "2026-03-02T08:00:00.000Z"
        }
      ],
      workouts: [
        {
          id: "session-1",
          date: "2026-03-02",
          focus: "Strength",
          duration: 45,
          createdAt: "2026-03-02T08:00:00.000Z"
        }
      ],
      calories: [
        { id: "cal-1", date: "2026-03-02", calories: 2200, source: "manual" },
        { id: "cal-2", date: "2026-03-01", calories: 2100, source: "manual" }
      ],
      mealLogs: [],
      progressMetrics: [
        { id: "p1", date: "2026-03-02", weightLb: 170, loggedAt: "2026-03-02T10:00:00.000Z" },
        { id: "p2", date: "2026-03-01", weightLb: 172, loggedAt: "2026-03-01T10:00:00.000Z" }
      ],
      plans: [{ goal: "Fat loss + conditioning" }],
      goals: {
        targetWeight: 165,
        targetCalories: 2200,
        weeklyWorkouts: 3
      }
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        dashboard,
        goalForm: { targetCalories: "2200", weeklyWorkouts: "3" },
        formGoal: "Fat loss + conditioning",
        weekDays,
        latestPlanByWeekday: { Monday: ["Squat"] }
      })
    );

    expect(result.current.workouts).toHaveLength(1);
    expect(result.current.last7Workouts).toHaveLength(1);
    expect(result.current.avgCalories).toBe(2150);
    expect(result.current.workoutProgress).toBe(33);
    expect(result.current.calorieGoal).toBe(2200);
    expect(result.current.calorieProgress).toBe(98);
    expect(result.current.todayRecommendation.weekday).toBe("Monday");
    expect(result.current.todayRecommendation.workoutLines).toEqual(["Squat"]);
    expect(result.current.weeklyTrends.latestWeight).toBe(170);
    expect(result.current.weeklyTrends.weightDelta).toBe(-2);
  });

  test("buildLinePath returns svg path for empty and populated values", () => {
    const { result } = renderHook(() =>
      useDashboardMetrics({
        dashboard: {
          workouts: [],
          workoutSessions: [],
          calories: [],
          mealLogs: [],
          progressMetrics: [],
          plans: [],
          goals: { targetWeight: 160, targetCalories: 2200, weeklyWorkouts: 3 }
        },
        goalForm: { targetCalories: "2200", weeklyWorkouts: "3" },
        formGoal: "",
        weekDays,
        latestPlanByWeekday: {}
      })
    );

    const emptyPath = result.current.buildLinePath([]);
    const linePath = result.current.buildLinePath([1, 3, 2], 100, 50, 5);

    expect(emptyPath).toMatch(/^M/);
    expect(linePath).toMatch(/^M/);
    expect(linePath).toContain("L");
  });
});
