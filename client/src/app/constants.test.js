import { describe, expect, test } from "vitest";
import {
  activityOptions,
  cardioOptions,
  createDefaultPlannerForm,
  defaultPersonalForm,
  experienceOptions,
  goalOptions,
  nutritionOptions,
  sexOptions,
  sleepOptions
} from "./constants";
import {
  allowedActivityValues,
  allowedCardioValues,
  allowedExperienceValues,
  allowedGoalValues,
  allowedNutritionValues,
  allowedSexValues,
  allowedSleepValues
} from "../../../server/src/services/dashboardDataBuildersService.js";

// Every list here is duplicated on the server, which rejects anything outside
// it with a 400. A list that omits a real option therefore makes a legitimate
// dropdown choice unsaveable -- which is the defect class this whole change
// exists to close, and which has already happened once on this plan.
//
// These assertions also keep knip quiet: the lists have no importer until the
// settings field descriptors land, and CI fails on an unused export.

describe("goalOptions", () => {
  test("offers the five goals the planner prompt understands", () => {
    expect(goalOptions).toEqual([
      "Build lean strength and energy",
      "Fat loss + conditioning",
      "Mobility",
      "Recovery",
      "Cardio"
    ]);
  });

  // The planner's fallback must stay a member of the list, or a signed-out
  // visitor gets a goal the profile select cannot represent.
  test("the planner default is one of them", () => {
    expect(goalOptions).toContain(createDefaultPlannerForm().goal);
  });

  // PlannerSetupModal never exposes goal -- it offers days, duration, level and
  // injuries only -- so before this took an argument, every generated plan for
  // every user carried the same hardcoded goal into the Gemini prompt. The
  // profile's goal is what makes it the user's own.
  test("takes the goal it is given", () => {
    expect(createDefaultPlannerForm("Mobility").goal).toBe("Mobility");
  });

  test.each([
    ["nothing", undefined],
    ["an empty string", ""],
    ["null", null]
  ])("falls back to the first option when given %s", (_label, goal) => {
    expect(createDefaultPlannerForm(goal).goal).toBe(goalOptions[0]);
  });

  test("leaves the rest of the planner form alone", () => {
    expect(createDefaultPlannerForm("Recovery")).toMatchObject({
      equipment: [],
      duration: "45",
      level: "Intermediate",
      injuries: "None",
      days: "3",
      focuses: [],
      environment: "Home"
    });
  });
});

describe("the closed-set option lists", () => {
  test("offers the four sex values the server accepts", () => {
    expect(sexOptions).toEqual(["Female", "Male", "Non-binary", "Prefer not to say"]);
  });

  test("offers the four activity levels the server accepts", () => {
    expect(activityOptions).toEqual(["Light", "Moderate", "High", "Very high"]);
  });

  // The hyphen has spaces around it. "7-8 hours" is not a value the form can
  // produce, and an earlier draft of this plan had it wrong.
  test("spells the sleep bands exactly as the form does", () => {
    expect(sleepOptions).toEqual(["Less than 4", "4 - 6 hours", "7 - 8 hours", "More than 8"]);
  });

  test("offers the three experience levels", () => {
    expect(experienceOptions).toEqual(["Beginner", "Intermediate", "Advanced"]);
  });

  test("offers the six nutrition preferences", () => {
    expect(nutritionOptions).toEqual([
      "No preference",
      "High-protein",
      "Balanced",
      "Low-carb",
      "Vegetarian",
      "Vegan"
    ]);
  });

  // EIGHT, not seven. "Mixed" was dropped once already from a hand-written
  // copy of this list, and useBodyModel scores it 0.7 like any other.
  test("offers all eight cardio styles, including Mixed", () => {
    expect(cardioOptions).toEqual([
      "None",
      "Walking",
      "Running",
      "Cycling",
      "Rowing",
      "Swimming",
      "HIIT",
      "Mixed"
    ]);
  });
});

describe("defaultPersonalForm", () => {
  test("declares goal so the generic change handler can set it", () => {
    expect(defaultPersonalForm).toHaveProperty("goal", "");
  });
});

// The literal assertions above pin what these lists should say. This block pins
// that the server agrees, which is a different failure and the one with teeth:
// the server rejects an out-of-list value with a 400, so a divergence shows up
// to a user as a valid dropdown choice they cannot save.
//
// The running app cannot import across the wire, but a test can. Verified to
// pull the live arrays rather than resolving to something inert -- asserting a
// deliberately wrong value reports the real eight cardio entries back.
//
// Both mistakes this plan actually made -- dropping "Mixed" from cardio, and
// writing "7-8 hours" for "7 - 8 hours" -- would have failed here mechanically
// instead of needing a human to spot them.
describe("agreement with the server's allowlists", () => {
  test.each([
    ["sex", sexOptions, allowedSexValues],
    ["activity", activityOptions, allowedActivityValues],
    ["sleep", sleepOptions, allowedSleepValues],
    ["experience", experienceOptions, allowedExperienceValues],
    ["nutrition", nutritionOptions, allowedNutritionValues],
    ["cardio", cardioOptions, allowedCardioValues],
    ["goal", goalOptions, allowedGoalValues]
  ])("the %s list matches the server exactly", (_label, client, server) => {
    expect(client).toEqual(server);
  });
});
