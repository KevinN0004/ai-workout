import { describe, expect, test } from "vitest";
import { allowedGoalValues, buildProfile, defaultProfile } from "./dashboardDataBuildersService";

// buildProfile is a whitelist, not a merge: a field missing from its returned
// object literal is dropped however permissive the Zod schema is. These seven
// fields reached the server and were discarded for exactly that reason, so the
// assertions below are what stops that recurring.

describe("defaultProfile", () => {
  test("declares every persisted field", () => {
    expect(defaultProfile()).toMatchObject({
      sleep: "",
      timeline: "",
      experience: "",
      nutrition: "",
      cardio: "",
      goal: "",
      trainingDays: []
    });
  });
});

describe("buildProfile", () => {
  test("persists the training and lifestyle fields", () => {
    const profile = buildProfile({
      sleep: "7-8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "HIIT"
    });

    expect(profile).toMatchObject({
      sleep: "7-8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "HIIT"
    });
  });

  test("keeps trainingDays as an array of clean strings", () => {
    expect(buildProfile({ trainingDays: ["Monday", "  Tuesday  ", ""] }).trainingDays).toEqual([
      "Monday",
      "Tuesday"
    ]);
  });

  test("caps trainingDays at seven days", () => {
    const eight = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(buildProfile({ trainingDays: eight }).trainingDays).toHaveLength(7);
  });

  test("defaults trainingDays to an array when given a non-array", () => {
    expect(buildProfile({ trainingDays: null }).trainingDays).toEqual([]);
  });

  test("accepts a goal from the allowed list", () => {
    expect(buildProfile({ goal: allowedGoalValues[1] }).goal).toBe(allowedGoalValues[1]);
  });

  test("rejects a goal outside the allowed list", () => {
    expect(buildProfile({ goal: "Become a wizard" }).goal).toBe("");
  });

  test("still strips genuinely unknown fields", () => {
    expect(buildProfile({ favouriteColour: "green" })).not.toHaveProperty("favouriteColour");
  });
});
