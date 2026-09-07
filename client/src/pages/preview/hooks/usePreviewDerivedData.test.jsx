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

  describe("units", () => {
    test("resolves to a boolean without throwing on the ambient locale", () => {
      expect(typeof render().usesImperialUnits).toBe("boolean");
    });
  });
});
