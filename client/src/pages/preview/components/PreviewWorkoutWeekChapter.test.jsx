import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PreviewWorkoutWeekChapter from "./PreviewWorkoutWeekChapter";
import { PREVIEW_WEEK_TEXT_ROW_CONFIG } from "../constants";

// Presentational, but the class gates are the whole animation choreography:
// six stages each unlock a layer of the table, and a threshold off by one
// shows the visitor the wrong step of a sequence they are being walked
// through. The typed text arrives from injected getters, so this asserts what
// the component asks for and what it does with the answer, not the typing.

const day = (overrides = {}) => ({
  day: "Monday",
  session: "Upper Strength",
  meta: "50 min - Commercial",
  workout: "Bench - Row - Curl",
  highlights: ["Strength emphasis", "Main lift"],
  isTraining: true,
  ...overrides
});

const renderChapter = (props = {}) =>
  render(
    <PreviewWorkoutWeekChapter
      previewWeekLineOffsets={{ horizontal: [0, 40, 80], vertical: [0, 60, 120] }}
      previewWeekStage={6}
      previewWeekTypingProgress={1}
      previewWeekPlan={[day()]}
      previewWeekTableWrapRef={{ current: null }}
      previewWeekParticleLayerRef={{ current: null }}
      getPreviewWeekHeaderTypedText={(text) => text}
      getPreviewWeekTypedText={(text) => text}
      {...props}
    />
  );

const root = () => screen.getByLabelText("Generated weekly workout preview");

const classesAt = (stage, extra = {}) => {
  const { unmount } = renderChapter({ previewWeekStage: stage, ...extra });
  const className = root().className;
  unmount();
  return className;
};

