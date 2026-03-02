import { describe, expect, test } from "vitest";
import { buildWeeklyMealPlan, detectTrack, getDailyCalories } from "./planUtils";

describe("planUtils", () => {
  test("detectTrack maps goal text to expected tracks", () => {
    expect(detectTrack("Fat loss + conditioning")).toBe("fat_loss");
    expect(detectTrack("Endurance and athletic performance")).toBe("endurance");
    expect(detectTrack("Mobility and recovery focus")).toBe("recovery");
    expect(detectTrack("Build lean strength and energy")).toBe("lean_strength");
  });

  test("getDailyCalories applies track rules and minimum floors", () => {
    expect(getDailyCalories("fat_loss", 2000, true)).toBe(2000);
    expect(getDailyCalories("fat_loss", 1600, false)).toBe(1400);

    expect(getDailyCalories("endurance", 2200, true)).toBe(2350);
    expect(getDailyCalories("endurance", 2200, false)).toBe(2200);

    expect(getDailyCalories("recovery", 1550, false)).toBe(1500);
    expect(getDailyCalories("lean_strength", 1600, false)).toBe(1500);
  });

  test("buildWeeklyMealPlan builds training/rest day calories and defaults safely", () => {
    const weekDays = [
      { label: "Mon", key: "Monday" },
      { label: "Tue", key: "Tuesday" },
      { label: "Wed", key: "Wednesday" }
    ];

    const plan = buildWeeklyMealPlan({
      weekDays,
      latestPlanByWeekday: {
        Monday: ["Squat", "Bench"]
      },
      goalText: "Fat loss + conditioning",
      targetCalories: "2100"
    });

    expect(plan.track).toBe("fat_loss");
    expect(plan.targetCalories).toBe(2100);
    expect(plan.days).toHaveLength(3);
    expect(plan.days[0].trainingDay).toBe(true);
    expect(plan.days[0].calories).toBe(2100);
    expect(plan.days[1].trainingDay).toBe(false);
    expect(plan.days[1].calories).toBe(1850);
    expect(plan.days[0].breakfast).toBeTruthy();
    expect(plan.days[0].prepNote).toBeTruthy();

    const fallback = buildWeeklyMealPlan({
      weekDays,
      latestPlanByWeekday: {},
      goalText: "",
      targetCalories: ""
    });
    expect(fallback.track).toBe("lean_strength");
    expect(fallback.targetCalories).toBe(2200);
  });
});
