import { describe, expect, test } from "vitest";
import { buildWeeklyMealPlan, detectTrack, getDailyCalories } from "../planUtils";
import { goalOptions } from "../../../app/constants";

describe("planUtils", () => {
  test("detectTrack maps goal text to expected tracks", () => {
    expect(detectTrack("Fat loss + conditioning")).toBe("fat_loss");
    expect(detectTrack("Endurance and athletic performance")).toBe("endurance");
    expect(detectTrack("Mobility and recovery focus")).toBe("recovery");
    expect(detectTrack("Build lean strength and energy")).toBe("lean_strength");
  });

  // Every goal the form offers, and the track it is meant to land on. A goal
  // added to goalOptions without a row here fails the first test.
  const INTENDED_TRACKS = {
    "Build lean strength and energy": "lean_strength",
    "Fat loss + conditioning": "fat_loss",
    Mobility: "recovery",
    Recovery: "recovery",
    Cardio: "endurance"
  };

  test("has an intended track for every goal the form offers", () => {
    expect(Object.keys(INTENDED_TRACKS).sort()).toEqual([...goalOptions].sort());
  });

  test.each(goalOptions)("detectTrack maps the goal %s to its intended track", (goal) => {
    expect(detectTrack(goal)).toBe(INTENDED_TRACKS[goal]);
  });

  // A keyword is a whole word. As a substring, "cut" was found in "execute"
  // and "joint" in "disjointed", which put those goals on the wrong track.
  test.each([
    ["Execute a strength block", "lean_strength"],
    ["Acute knee rehab, then strength", "lean_strength"],
    ["Uppercut power for boxing", "lean_strength"],
    ["Shortcut to strength", "lean_strength"],
    ["Disjointed schedule, build muscle", "lean_strength"],
    ["Cutting phase", "fat_loss"],
    ["Cardiovascular health", "endurance"],
    ["Improve cardiorespiratory fitness", "endurance"],
    ["Athleticism", "endurance"],
    ["Athletics season", "endurance"],
    ["Joint health", "recovery"]
  ])("detectTrack reads %j as %s", (goal, track) => {
    expect(detectTrack(goal)).toBe(track);
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
