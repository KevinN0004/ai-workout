import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import usePreviewDerivedData from "./usePreviewDerivedData";
import { toFeetInchesFromCm, toLb } from "../../../app/units";
import {
  JOHN_DOE_PREVIEW_PROFILE as JOHN_DOE,
  PREVIEW_WEEK_DAY_ORDER,
  PREVIEW_WEEK_MIN_WORKOUT_DAYS
} from "../constants";

// 620 lines and the largest untested client module. Most of it is derivation
// from the profile the visitor has typed so far, which is testable directly;
// the animation-progress arguments only select which slice of text is shown.

const render = (overrides = {}) =>
  renderHook(() =>
    usePreviewDerivedData({
      personal: {},
      form: {},
      weightUnit: "kg",
      toFeetInchesFromCm,
      toLb,
      resolvedHeightCm: null,
      resolvedWeightKg: null,
      effectiveBodyFat: null,
      previewStepIndex: 0,
      previewWeekStage: 0,
      previewWeekHeaderTypingProgress: 0,
      previewWeekTypingProgress: 0,
      ...overrides
    })
  ).result.current;

describe("usePreviewDerivedData", () => {
  test("returns the full derived shape from an empty profile", () => {
    const derived = render();

    expect(derived).toBeTruthy();
    [
      "usesImperialUnits",
      "activePreviewProfile",
      "previewWeekPlan",
      "previewDashboardSummary",
      "previewPersonalTargets",
      "previewFillOrder",
      "previewChapters",
      "activePreviewChapter"
    ].forEach((key) => expect(derived).toHaveProperty(key));
  });

  test("does not throw when every optional input is missing", () => {
    expect(() => render({ personal: {}, form: {} })).not.toThrow();
  });

  describe("chapter indices", () => {
    test("resolve to real positions in the chapter list", () => {
      const {
        previewChapters,
        generateChapterIndex,
        workoutWeekChapterIndex,
        dashboardPreviewChapterIndex
      } = render();

      expect(Array.isArray(previewChapters)).toBe(true);
      expect(previewChapters.length).toBeGreaterThan(0);
      [generateChapterIndex, workoutWeekChapterIndex, dashboardPreviewChapterIndex].forEach(
        (index) => {
          expect(Number.isInteger(index)).toBe(true);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(previewChapters.length);
        }
      );
    });

    test("are distinct, so the flow cannot advance to the chapter it is on", () => {
      const { generateChapterIndex, workoutWeekChapterIndex, dashboardPreviewChapterIndex } =
        render();
      const indices = [generateChapterIndex, workoutWeekChapterIndex, dashboardPreviewChapterIndex];

      expect(new Set(indices).size).toBe(indices.length);
    });

    test("every chapter carries an id", () => {
      render().previewChapters.forEach((chapter) => {
        expect(typeof chapter.id).toBe("string");
        expect(chapter.id).not.toBe("");
      });
    });
  });

  describe("profile derivation", () => {
    test("falls back to sensible defaults when nothing is entered", () => {
      const { activePreviewProfile } = render();

      expect(
        Number(activePreviewProfile.heightCm) > 0 || activePreviewProfile.heightCm === ""
      ).toBe(true);
      expect(activePreviewProfile).toBeTruthy();
    });

    test("prefers the resolved measurements it is handed", () => {
      const { activePreviewProfile } = render({
        resolvedHeightCm: 180,
        resolvedWeightKg: 80
      });

      expect(Number(activePreviewProfile.heightCm)).toBe(180);
      expect(Number(activePreviewProfile.weightKg)).toBe(80);
    });

    test("carries the chosen training days through, not a count of them", () => {
      const { activePreviewProfile } = render({
        personal: { trainingDays: ["Monday", "Wednesday", "Friday"] }
      });

      expect(activePreviewProfile.trainingDays).toEqual(["Monday", "Wednesday", "Friday"]);
    });

    test("falls back to the sample profile's days when none are chosen", () => {
      const { activePreviewProfile } = render({ personal: { trainingDays: [] } });

      expect(Array.isArray(activePreviewProfile.trainingDays)).toBe(true);
      expect(activePreviewProfile.trainingDays.length).toBeGreaterThan(0);
    });
  });

  describe("preview week plan", () => {
    test("is a non-empty list of days, each with an identifier", () => {
      const { previewWeekPlan } = render();

      expect(Array.isArray(previewWeekPlan)).toBe(true);
      expect(previewWeekPlan.length).toBeGreaterThan(0);
      previewWeekPlan.forEach((day) => {
        expect(day).toBeTruthy();
        expect(typeof day).toBe("object");
      });
    });
  });

  describe("fill order", () => {
    test("lists the fields the typing animation walks through", () => {
      const { previewFillOrder, previewPersonalTargets } = render();

      expect(Array.isArray(previewFillOrder)).toBe(true);
      expect(previewFillOrder.length).toBeGreaterThan(0);
      // Every field the animation fills must have a target value to fill it
      // with, or the sequence types nothing and looks broken.
      previewFillOrder.forEach((field) => {
        expect(previewPersonalTargets).toHaveProperty(field);
      });
    });

    test("contains no duplicates", () => {
      const { previewFillOrder } = render();
      expect(new Set(previewFillOrder).size).toBe(previewFillOrder.length);
    });
  });

  describe("typing progress", () => {
    test("reveals no header text at zero progress and full text at one", () => {
      const none = render({ previewWeekHeaderTypingProgress: 0, previewWeekStage: 3 });
      const all = render({ previewWeekHeaderTypingProgress: 1, previewWeekStage: 3 });

      const noneText = none.getPreviewWeekHeaderTypedText?.(0) ?? "";
      const allText = all.getPreviewWeekHeaderTypedText?.(0) ?? "";
      expect(String(noneText).length).toBeLessThanOrEqual(String(allText).length);
    });

    // Both helpers return a row *count* used to size a textarea, not rows.
    test("getPreviewTextRows grows with text length and stays clamped", () => {
      const { getPreviewTextRows } = render();

      expect(getPreviewTextRows("")).toBe(1);
      expect(getPreviewTextRows(null)).toBe(1);
      expect(getPreviewTextRows("short")).toBe(1);
      expect(getPreviewTextRows("x".repeat(45))).toBe(2);
      // Clamped at 4 however long the text gets.
      expect(getPreviewTextRows("x".repeat(5000))).toBe(4);
      expect(getPreviewTextRows("x".repeat(5000), 1, 8)).toBe(8);
    });

    test("getPreviewFieldRows prefers an explicit row count over estimating", () => {
      const { getPreviewFieldRows } = render();

      expect(getPreviewFieldRows({ rows: 6, value: "x" })).toBe(6);
      expect(getPreviewFieldRows({ value: "" })).toBe(1);
      expect(getPreviewFieldRows({ value: "x".repeat(45) })).toBe(2);
      expect(getPreviewFieldRows({ value: "x".repeat(5000) })).toBe(4);
      // A nonsense rows value falls back to estimating rather than propagating.
      expect(getPreviewFieldRows({ rows: 0, value: "" })).toBe(1);
      expect(getPreviewFieldRows({ rows: "many", value: "" })).toBe(1);
      // A field with no value at all, which is what an unfilled one is. The
      // `?? ""` that handles it cannot be mutation-tested: without it the text
      // becomes "undefined" or "null", both short enough to estimate a single
      // row, so every input gives the same answer either way.
      expect(getPreviewFieldRows({})).toBe(1);
      expect(getPreviewFieldRows({ value: null })).toBe(1);
    });
  });

  describe("week typing gates", () => {
    // The two typed-text helpers are gated on previewWeekStage, and every
    // existing test renders at stage 0 -- so the stages that actually reveal
    // text were never exercised.
    const HEADER = "Your week at a glance";

    test.each([[0], [1]])("the header shows nothing before stage 2 (stage %i)", (stage) => {
      const { getPreviewWeekHeaderTypedText } = render({
        previewWeekStage: stage,
        previewWeekHeaderTypingProgress: 1
      });
      expect(getPreviewWeekHeaderTypedText(HEADER)).toBe("");
    });

    test("at stage 2 the header follows the typing progress", () => {
      const { getPreviewWeekHeaderTypedText } = render({
        previewWeekStage: 2,
        previewWeekHeaderTypingProgress: 0.5
      });
      const typed = getPreviewWeekHeaderTypedText(HEADER);
      expect(typed).toBe(HEADER.slice(0, Math.ceil(HEADER.length * 0.5)));
      expect(typed.length).toBeLessThan(HEADER.length);
    });

    test("stage 3 forces the header complete regardless of progress", () => {
      // Past the header's own stage its animation is done, so a stale progress
      // value must not re-truncate it.
      const { getPreviewWeekHeaderTypedText } = render({
        previewWeekStage: 3,
        previewWeekHeaderTypingProgress: 0
      });
      expect(getPreviewWeekHeaderTypedText(HEADER)).toBe(HEADER);
    });

    test.each([[0], [1], [2]])("the body shows nothing before stage 3 (stage %i)", (stage) => {
      const { getPreviewWeekTypedText } = render({
        previewWeekStage: stage,
        previewWeekTypingProgress: 1
      });
      expect(getPreviewWeekTypedText("Monday")).toBe("");
    });

    test("at stage 3 the body follows its own progress", () => {
      const { getPreviewWeekTypedText } = render({
        previewWeekStage: 3,
        previewWeekTypingProgress: 0.5
      });
      expect(getPreviewWeekTypedText("Monday")).toBe("Mon");
    });

    test("progress at or above 1 returns the whole string", () => {
      const { getPreviewWeekTypedText } = render({
        previewWeekStage: 3,
        previewWeekTypingProgress: 1
      });
      expect(getPreviewWeekTypedText("Monday")).toBe("Monday");
    });

    test.each([[null], [undefined], [0]])(
      "coerces %s to a string rather than throwing",
      (value) => {
        const { getPreviewWeekTypedText, getPreviewWeekHeaderTypedText } = render({
          previewWeekStage: 3,
          previewWeekTypingProgress: 1,
          previewWeekHeaderTypingProgress: 1
        });
        expect(typeof getPreviewWeekTypedText(value)).toBe("string");
        expect(typeof getPreviewWeekHeaderTypedText(value)).toBe("string");
      }
    );
  });

  describe("personal targets", () => {
    // Every field is String(x ?? ""). The existing tests render an empty
    // profile, so only the nullish side of each of those was reached.
    const populated = {
      personal: {
        name: "Ada",
        age: "31",
        sex: "female",
        trainingDays: ["monday", "wednesday", "friday"]
      },
      resolvedHeightCm: 170,
      resolvedWeightKg: 65,
      effectiveBodyFat: 22
    };

    test("every field comes back as a string", () => {
      const { previewPersonalTargets } = render(populated);
      for (const [key, value] of Object.entries(previewPersonalTargets)) {
        if (key === "trainingDays") continue;
        expect(typeof value).toBe("string");
      }
    });

    test("carries through what the visitor actually entered", () => {
      const { previewPersonalTargets } = render(populated);
      expect(previewPersonalTargets.name).toBe("Ada");
      expect(previewPersonalTargets.age).toBe("31");
      expect(previewPersonalTargets.sex).toBe("female");
      expect(previewPersonalTargets.trainingDays).toEqual(["monday", "wednesday", "friday"]);
    });

    test("still yields strings, never null, from an empty profile", () => {
      const { previewPersonalTargets } = render();
      for (const [key, value] of Object.entries(previewPersonalTargets)) {
        if (key === "trainingDays") continue;
        expect(value).not.toBeNull();
        expect(typeof value).toBe("string");
      }
      expect(Array.isArray(previewPersonalTargets.trainingDays)).toBe(true);
    });

    test("imperial input produces feet and inches alongside the centimetre value", () => {
      const { previewPersonalTargets } = render({ ...populated, weightUnit: "lb" });
      expect(previewPersonalTargets.heightFeet).not.toBe("");
      expect(previewPersonalTargets.heightInches).not.toBe("");
    });
  });

  describe("units", () => {
    test("resolves to a boolean without throwing on the ambient locale", () => {
      expect(typeof render().usesImperialUnits).toBe("boolean");
    });
  });

  // Everything above renders an empty profile, so every `x || sample` pair in
  // this file took its fallback and the visitor's own value was never seen
  // winning. These drive the other side.

  describe("the visitor's own entries win over the sample profile", () => {
    const FILLED = {
      name: "  Ada  ",
      age: "29",
      sex: "Female",
      activity: "High",
      sleep: "6 - 7 hours",
      timeline: "8 weeks",
      experience: "Advanced",
      nutrition: "Balanced",
      cardio: "Low",
      notes: "Right shoulder impingement.",
      trainingDays: ["Wednesday", "Friday"]
    };

    test.each([
      ["age", "29"],
      ["sex", "Female"],
      ["activity", "High"],
      ["sleep", "6 - 7 hours"],
      ["timeline", "8 weeks"],
      ["experience", "Advanced"],
      ["nutrition", "Balanced"],
      ["cardio", "Low"],
      ["notes", "Right shoulder impingement."]
    ])("%s", (field, expected) => {
      const { activePreviewProfile } = render({ personal: FILLED });
      expect(activePreviewProfile[field]).toBe(expected);
    });

    test("the name is trimmed, so stray spacing does not reach the preview", () => {
      const { activePreviewProfile } = render({ personal: FILLED });
      expect(activePreviewProfile.name).toBe("Ada");
    });

    test("a name of only spaces falls back rather than rendering blank", () => {
      const { activePreviewProfile } = render({ personal: { name: "   " } });
      expect(activePreviewProfile.name).toBe(JOHN_DOE.name);
    });

    test.each([
      ["goal", "Lose fat", "goal"],
      ["duration", "35", "duration"],
      ["environment", "Home", "environment"]
    ])("the form's %s carries through", (field, value, key) => {
      const { activePreviewProfile } = render({ form: { [field]: value } });
      expect(activePreviewProfile[key]).toBe(value);
    });

    test("chosen equipment and focuses replace the sample lists", () => {
      const { activePreviewProfile } = render({
        form: { equipment: ["Dumbbells"], focuses: ["Mobility"] }
      });

      expect(activePreviewProfile.equipment).toEqual(["Dumbbells"]);
      expect(activePreviewProfile.focuses).toEqual(["Mobility"]);
    });

    test("empty equipment and focuses lists fall back rather than emptying the plan", () => {
      const { activePreviewProfile } = render({ form: { equipment: [], focuses: [] } });

      expect(activePreviewProfile.equipment).toEqual(JOHN_DOE.equipment);
      expect(activePreviewProfile.focuses).toEqual(JOHN_DOE.focuses);
    });

    test("the day count is inferred from the chosen days when the form has none", () => {
      // The visitor picks days on one screen and a count on another; picking
      // three days and leaving the count blank must not show the sample's 4.
      const { activePreviewProfile } = render({
        personal: { trainingDays: ["Monday", "Wednesday", "Friday"] }
      });

      expect(activePreviewProfile.days).toBe("3");
    });

    test("an explicit day count beats the inferred one", () => {
      const { activePreviewProfile } = render({
        personal: { trainingDays: ["Monday", "Wednesday"] },
        form: { days: "5" }
      });

      expect(activePreviewProfile.days).toBe("5");
    });

    test("an empty trainingDays list falls back to the sample's", () => {
      const { activePreviewProfile } = render({ personal: { trainingDays: [] } });
      expect(activePreviewProfile.trainingDays).toEqual(JOHN_DOE.trainingDays);
    });
  });

  describe("the measurements it derives", () => {
    test("a supplied body fat is used as given", () => {
      const { previewPersonalTargets } = render({ effectiveBodyFat: 22.4 });
      expect(previewPersonalTargets.computedBodyFat).toBe("22.4");
    });

    test.each([
      ["below the floor", 1, "3"],
      ["above the ceiling", 90, "60"]
    ])("a body fat %s is clamped", (_label, input, expected) => {
      // These come from a free-text field, so an implausible figure reaches
      // here and would otherwise drive the whole dashboard estimate.
      const { previewPersonalTargets } = render({ effectiveBodyFat: input });
      expect(previewPersonalTargets.computedBodyFat).toBe(expected);
    });

    test("a null body fat falls back to the sample's rather than estimating", () => {
      // `??` only falls through on null, so the sample figure is still a real
      // number here and the BMI estimate is not reached.
      const { previewPersonalTargets } = render({ effectiveBodyFat: null });
      expect(previewPersonalTargets.computedBodyFat).toBe(String(JOHN_DOE.bodyFat));
    });

    test("an unparseable body fat is estimated from BMI rather than left blank", () => {
      const { previewPersonalTargets } = render({
        effectiveBodyFat: "not a number",
        resolvedHeightCm: 180,
        resolvedWeightKg: 80
      });

      // 80 / 1.8^2 = 24.7 BMI, and 1.35 * 24.7 - 13.5 is 19.8.
      expect(previewPersonalTargets.computedBodyFat).toBe("19.8");
    });

    test.each([
      ["zero", 0],
      ["negative", -20]
    ])("a %s height is replaced with a usable default", (_label, heightCm) => {
      // Dividing by a zero height makes BMI infinite, which clamps to 60 -- a
      // number still inside every plausible range, so the estimate has to be
      // checked exactly. The unparseable body fat forces the BMI path; with a
      // usable one the height never reaches the arithmetic at all.
      const { previewPersonalTargets } = render({
        effectiveBodyFat: "unparseable",
        resolvedHeightCm: heightCm,
        resolvedWeightKg: 84
      });

      // Falls back to 175cm, so 84 / 1.75^2 = 27.4 BMI and 1.35 * 27.4 - 13.5.
      expect(previewPersonalTargets.computedBodyFat).toBe("23.5");
    });

    test("a zero weight is replaced too", () => {
      // Unguarded this is a BMI of 0, which clamps to the 3% floor.
      const { previewPersonalTargets } = render({
        effectiveBodyFat: "unparseable",
        resolvedWeightKg: 0,
        resolvedHeightCm: 183
      });

      // Falls back to 72kg, so 72 / 1.83^2 = 21.5 BMI.
      expect(previewPersonalTargets.computedBodyFat).toBe("15.5");
    });

    test("a typed height is preferred over the resolved one", () => {
      const { previewPersonalTargets } = render({
        personal: { heightCm: "165" },
        resolvedHeightCm: 183
      });

      expect(previewPersonalTargets.heightCm).toBe("165");
    });

    test("a typed weight is preferred over the resolved one", () => {
      const { previewPersonalTargets } = render({
        personal: { weight: "70" },
        resolvedWeightKg: 84
      });

      expect(previewPersonalTargets.weight).toBe("70");
    });

    test("an untyped weight follows the chosen unit", () => {
      const metric = render({ weightUnit: "kg", resolvedWeightKg: 80 });
      const imperial = render({ weightUnit: "lb", resolvedWeightKg: 80 });

      expect(metric.previewPersonalTargets.weight).toBe("80");
      expect(imperial.previewPersonalTargets.weight).toBe("176");
    });
  });

  describe("the week plan it builds", () => {
    test("trains on the days the visitor picked", () => {
      const { previewWeekPlan } = render({
        personal: { trainingDays: ["Monday", "Wednesday", "Friday"] },
        form: { days: "3" }
      });
      const trainingDays = previewWeekPlan.filter((day) => day.isTraining).map((day) => day.day);

      expect(trainingDays).toEqual(expect.arrayContaining(["Monday", "Wednesday", "Friday"]));
    });

    test("tops up to the minimum when fewer days are picked", () => {
      // A one-day week is not a plan worth previewing, so the sample fills out
      // to the minimum rather than showing six rest days.
      const { previewWeekPlan } = render({
        personal: { trainingDays: ["Monday"] },
        form: { days: "1" }
      });

      expect(previewWeekPlan.filter((day) => day.isTraining)).toHaveLength(
        PREVIEW_WEEK_MIN_WORKOUT_DAYS
      );
    });

    test("asking for more days than a week has is capped", () => {
      // The clamp that does this is redundant in practice -- the top-up loop
      // walks PREVIEW_WEEK_DAY_ORDER and the plan is mapped from it, so the
      // set cannot exceed seven whatever the target says. Kept as a statement
      // of the contract rather than as a guard the tests can break.
      const { previewWeekPlan } = render({ form: { days: "12" } });

      expect(previewWeekPlan).toHaveLength(PREVIEW_WEEK_DAY_ORDER.length);
      expect(previewWeekPlan.every((day) => day.isTraining)).toBe(true);
    });

    test("short day names are understood as the days they name", () => {
      // The stored value has been abbreviated in older profiles. Asserted as
      // an exact set: with only two short names the week tops up to the
      // minimum anyway, and Monday and Wednesday would be among those five
      // whether or not the abbreviations were understood.
      const { previewWeekPlan } = render({
        personal: { trainingDays: ["mon", "wed", "fri", "sat", "sun"] },
        form: { days: "5" }
      });
      const trainingDays = previewWeekPlan.filter((day) => day.isTraining).map((day) => day.day);

      expect(trainingDays.sort()).toEqual(
        ["Friday", "Monday", "Saturday", "Sunday", "Wednesday"].sort()
      );
    });

    test("an unrecognised day is dropped rather than becoming a row", () => {
      const { previewWeekPlan } = render({ personal: { trainingDays: ["Blursday"] } });

      expect(previewWeekPlan.map((day) => day.day)).toEqual(PREVIEW_WEEK_DAY_ORDER);
    });

    test("the session duration and environment come from the form", () => {
      const { previewWeekPlan } = render({ form: { duration: "35", environment: "Home" } });
      const training = previewWeekPlan.find((day) => day.isTraining);

      expect(training.meta).toBe("35 min - Home");
    });

    test("a zero duration falls back rather than showing 0 min", () => {
      const { previewWeekPlan } = render({ form: { duration: "0" } });
      const training = previewWeekPlan.find((day) => day.isTraining);

      expect(training.meta).toBe(`${JOHN_DOE.duration} min - ${JOHN_DOE.environment}`);
    });

    test("rest days are marked as such and carry mobility work", () => {
      const { previewWeekPlan } = render({
        personal: { trainingDays: ["Monday"] },
        form: { days: "1" }
      });
      const rest = previewWeekPlan.find((day) => !day.isTraining);

      expect(rest.meta).toContain("Mobility");
      expect(rest.highlights.length).toBeGreaterThan(0);
    });

    test("the chosen focuses drive the training highlights", () => {
      const { previewWeekPlan } = render({ form: { focuses: ["Mobility"] } });
      const training = previewWeekPlan.find((day) => day.isTraining);

      expect(training.highlights[0]).toBe("Mobility emphasis");
    });
  });

  describe("the dashboard summary it derives", () => {
    test("reports progress against the weekly goal", () => {
      const { previewDashboardSummary } = render({ form: { days: "4" } });

      expect(previewDashboardSummary).toBeTruthy();
      expect(previewDashboardSummary.workoutProgress).toBeGreaterThanOrEqual(0);
      expect(previewDashboardSummary.workoutProgress).toBeLessThanOrEqual(100);
    });

    // The label is rendered in the visitor's own units, so these pin a metric
    // locale and read kilograms. jsdom's ambient locale is en-US, which
    // reports pounds and makes every comparison against 80 meaningless.
    const metricTarget = (overrides) => {
      vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
      vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
      const { previewDashboardSummary } = render({ weightUnit: "kg", ...overrides });
      return Number(String(previewDashboardSummary.targetWeightLabel).split(" ")[0]);
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test.each([
      ["Lose fat and cut", "down"],
      ["Gain mass and bulk", "up"],
      ["Build lean strength", "down"]
    ])("a goal of %s moves the target weight %s", (goal, direction) => {
      // The target is the number the visitor is shown aiming at, so a cutting
      // goal showing a heavier target reads as the preview misunderstanding
      // what they asked for.
      const target = metricTarget({ form: { goal }, resolvedWeightKg: 80 });

      if (direction === "up") expect(target).toBeGreaterThan(80);
      else expect(target).toBeLessThan(80);
    });

    test("a very light visitor's cutting target does not go below the floor", () => {
      const target = metricTarget({ form: { goal: "Lose fat" }, resolvedWeightKg: 46 });

      expect(target).toBeGreaterThanOrEqual(45);
    });

    test("names today's session and the one after it", () => {
      const { previewDashboardSummary } = render();

      expect(previewDashboardSummary.todaySession).toBeTruthy();
      expect(previewDashboardSummary.todayName).toBeTruthy();
      expect(previewDashboardSummary.nextTrainingPlan?.isTraining).toBe(true);
    });

    test("reports a streak of at least a day", () => {
      const { previewDashboardSummary } = render();

      expect(previewDashboardSummary.streakDays).toBeGreaterThanOrEqual(1);
    });

    test("says the goal is reached when every session is done", () => {
      const { previewDashboardSummary } = render({ form: { days: "5" } });

      expect(previewDashboardSummary.goalPaceText).toBe("Weekly workout goal reached.");
    });

    test("and says it for every input, because the preview always completes its week", () => {
      // `goalPaceText` has three branches, and only this one is reachable.
      // The week is built to satisfy the same day count the goal is read from,
      // so `completedWorkouts` always meets `weeklyGoal` and the two "at this
      // pace" messages are dead. Swept here rather than reasoned about: the
      // day count is clamped twice and it is not obvious by inspection.
      const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

      for (let picked = 0; picked <= 6; picked += 1) {
        ["", "lots", "0", "1", "3", "5", "7", "12", "6.4"].forEach((days) => {
          const { previewDashboardSummary } = render({
            personal: { trainingDays: dayNames.slice(0, picked) },
            form: { days }
          });

          expect(previewDashboardSummary.goalPaceText).toBe("Weekly workout goal reached.");
        });
      }
    });

    test("the calorie series never drops to an impossible figure", () => {
      // The explicit 1200 floor in the source is belt-and-braces: the calorie
      // goal is already clamped to at least 1700 above it, a rest day is 0.9
      // of that, and the wave is at most 70, so the series bottoms out at
      // 1460. Swept across the whole clamped range; removing the floor changes
      // nothing, which is why it is not mutation-testable.
      const { previewDashboardSummary } = render();

      previewDashboardSummary.calorieSeries.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(1200);
      });
    });

    test("the calorie goal is clamped for an extreme weight", () => {
      const heavy = render({ resolvedWeightKg: 300 }).previewDashboardSummary;
      const light = render({ resolvedWeightKg: 40 }).previewDashboardSummary;

      expect(heavy.calorieGoal).toBeLessThanOrEqual(3400);
      expect(light.calorieGoal).toBeGreaterThanOrEqual(1700);
    });

    test("recent activity lists only training days", () => {
      const { previewDashboardSummary } = render();

      expect(previewDashboardSummary.recentActivity.length).toBeGreaterThan(0);
      previewDashboardSummary.recentActivity.forEach((entry) => {
        expect(entry.day).toBeTruthy();
        expect(entry.session).toBeTruthy();
      });
    });

    test("the meal plan follows whether today is a training day", () => {
      const { previewDashboardSummary } = render();

      expect(previewDashboardSummary.todayMealPlan).toBeTruthy();
      expect(previewDashboardSummary.todayMealPlan.calories).toBeGreaterThan(0);
    });
  });

  describe("when the injected unit converters give nothing back", () => {
    // `toLb` and `toFeetInchesFromCm` are passed in rather than imported, so
    // the hook has to cope with a converter that cannot parse its input. These
    // pass deliberately useless ones.
    const brokenToLb = () => "not a number";
    const brokenSplit = () => null;

    test("the weight field falls back to a usable figure", () => {
      const { previewPersonalTargets } = render({
        weightUnit: "lb",
        toLb: brokenToLb,
        resolvedWeightKg: 80
      });

      expect(previewPersonalTargets.weight).toBe("160");
    });

    test("the target weight label stays numeric, which rests on the converter", () => {
      // Worth knowing: this is the one `toLb` call site of three with no
      // `Number.isFinite` guard, so a converter returning something
      // unparseable would render "NaN lb" here. That is latent rather than
      // live -- `toLb` only returns a non-number when its input is falsy or
      // NaN, and `targetWeightKg` is always at least 45 -- so this pins the
      // real converter's contract rather than a fallback that does not exist.
      vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
      vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");

      [45, 80, 300].forEach((resolvedWeightKg) => {
        const { previewDashboardSummary } = render({ resolvedWeightKg });
        expect(previewDashboardSummary.targetWeightLabel).toMatch(/^\d+ lb$/);
      });

      vi.restoreAllMocks();
    });

    test("height falls back to a plausible split rather than blank fields", () => {
      const { previewPersonalTargets } = render({ toFeetInchesFromCm: brokenSplit });

      expect(previewPersonalTargets.heightFeet).toBe("5");
      expect(previewPersonalTargets.heightInches).toBe("9");
    });
  });

  describe("a day count that is not a number", () => {
    // `days` comes from a free-text form field, and Number("") is 0 while
    // Number("lots") is NaN -- neither can be allowed to size the week.
    test.each([["lots"], [""], ["abc"]])("%s still yields a usable week", (days) => {
      const { previewWeekPlan, previewDashboardSummary } = render({ form: { days } });

      expect(previewWeekPlan).toHaveLength(PREVIEW_WEEK_DAY_ORDER.length);
      expect(previewDashboardSummary.weeklyGoal).toBeGreaterThanOrEqual(1);
      expect(previewDashboardSummary.weeklyGoal).toBeLessThanOrEqual(PREVIEW_WEEK_DAY_ORDER.length);
    });

    test("an unparseable count still trains at least the minimum", () => {
      const { previewWeekPlan } = render({
        personal: { trainingDays: ["Monday"] },
        form: { days: "lots" }
      });

      expect(previewWeekPlan.filter((day) => day.isTraining).length).toBeGreaterThanOrEqual(
        PREVIEW_WEEK_MIN_WORKOUT_DAYS
      );
    });
  });

  test("picking more days than the minimum is left alone rather than topped up", () => {
    const chosen = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const { previewWeekPlan } = render({ personal: { trainingDays: chosen } });

    expect(previewWeekPlan.filter((day) => day.isTraining)).toHaveLength(chosen.length);
  });

  test("a blank focus does not render an empty emphasis line", () => {
    const { previewWeekPlan } = render({ form: { focuses: ["", "Core"] } });
    const training = previewWeekPlan.filter((day) => day.isTraining);

    training.forEach((day) => {
      expect(day.highlights[0]).not.toBe(" emphasis");
    });
    expect(training[0].highlights[0]).toBe("Strength emphasis");
  });

  describe("the meal plan on a rest day", () => {
    // Which plan is shown depends on what day it is, so the clock is pinned
    // rather than left to decide the assertion.
    afterEach(() => {
      vi.useRealTimers();
    });

    test("differs from a training day's", () => {
      // 2026-09-13 is a Sunday, and the sample profile does not train then.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-13T09:00:00"));

      const rest = render({
        personal: { trainingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
        form: { days: "5" }
      }).previewDashboardSummary;

      expect(rest.todayName).toBe("Sunday");
      expect(rest.todayMealPlan).toBeTruthy();
      expect(rest.todayMealPlan.calories).toBeGreaterThan(0);
    });

    test("a training day's plan is shown when today is one", () => {
      // 2026-09-14 is a Monday, which the sample profile does train.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-14T09:00:00"));

      const training = render().previewDashboardSummary;

      expect(training.todayName).toBe("Monday");
      expect(training.todayWorkoutLines.length).toBeGreaterThan(0);
    });
  });

  describe("the active chapter", () => {
    test("follows the step index", () => {
      const { previewChapters } = render();

      previewChapters.forEach((chapter, index) => {
        expect(render({ previewStepIndex: index }).activePreviewChapter.id).toBe(chapter.id);
      });
    });

    test("a step index past the end falls back to the first chapter", () => {
      // The index comes from scroll position, which can overshoot. Note the
      // `||` here behaves identically to `??`, since the only falsy thing an
      // out-of-range array index yields is undefined -- so that operator
      // choice is not something a test can distinguish.
      const { activePreviewChapter, previewChapters } = render({ previewStepIndex: 99 });

      expect(activePreviewChapter.id).toBe(previewChapters[0].id);
    });

    test("the centred chapters reserve room for the contents lane", () => {
      const { previewChapters } = render();
      const centred = ["personal-info", "generate", "workout-week"];

      previewChapters.forEach((chapter, index) => {
        const { previewStageStyle } = render({ previewStepIndex: index });
        const pad = previewStageStyle["--preview-body-right-pad"];

        if (centred.includes(chapter.id)) expect(pad).not.toBe("0px");
        else expect(pad).toBe("0px");
      });
    });
  });

  test("the captured targets are taken once and not replaced on a later render", () => {
    // The typing animation replays against these, so a capture that moved with
    // the visitor's edits would restart the sequence with different values.
    const { rerender, result } = renderHook(
      ({ personal }) =>
        usePreviewDerivedData({
          personal,
          form: {},
          weightUnit: "kg",
          toFeetInchesFromCm,
          toLb,
          resolvedHeightCm: null,
          resolvedWeightKg: null,
          effectiveBodyFat: null,
          previewStepIndex: 0,
          previewWeekStage: 0,
          previewWeekHeaderTypingProgress: 0,
          previewWeekTypingProgress: 0
        }),
      { initialProps: { personal: { name: "First" } } }
    );

    const captured = result.current.previewInitialTargetsRef.current;
    expect(captured.name).toBe("First");

    rerender({ personal: { name: "Second" } });

    expect(result.current.previewPersonalTargets.name).toBe("Second");
    expect(result.current.previewInitialTargetsRef.current).toBe(captured);
    expect(result.current.previewInitialTargetsRef.current.name).toBe("First");
  });

  describe("an imperial visitor", () => {
    // usesImperialUnits is read once on mount, so the locale has to be in
    // place before the hook renders.
    const useLocale = (...locales) => {
      vi.spyOn(navigator, "languages", "get").mockReturnValue(locales);
      vi.spyOn(navigator, "language", "get").mockReturnValue(locales[0]);
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("is detected from the locale", () => {
      useLocale("en-US");
      expect(render().usesImperialUnits).toBe(true);
    });

    test("a metric locale is not", () => {
      useLocale("en-GB");
      expect(render().usesImperialUnits).toBe(false);
    });

    test("sees the target weight in pounds", () => {
      useLocale("en-US");
      const { previewDashboardSummary } = render({ resolvedWeightKg: 80 });

      expect(previewDashboardSummary.targetWeightLabel).toMatch(/lb$/);
    });

    test("a metric visitor sees kilograms", () => {
      useLocale("en-GB");
      const { previewDashboardSummary } = render({ resolvedWeightKg: 80 });

      expect(previewDashboardSummary.targetWeightLabel).toMatch(/kg$/);
    });

    test("an empty language list still resolves", () => {
      vi.spyOn(navigator, "languages", "get").mockReturnValue([]);
      vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");

      expect(render().usesImperialUnits).toBe(false);
    });

    test("a locale with no region falls back to the ambient one", () => {
      // `en` alone says nothing about units, so the region has to come from
      // somewhere else before defaulting.
      useLocale("en");

      expect(typeof render().usesImperialUnits).toBe("boolean");
    });
  });
});
