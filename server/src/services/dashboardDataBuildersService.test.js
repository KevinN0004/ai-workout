import { describe, expect, test } from "vitest";
import {
  allowedCardioValues,
  allowedExperienceValues,
  allowedGoalValues,
  allowedNutritionValues,
  allowedSleepValues,
  buildProfile,
  defaultProfile
} from "./dashboardDataBuildersService";

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
    // "7 - 8 hours" has spaces around the hyphen -- that is the literal value
    // of the <option> in HomePersonalStage.jsx. An earlier version of this
    // fixture used "7-8 hours" (no spaces), which useBodyModel's lowercased
    // lookup would never match; fixtures must be built from what the form
    // actually stores, not from what looks plausible.
    const profile = buildProfile({
      sleep: "7 - 8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "HIIT"
    });

    expect(profile).toMatchObject({
      sleep: "7 - 8 hours",
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
    // trainingDays is validated against the seven day names, so an 8th entry
    // has to be a repeat rather than an 8th distinct value -- there isn't one.
    const eight = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
      "Monday"
    ];
    expect(buildProfile({ trainingDays: eight }).trainingDays).toHaveLength(7);
  });

  test("rejects a value in trainingDays that is not one of the seven days", () => {
    expect(buildProfile({ trainingDays: ["Monday", "Someday"] }).trainingDays).toEqual(["Monday"]);
  });

  test("dedupes repeated entries in trainingDays", () => {
    expect(buildProfile({ trainingDays: ["Monday", "Monday", "Tuesday"] }).trainingDays).toEqual([
      "Monday",
      "Tuesday"
    ]);
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

  test("accepts a sleep option from the allowed list and rejects anything else", () => {
    expect(buildProfile({ sleep: allowedSleepValues[2] }).sleep).toBe(allowedSleepValues[2]);
    expect(buildProfile({ sleep: "A solid 9 hours" }).sleep).toBe("");
  });

  test("accepts an experience option from the allowed list and rejects anything else", () => {
    expect(buildProfile({ experience: allowedExperienceValues[0] }).experience).toBe(
      allowedExperienceValues[0]
    );
    expect(buildProfile({ experience: "Elite" }).experience).toBe("");
  });

  test("accepts a nutrition option from the allowed list and rejects anything else", () => {
    expect(buildProfile({ nutrition: allowedNutritionValues[3] }).nutrition).toBe(
      allowedNutritionValues[3]
    );
    expect(buildProfile({ nutrition: "Carnivore" }).nutrition).toBe("");
  });

  test("accepts a cardio option from the allowed list, including Mixed, and rejects anything else", () => {
    expect(buildProfile({ cardio: allowedCardioValues[7] }).cardio).toBe("Mixed");
    expect(buildProfile({ cardio: "Boxing" }).cardio).toBe("");
  });

  test("still strips genuinely unknown fields", () => {
    expect(buildProfile({ favouriteColour: "green" })).not.toHaveProperty("favouriteColour");
  });
});
