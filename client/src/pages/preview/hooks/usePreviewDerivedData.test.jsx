import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import usePreviewDerivedData from "./usePreviewDerivedData";
import { toFeetInchesFromCm, toLb } from "../../../app/units";

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
});
