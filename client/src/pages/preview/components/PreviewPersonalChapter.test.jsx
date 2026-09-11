import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PreviewPersonalChapter from "./PreviewPersonalChapter";
import { TRAINING_DAY_OPTIONS } from "../constants";

// The form the preview types into, and the builder strip that assembles the
// plan beside it. Every field is read-only and driven by `previewFilledFields`,
// so what is worth pinning is which values reach which field, the unit
// toggles, and the six builder stages -- a threshold off by one shows the
// visitor a step of the sequence that has not happened yet.

const renderChapter = (props = {}) =>
  render(
    <PreviewPersonalChapter
      previewPersonalCollapsed={false}
      previewPersonalShifted={false}
      previewBuilderStage={0}
      previewFilledFields={{}}
      heightUnit="cm"
      weightUnit="kg"
      getPreviewTextRows={() => 1}
      {...props}
    />
  );

const sequence = () => document.querySelector(".preview-personal-sequence");
const shell = () => document.querySelector(".preview-personal-form-shell");
const track = () => document.querySelector(".preview-builder-track");

const field = (name) => document.querySelector(`[name="${name}"]`);

describe("PreviewPersonalChapter", () => {
  describe("the form values", () => {
    test("each filled field reaches its own input", () => {
      // A copy-paste here puts the visitor's age in the name box, which is the
      // one thing this whole sequence exists to show off.
      renderChapter({
        previewFilledFields: { name: "Ada", age: "34", notes: "Knee sensitivity" }
      });

      expect(field("name")).toHaveValue("Ada");
      // Age is a number input, so it reads back as a number rather than the
      // string the fill sequence wrote.
      expect(field("age")).toHaveValue(34);
      expect(field("notes")).toHaveValue("Knee sensitivity");
    });

    test("an unfilled field is empty rather than uncontrolled", () => {
      renderChapter({ previewFilledFields: {} });
      expect(field("name")).toHaveValue("");
    });

    test.each([
      ["a number", 34],
      ["null", null],
      ["an array", ["Ada"]],
      ["an object", { first: "Ada" }]
    ])("a %s value is treated as empty rather than stringified", (_label, value) => {
      // The fill sequence writes strings; anything else is a bug upstream, and
      // rendering "[object Object]" into the name box would advertise it.
      renderChapter({ previewFilledFields: { name: value } });

      expect(field("name")).toHaveValue("");
    });

    test("the fields are read-only, since the visitor is watching rather than typing", () => {
      renderChapter({ previewFilledFields: { name: "Ada" } });
      expect(field("name")).toHaveAttribute("readonly");
    });

    test("submitting the form does nothing", () => {
      // This is a demo the visitor watches, embedded in a marketing page. A
      // submit that navigated or reloaded would interrupt the sequence.
      renderChapter();

      // fireEvent.submit returns false when a handler called preventDefault.
      expect(fireEvent.submit(document.querySelector("form"))).toBe(false);
    });

    test("the selects are inert, so clicking through the demo cannot change it", () => {
      // Every select is controlled with a no-op onChange. React requires the
      // handler on a controlled field, and what it has to do here is nothing:
      // the values belong to the fill sequence, not to the visitor.
      renderChapter({
        previewFilledFields: {
          sex: "Female",
          activity: "High",
          sleep: "6 - 7 hours",
          experience: "Advanced",
          nutrition: "Balanced",
          cardio: "Low"
        }
      });

      const selects = Array.from(document.querySelectorAll("select"));
      expect(selects.length).toBeGreaterThan(0);

      selects.forEach((select) => {
        const before = select.value;
        const other = Array.from(select.options).find((option) => option.value !== before);
        if (!other) return;

        fireEvent.change(select, { target: { value: other.value } });

        expect(select.value).toBe(before);
      });
    });

    test("the row count comes from the injected helper", () => {
      const getPreviewTextRows = vi.fn(() => 3);
      renderChapter({ getPreviewTextRows, previewFilledFields: { notes: "Long note" } });

      expect(getPreviewTextRows).toHaveBeenCalled();
      expect(field("notes")).toHaveAttribute("rows", "3");
    });
  });

  describe("the unit toggles", () => {
    test("centimetres shows a single height field", () => {
      renderChapter({ heightUnit: "cm" });

      expect(document.querySelector(".height-split")).toBeNull();
    });

    test("feet shows the split field instead", () => {
      renderChapter({ heightUnit: "ft" });

      expect(document.querySelector(".height-split")).toBeTruthy();
      expect(screen.getByText("ft")).toBeInTheDocument();
      expect(screen.getByText("in")).toBeInTheDocument();
    });

    test.each([
      ["cm", "pos-1"],
      ["ft", "pos-0"]
    ])("the height toggle in %s sits at %s", (heightUnit, expected) => {
      renderChapter({ heightUnit });
      const toggle = document.querySelector(".metric-height .unit-toggle");

      expect(toggle.className).toContain(expected);
    });

    test.each([
      ["kg", "pos-1"],
      ["lb", "pos-0"]
    ])("the weight toggle in %s sits at %s", (weightUnit, expected) => {
      renderChapter({ weightUnit });
      const toggle = document.querySelector(".field-weight .unit-toggle");

      expect(toggle.className).toContain(expected);
    });

    test.each([
      ["kg", "35", "200"],
      ["lb", "77", "440"]
    ])("the weight field's bounds follow the %s unit", (weightUnit, min, max) => {
      // A kilogram range on a pounds field would reject every plausible entry.
      renderChapter({ weightUnit });
      const weight = field("weight");

      expect(weight).toHaveAttribute("min", min);
      expect(weight).toHaveAttribute("max", max);
    });
  });

  describe("the training day toggles", () => {
    test("renders one per day of the week", () => {
      renderChapter();
      expect(document.querySelectorAll(".day-toggle-btn")).toHaveLength(
        TRAINING_DAY_OPTIONS.length
      );
    });

    test("marks only the chosen days active", () => {
      renderChapter({ previewFilledFields: { trainingDays: ["Monday", "Friday"] } });
      const active = Array.from(document.querySelectorAll(".day-toggle-btn.active")).map(
        (button) => button.textContent
      );

      expect(active).toEqual(["Mon", "Fri"]);
    });

    test("none are active before any are chosen", () => {
      renderChapter({ previewFilledFields: {} });
      expect(document.querySelectorAll(".day-toggle-btn.active")).toHaveLength(0);
    });

    test("a non-array trainingDays is treated as none rather than throwing", () => {
      // `"Monday".includes(day)` would silently match on substrings.
      expect(() =>
        renderChapter({ previewFilledFields: { trainingDays: "Monday" } })
      ).not.toThrow();
      expect(document.querySelectorAll(".day-toggle-btn.active")).toHaveLength(0);
    });

    test("the buttons are out of the tab order, since they are not operable", () => {
      renderChapter();
      document
        .querySelectorAll(".day-toggle-btn")
        .forEach((button) => expect(button).toHaveAttribute("tabindex", "-1"));
    });
  });

  describe("the collapse and the builder", () => {
    test("the form starts expanded", () => {
      renderChapter();
      expect(shell().className).not.toContain("is-collapsed");
    });

    test("it collapses once the sequence says so", () => {
      renderChapter({ previewPersonalCollapsed: true });
      expect(shell().className).toContain("is-collapsed");
    });

    test("the generate view shows it collapsed from the start", () => {
      // That chapter opens on a finished form, so it must not replay the
      // collapse the visitor already watched.
      renderChapter({ isGenerateView: true, previewPersonalCollapsed: false });

      expect(shell().className).toContain("is-collapsed");
      expect(sequence().className).toContain("is-generate-view");
    });

    test("the builder strip is inactive until the form shifts", () => {
      renderChapter({ previewPersonalShifted: false });

      expect(track().className).not.toContain("is-active");
      expect(track()).toHaveAttribute("aria-hidden", "true");
    });

    test("it activates when the form shifts", () => {
      renderChapter({ previewPersonalShifted: true });

      expect(track().className).toContain("is-active");
      expect(track()).toHaveAttribute("aria-hidden", "false");
      expect(sequence().className).toContain("is-builder-active");
    });

    test("the generate view activates it without waiting for the shift", () => {
      renderChapter({ isGenerateView: true, previewPersonalShifted: false });
      expect(track().className).toContain("is-active");
    });
  });

  describe("the builder stages", () => {
    const visibleAt = (stage, selector) => {
      const { unmount } = renderChapter({
        previewBuilderStage: stage,
        previewPersonalShifted: true
      });
      const visible = document.querySelector(selector).className.includes("is-visible");
      unmount();
      return visible;
    };

    test.each([
      ["the first plus", ".preview-builder-plus.plus-one", 1],
      ["the environment slot", ".preview-builder-slot.env", 2],
      ["the second plus", ".preview-builder-plus.plus-two", 3],
      ["the focus slot", ".preview-builder-slot.focus", 4],
      ["the generating label", ".preview-builder-generating", 6]
    ])("%s appears at stage %i and not before", (_label, selector, stage) => {
      expect(visibleAt(stage - 1, selector)).toBe(false);
      expect(visibleAt(stage, selector)).toBe(true);
    });

    test("the stage is carried on the root as a class", () => {
      // The CSS drives the whole strip off this, so an unstamped stage freezes
      // the animation with no error anywhere.
      renderChapter({ previewBuilderStage: 4 });
      expect(sequence().className).toContain("builder-stage-4");
    });

    test("stage zero shows none of the steps", () => {
      renderChapter({ previewBuilderStage: 0, previewPersonalShifted: true });

      expect(document.querySelectorAll(".preview-builder-track .is-visible")).toHaveLength(0);
    });

    test("the final stage shows all of them", () => {
      renderChapter({ previewBuilderStage: 6, previewPersonalShifted: true });

      [
        ".preview-builder-plus.plus-one",
        ".preview-builder-slot.env",
        ".preview-builder-plus.plus-two",
        ".preview-builder-slot.focus",
        ".preview-builder-generating"
      ].forEach((selector) => {
        expect(document.querySelector(selector).className).toContain("is-visible");
      });
    });
  });
});