describe("PreviewWorkoutWeekChapter", () => {
  describe("the stage gates", () => {
    test.each([
      ["is-outline-active", 1],
      ["is-headers-visible", 2],
      ["is-rows-visible", 3],
      ["is-scan-once", 5],
      ["is-breaking-apart", 6]
    ])("%s appears at stage %i and not before", (className, stage) => {
      expect(classesAt(stage - 1)).not.toContain(className);
      expect(classesAt(stage)).toContain(className);
    });

    test("each gate stays on for every later stage", () => {
      // They accumulate rather than replace: the outline does not vanish when
      // the headers arrive.
      expect(classesAt(6)).toContain("is-outline-active");
      expect(classesAt(6)).toContain("is-headers-visible");
      expect(classesAt(6)).toContain("is-rows-visible");
    });

    test("stage zero shows none of them", () => {
      const className = classesAt(0);

      ["is-outline-active", "is-headers-visible", "is-rows-visible", "is-scan-once"].forEach(
        (name) => expect(className).not.toContain(name)
      );
    });

    test("the particle break carries its anime marker with it", () => {
      // The hook keys its timeline off this second class, so the two have to
      // arrive together.
      expect(classesAt(6)).toContain("is-anime-particle-break");
    });
  });

  describe("the typing marker", () => {
    test("is on while the rows are typing", () => {
      expect(classesAt(3, { previewWeekTypingProgress: 0.4 })).toContain("is-typing");
    });

    test("comes off the moment typing completes", () => {
      expect(classesAt(3, { previewWeekTypingProgress: 1 })).not.toContain("is-typing");
    });

    test("is not on before the rows are visible, however the progress reads", () => {
      // Progress can be left over from the previous run of the sequence.
      expect(classesAt(2, { previewWeekTypingProgress: 0.4 })).not.toContain("is-typing");
    });
  });

  describe("the outline", () => {
    test("draws a line per offset in both directions", () => {
      renderChapter();

      expect(document.querySelectorAll(".preview-week-outline-line.horizontal")).toHaveLength(3);
      expect(document.querySelectorAll(".preview-week-outline-line.vertical")).toHaveLength(3);
    });

    test("marks the first and last of each run as edges", () => {
      // The edges are drawn differently from the inner rules; mislabelling
      // them puts a heavy border through the middle of the table.
      renderChapter();
      const horizontal = document.querySelectorAll(".preview-week-outline-line.horizontal");
      const vertical = document.querySelectorAll(".preview-week-outline-line.vertical");

      expect(horizontal[0].className).toContain("is-top-edge");
      expect(horizontal[2].className).toContain("is-bottom-edge");
      expect(horizontal[1].className).not.toContain("is-top-edge");
      expect(vertical[0].className).toContain("is-left-edge");
      expect(vertical[2].className).toContain("is-right-edge");
    });

    test("a single line is both edges at once", () => {
      renderChapter({ previewWeekLineOffsets: { horizontal: [0], vertical: [0] } });
      const only = document.querySelector(".preview-week-outline-line.horizontal");

      expect(only.className).toContain("is-top-edge");
      expect(only.className).toContain("is-bottom-edge");
    });

    test("no offsets at all still renders the frame", () => {
      expect(() =>
        renderChapter({ previewWeekLineOffsets: { horizontal: [], vertical: [] } })
      ).not.toThrow();
      expect(document.querySelectorAll(".preview-week-outline-corner")).toHaveLength(4);
    });
  });

  describe("the table", () => {
    test("has a column per day", () => {
      renderChapter({ previewWeekPlan: [day(), day({ day: "Tuesday" })] });

      expect(screen.getAllByText("Monday")).toHaveLength(1);
      expect(screen.getAllByText("Tuesday")).toHaveLength(1);
    });

    test("has a row per configured field, plus highlights", () => {
      renderChapter();

      PREVIEW_WEEK_TEXT_ROW_CONFIG.forEach((rowConfig) => {
        expect(screen.getByText(rowConfig.label)).toBeInTheDocument();
      });
      expect(screen.getByText("Highlights")).toBeInTheDocument();
    });

    test("puts each field's value in its own row", () => {
      renderChapter();

      expect(screen.getByText("Upper Strength")).toBeInTheDocument();
      expect(screen.getByText("50 min - Commercial")).toBeInTheDocument();
      expect(screen.getByText("Bench - Row - Curl")).toBeInTheDocument();
    });

    test.each([
      [true, "is-training"],
      [false, "is-recovery"]
    ])("a day with isTraining %s is marked %s", (isTraining, expected) => {
      renderChapter({ previewWeekPlan: [day({ isTraining })] });
      const cells = document.querySelectorAll(".preview-week-day-cell");

      cells.forEach((cell) => expect(cell.className).toContain(expected));
    });

    test("day cells only become visible once the rows do", () => {
      const { unmount } = renderChapter({ previewWeekStage: 2 });
      document
        .querySelectorAll("td.preview-week-day-cell")
        .forEach((cell) => expect(cell.className).not.toContain("is-visible"));
      unmount();

      renderChapter({ previewWeekStage: 3 });
      document
        .querySelectorAll("td.preview-week-day-cell")
        .forEach((cell) => expect(cell.className).toContain("is-visible"));
    });

    test("row labels become visible a stage earlier than the cells", () => {
      renderChapter({ previewWeekStage: 2 });

      document
        .querySelectorAll(".preview-week-row-label")
        .forEach((label) => expect(label.className).toContain("is-visible"));
      document
        .querySelectorAll("td.preview-week-day-cell")
        .forEach((cell) => expect(cell.className).not.toContain("is-visible"));
    });

    test("lists every highlight the day carries", () => {
      renderChapter();
      const cell = document.querySelector(".preview-week-highlights-cell");

      expect(within(cell).getByText("Strength emphasis")).toBeInTheDocument();
      expect(within(cell).getByText("Main lift")).toBeInTheDocument();
    });

    test("an empty plan still renders the table rather than nothing", () => {
      renderChapter({ previewWeekPlan: [] });

      expect(document.querySelector(".preview-week-table")).toBeTruthy();
      expect(document.querySelectorAll(".preview-week-day-cell")).toHaveLength(0);
    });
  });

  describe("what it asks the typing helpers for", () => {
    test("passes each row's label to the header helper", () => {
      const getPreviewWeekHeaderTypedText = vi.fn((text) => text);
      renderChapter({ getPreviewWeekHeaderTypedText });

      const asked = getPreviewWeekHeaderTypedText.mock.calls.map(([text]) => text);
      PREVIEW_WEEK_TEXT_ROW_CONFIG.forEach((rowConfig) => {
        expect(asked).toContain(rowConfig.label);
      });
      expect(asked).toContain("Highlights");
    });

    test("passes each cell's value to the body helper", () => {
      const getPreviewWeekTypedText = vi.fn((text) => text);
      renderChapter({ getPreviewWeekTypedText });

      const asked = getPreviewWeekTypedText.mock.calls.map(([text]) => text);
      expect(asked).toContain("Upper Strength");
      expect(asked).toContain("50 min - Commercial");
      expect(asked).toContain("Strength emphasis");
    });

    test("a missing field is asked for as an empty string, not as undefined", () => {
      // `String(undefined)` would ask the helper to type the word "undefined".
      const getPreviewWeekTypedText = vi.fn((text) => text);
      renderChapter({
        previewWeekPlan: [day({ session: undefined, meta: undefined, workout: undefined })],
        getPreviewWeekTypedText
      });

      const asked = getPreviewWeekTypedText.mock.calls.map(([text]) => text);
      expect(asked).not.toContain("undefined");
      expect(asked).toContain("");
    });
  });

  describe("empty text", () => {
    // Every cell falls back to a non-breaking space. An empty one collapses to
    // zero height, and the whole table jumps as the typing fills it in.
    test("an untyped cell holds its height with a non-breaking space", () => {
      renderChapter({ getPreviewWeekTypedText: () => "" });
      const cell = document.querySelector("td.preview-week-day-cell p");

      expect(cell.textContent).toBe(" ");
    });

    test("an untyped row label does too", () => {
      renderChapter({ getPreviewWeekHeaderTypedText: () => "" });
      const label = document.querySelector(".preview-week-row-label");

      expect(label.textContent).toBe(" ");
    });

    test("an untyped highlight is marked empty rather than typed", () => {
      renderChapter({ getPreviewWeekTypedText: () => "" });
      const items = document.querySelectorAll(".preview-week-highlights li");

      items.forEach((item) => {
        expect(item.className).toBe("is-empty");
        expect(item.textContent).toBe(" ");
      });
    });

    test("a typed highlight is marked typed", () => {
      renderChapter();
      const item = document.querySelector(".preview-week-highlights li");

      expect(item.className).toBe("is-typed");
    });
  });

  describe("the refs the animation hook attaches to", () => {
    test("are handed the wrap and the particle layer", () => {
      // The dissolve measures the wrap and appends particles to the layer, so
      // it does nothing at all if either ref never lands.
      const previewWeekTableWrapRef = { current: null };
      const previewWeekParticleLayerRef = { current: null };
      renderChapter({ previewWeekTableWrapRef, previewWeekParticleLayerRef });

      expect(previewWeekTableWrapRef.current).toHaveClass("preview-week-table-wrap");
      expect(previewWeekParticleLayerRef.current).toHaveClass("preview-week-particle-layer");
    });
  });
});
