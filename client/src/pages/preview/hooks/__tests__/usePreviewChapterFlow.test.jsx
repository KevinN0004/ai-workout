import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import usePreviewChapterFlow from "../usePreviewChapterFlow";
import {
  PREVIEW_BUILDER_START_DELAY_MS,
  PREVIEW_BUILDER_STEP_MS,
  PREVIEW_COLLAPSE_DELAY_MS,
  PREVIEW_DASHBOARD_FINAL_STAGE,
  PREVIEW_DASHBOARD_STAGE_START_MS,
  PREVIEW_DASHBOARD_STAGE_STEP_MS,
  PREVIEW_GENERATING_HOLD_MS,
  PREVIEW_POST_MORPH_SHIFT_DELAY_MS,
  PREVIEW_TRAINING_DAY_STEP_MS,
  PREVIEW_WEEK_HEADER_REVEAL_MS,
  PREVIEW_WEEK_OUTLINE_DRAW_MS,
  PREVIEW_WEEK_OUTLINE_START_MS,
  PREVIEW_WEEK_ROW_TYPING_MS,
  PREVIEW_WEEK_SCAN_DELAY_MS
} from "../../constants";

// This hook was on the "animation orchestration, cannot be tested" list next to
// the two that measure element rects. It measures nothing: it is a timed state
// machine over setTimeout, setInterval and Date.now, and fake timers drive all
// of it. What it decides -- which fields fill in what order, when the form
// collapses, when the page scrolls itself to the next chapter, and what a
// visitor who asked for reduced motion sees instead -- is observably right or
// wrong.

const TARGETS = {
  name: "Ada",
  sex: "female",
  age: "34",
  trainingDays: ["Mon", "Wed", "Fri"]
};

const FILL_ORDER = ["name", "sex", "age", "trainingDays"];

// The hook's own constants, not re-derived: a test that recomputed them would
// agree with a typo in the source.
const FILL_START_DELAY_MS = 420;
const FILL_STEP_MS = 220;

const stubMatchMedia = (reduced) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query) => ({
      matches: reduced,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
};

// Everything the hook writes to, captured as the page would see it.
const setup = ({
  chapter = "personal-info",
  generateChapterIndex = -1,
  workoutWeekChapterIndex = -1,
  targets = TARGETS,
  fillOrder = FILL_ORDER,
  initialTargets = null,
  initialFillOrder = null
} = {}) => {
  const state = {
    filledFields: {},
    personalCollapsed: null,
    personalShifted: null,
    builderStage: null,
    weekStage: null,
    dashboardStage: null,
    weekHeaderTypingProgress: null,
    weekTypingProgress: null
  };
  // setPreviewFilledFields takes an updater as often as a value.
  const setFilled = vi.fn((next) => {
    state.filledFields = typeof next === "function" ? next(state.filledFields) : next;
  });
  const setter = (key) =>
    vi.fn((value) => {
      state[key] = value;
    });

  const props = {
    generateChapterIndex,
    workoutWeekChapterIndex,
    previewInitialTargetsRef: { current: initialTargets },
    previewInitialFillOrderRef: { current: initialFillOrder },
    previewPersonalTargets: targets,
    previewFillOrder: fillOrder,
    previewFillTimeoutsRef: { current: [] },
    scrollToChapter: vi.fn(),
    setPreviewFilledFields: setFilled,
    setPreviewPersonalCollapsed: setter("personalCollapsed"),
    setPreviewPersonalShifted: setter("personalShifted"),
    setPreviewBuilderStage: setter("builderStage"),
    setPreviewWeekStage: setter("weekStage"),
    setPreviewDashboardStage: setter("dashboardStage"),
    setPreviewWeekHeaderTypingProgress: setter("weekHeaderTypingProgress"),
    setPreviewWeekTypingProgress: setter("weekTypingProgress")
  };

  const view = renderHook(
    ({ activePreviewChapterId }) => usePreviewChapterFlow({ ...props, activePreviewChapterId }),
    { initialProps: { activePreviewChapterId: chapter } }
  );

  return { ...view, state, props };
};

const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  stubMatchMedia(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("usePreviewChapterFlow", () => {
  describe("the personal-info fill", () => {
    test("starts from an empty form", () => {
      const { state } = setup();

      expect(state.filledFields).toEqual({});
      expect(state.personalCollapsed).toBe(false);
      expect(state.personalShifted).toBe(false);
      expect(state.builderStage).toBe(0);
    });

    test("fills each field in order, one step apart", () => {
      const { state } = setup();

      advance(FILL_START_DELAY_MS);
      expect(Object.keys(state.filledFields)).toEqual(["name"]);

      advance(FILL_STEP_MS);
      expect(Object.keys(state.filledFields)).toEqual(["name", "sex"]);

      advance(FILL_STEP_MS);
      expect(Object.keys(state.filledFields)).toEqual(["name", "sex", "age"]);
    });

    test("types a free-text field a character at a time", () => {
      // The whole point of the sequence: a name that appeared all at once
      // would not read as typing.
      const { state } = setup();

      advance(FILL_START_DELAY_MS);
      expect(state.filledFields.name).toBe("");

      // 3 characters, so the step is 560/3 rounded, clamped into [22, 58].
      advance(58);
      expect(state.filledFields.name).toBe("A");
      advance(58);
      expect(state.filledFields.name).toBe("Ad");
      advance(58);
      expect(state.filledFields.name).toBe("Ada");
    });

    test("stops typing at the end of the value rather than running on", () => {
      // The value alone does not show this: `slice(0, cursor)` returns the
      // same string once the cursor passes the end, so an interval that never
      // cleared would look identical while re-rendering the page every 58ms
      // for as long as the preview is open. The write count is what shows it.
      const { state, props } = setup();
      advance(FILL_START_DELAY_MS);
      advance(1000);
      expect(state.filledFields.name).toBe("Ada");

      const writes = props.setPreviewFilledFields.mock.calls.length;
      advance(10000);
      expect(props.setPreviewFilledFields.mock.calls.length).toBe(writes);
    });

    test("a select-style field appears whole, with no typing", () => {
      // PREVIEW_INSTANT_FIELDS holds the dropdowns. Typing into a select is
      // not a thing a visitor could be shown doing.
      const { state } = setup();

      advance(FILL_START_DELAY_MS + FILL_STEP_MS);
      expect(state.filledFields.sex).toBe("female");
    });

    test("an empty target is written as empty rather than typed", () => {
      const { state } = setup({ targets: { ...TARGETS, age: "" } });

      advance(FILL_START_DELAY_MS + FILL_STEP_MS * 2);
      expect(state.filledFields.age).toBe("");

      advance(1000);
      expect(state.filledFields.age).toBe("");
    });

    test("a missing target is coerced to empty rather than to the string undefined", () => {
      const { state } = setup({ targets: { name: "Ada", sex: "female" } });

      advance(FILL_START_DELAY_MS + FILL_STEP_MS * 2);
      expect(state.filledFields.age).toBe("");
    });

    test("training days arrive one at a time", () => {
      const { state } = setup();
      advance(FILL_START_DELAY_MS + FILL_STEP_MS * 3);

      expect(state.filledFields.trainingDays).toEqual([]);
      advance(PREVIEW_TRAINING_DAY_STEP_MS);
      expect(state.filledFields.trainingDays).toEqual(["Mon", "Wed"]);
      advance(PREVIEW_TRAINING_DAY_STEP_MS);
      expect(state.filledFields.trainingDays).toEqual(["Mon", "Wed", "Fri"]);
    });

    test("a repeated day is not added twice", () => {
      const { state } = setup({ targets: { ...TARGETS, trainingDays: ["Mon", "Mon"] } });
      advance(FILL_START_DELAY_MS + FILL_STEP_MS * 3 + PREVIEW_TRAINING_DAY_STEP_MS * 2);

      expect(state.filledFields.trainingDays).toEqual(["Mon"]);
    });

    test("a non-array trainingDays target is treated as none", () => {
      const { state } = setup({ targets: { ...TARGETS, trainingDays: "Mon" } });
      advance(FILL_START_DELAY_MS + FILL_STEP_MS * 3);

      expect(state.filledFields.trainingDays).toEqual([]);
    });

    test("a day landing before the list exists still starts a list", () => {
      // The per-day timers and the list-reset timer are scheduled separately,
      // so a day can arrive against a state that has no trainingDays key yet.
      // Spreading `undefined` there would throw rather than start the list.
      const { state, props } = setup({ targets: { ...TARGETS, trainingDays: ["Mon"] } });
      // The first day's timer is scheduled at +0 from inside the field's own
      // callback, so it lands on the tick after it, not the same one.
      advance(FILL_START_DELAY_MS + FILL_STEP_MS * 3);
      advance(1);

      props.setPreviewFilledFields.mock.calls
        .map(([next]) => next)
        .filter((next) => typeof next === "function")
        .forEach((updater) => {
          expect(() => updater({ name: "Ada" })).not.toThrow();
        });
      expect(state.filledFields.trainingDays).toEqual(["Mon"]);
    });

    test("prefers the captured initial targets over the live ones", () => {
      // The live targets keep changing as the visitor's own preview updates;
      // replaying the sequence against those would show the wrong values.
      const { state } = setup({
        targets: { name: "Live" },
        initialTargets: { name: "Captured" },
        initialFillOrder: ["name"]
      });

      advance(FILL_START_DELAY_MS + 1000);
      expect(state.filledFields.name).toBe("Captured");
    });
  });

  describe("what happens once the form is full", () => {
    // The collapse waits for the slowest field, so it is scheduled from a
    // computed completion time rather than a fixed one.
    const lastFieldDoneMs =
      FILL_START_DELAY_MS + FILL_STEP_MS * 3 + PREVIEW_TRAINING_DAY_STEP_MS * 2;

    test("collapses the form after the last field lands", () => {
      const { state } = setup();

      advance(lastFieldDoneMs + PREVIEW_COLLAPSE_DELAY_MS - 1);
      expect(state.personalCollapsed).toBe(false);

      advance(1);
      expect(state.personalCollapsed).toBe(true);
    });

    test("scrolls on to the generate chapter when there is one", () => {
      const { props } = setup({ generateChapterIndex: 2 });

      advance(lastFieldDoneMs + PREVIEW_COLLAPSE_DELAY_MS + PREVIEW_POST_MORPH_SHIFT_DELAY_MS + 42);

      expect(props.scrollToChapter).toHaveBeenCalledWith(2);
    });

    test("runs the builder stages in place when there is no generate chapter", () => {
      // Nothing to scroll to, so the builder animation plays where it stands.
      const { state, props } = setup({ generateChapterIndex: -1 });

      advance(lastFieldDoneMs + PREVIEW_COLLAPSE_DELAY_MS + PREVIEW_POST_MORPH_SHIFT_DELAY_MS);
      expect(state.personalShifted).toBe(true);
      expect(state.builderStage).toBe(0);

      advance(PREVIEW_BUILDER_START_DELAY_MS);
      expect(state.builderStage).toBe(1);

      advance(PREVIEW_BUILDER_STEP_MS * 5);
      expect(state.builderStage).toBe(6);
      expect(props.scrollToChapter).not.toHaveBeenCalled();
    });
  });

  describe("the generate chapter", () => {
    test("shows the form already filled and collapsed", () => {
      const { state } = setup({ chapter: "generate" });

      expect(state.filledFields).toEqual({
        name: "Ada",
        sex: "female",
        age: "34",
        trainingDays: ["Mon", "Wed", "Fri"]
      });
      expect(state.personalCollapsed).toBe(true);
      expect(state.personalShifted).toBe(true);
    });

    test("copies the training days rather than sharing the target array", () => {
      // A shared reference would let a later push into the filled state reach
      // back into the targets the sequence replays from.
      const targets = { ...TARGETS, trainingDays: ["Mon"] };
      const { state } = setup({ chapter: "generate", targets });

      expect(state.filledFields.trainingDays).toEqual(["Mon"]);
      expect(state.filledFields.trainingDays).not.toBe(targets.trainingDays);
    });

    test("a non-array trainingDays target fills as an empty list", () => {
      const { state } = setup({
        chapter: "generate",
        targets: { ...TARGETS, trainingDays: "Mon" }
      });

      expect(state.filledFields.trainingDays).toEqual([]);
    });

    test("a missing target fills as empty rather than as the string undefined", () => {
      const { state } = setup({ chapter: "generate", targets: { name: "Ada" } });

      expect(state.filledFields.age).toBe("");
      expect(state.filledFields.sex).toBe("");
    });

    test("steps the builder through its six stages", () => {
      const { state } = setup({ chapter: "generate" });

      expect(state.builderStage).toBe(0);
      advance(PREVIEW_BUILDER_START_DELAY_MS);
      expect(state.builderStage).toBe(1);

      advance(PREVIEW_BUILDER_STEP_MS * 5);
      expect(state.builderStage).toBe(6);
    });

    test("holds on the finished builder before moving to the week", () => {
      const { props } = setup({ chapter: "generate", workoutWeekChapterIndex: 3 });
      const doneMs = PREVIEW_BUILDER_START_DELAY_MS + PREVIEW_BUILDER_STEP_MS * 5;

      advance(doneMs + PREVIEW_GENERATING_HOLD_MS - 1);
      expect(props.scrollToChapter).not.toHaveBeenCalled();

      advance(1);
      expect(props.scrollToChapter).toHaveBeenCalledWith(3);
    });

    test("stays put when there is no week chapter to move to", () => {
      const { props } = setup({ chapter: "generate", workoutWeekChapterIndex: -1 });

      advance(60000);
      expect(props.scrollToChapter).not.toHaveBeenCalled();
    });
  });

  describe("the workout-week chapter", () => {
    const outlineMs = PREVIEW_WEEK_OUTLINE_START_MS;
    const headerMs = outlineMs + PREVIEW_WEEK_OUTLINE_DRAW_MS;
    const rowsMs = headerMs + PREVIEW_WEEK_HEADER_REVEAL_MS;

    test("clears the personal form on the way in", () => {
      const { state } = setup({ chapter: "workout-week" });

      expect(state.filledFields).toEqual({});
      expect(state.personalCollapsed).toBe(false);
      expect(state.weekStage).toBe(0);
    });

    test("draws the outline first", () => {
      const { state } = setup({ chapter: "workout-week" });

      advance(outlineMs - 1);
      expect(state.weekStage).toBe(0);
      advance(1);
      expect(state.weekStage).toBe(1);
    });

    test("then reveals the header, progressing to fully typed", () => {
      const { state } = setup({ chapter: "workout-week" });

      advance(headerMs);
      expect(state.weekStage).toBe(2);
      expect(state.weekHeaderTypingProgress).toBe(0);

      advance(PREVIEW_WEEK_HEADER_REVEAL_MS / 2);
      expect(state.weekHeaderTypingProgress).toBeGreaterThan(0.4);
      expect(state.weekHeaderTypingProgress).toBeLessThan(0.6);
    });

    test("the header progress is clamped at 1 rather than running past it", () => {
      const { state } = setup({ chapter: "workout-week" });

      advance(headerMs + PREVIEW_WEEK_HEADER_REVEAL_MS * 3);
      expect(state.weekHeaderTypingProgress).toBe(1);
    });

    test("then types the rows", () => {
      const { state } = setup({ chapter: "workout-week" });

      advance(rowsMs);
      expect(state.weekStage).toBe(3);
      expect(state.weekHeaderTypingProgress).toBe(1);
      expect(state.weekTypingProgress).toBe(0);

      advance(PREVIEW_WEEK_ROW_TYPING_MS / 2);
      expect(state.weekTypingProgress).toBeGreaterThan(0.4);
      expect(state.weekTypingProgress).toBeLessThan(0.6);
    });

    test("scans and then breaks once the rows have finished", () => {
      const { state } = setup({ chapter: "workout-week" });

      advance(rowsMs + PREVIEW_WEEK_ROW_TYPING_MS + 32);
      expect(state.weekTypingProgress).toBe(1);
      expect(state.weekStage).toBe(4);

      advance(PREVIEW_WEEK_SCAN_DELAY_MS);
      expect(state.weekStage).toBe(5);
    });

    test("reaches the final stage and stops there", () => {
      const { state } = setup({ chapter: "workout-week" });

      advance(120000);
      expect(state.weekStage).toBe(6);
    });
  });

  describe("the dashboard chapter", () => {
    test("steps through every stage in turn", () => {
      const { state } = setup({ chapter: "dashboard-preview" });

      expect(state.dashboardStage).toBe(0);
      advance(PREVIEW_DASHBOARD_STAGE_START_MS);
      expect(state.dashboardStage).toBe(1);

      advance(PREVIEW_DASHBOARD_STAGE_STEP_MS);
      expect(state.dashboardStage).toBe(2);
    });

    test("finishes on the final stage", () => {
      const { state } = setup({ chapter: "dashboard-preview" });

      advance(
        PREVIEW_DASHBOARD_STAGE_START_MS +
          PREVIEW_DASHBOARD_STAGE_STEP_MS * PREVIEW_DASHBOARD_FINAL_STAGE
      );
      expect(state.dashboardStage).toBe(PREVIEW_DASHBOARD_FINAL_STAGE);
    });

    test("clears the week state on the way in", () => {
      const { state } = setup({ chapter: "dashboard-preview" });

      expect(state.weekStage).toBe(0);
      expect(state.weekTypingProgress).toBe(0);
      expect(state.filledFields).toEqual({});
    });
  });

  describe("any other chapter", () => {
    test("resets everything and schedules nothing", () => {
      const { state, props } = setup({ chapter: "intro" });

      expect(state.filledFields).toEqual({});
      expect(state.personalCollapsed).toBe(false);
      expect(state.personalShifted).toBe(false);
      expect(state.builderStage).toBe(0);
      expect(state.weekStage).toBe(0);
      expect(state.dashboardStage).toBe(0);

      advance(60000);
      expect(props.scrollToChapter).not.toHaveBeenCalled();
    });
  });

  describe("reduced motion", () => {
    test("personal-info shows the finished form and moves straight on", () => {
      stubMatchMedia(true);
      const { state, props } = setup({ generateChapterIndex: 2 });

      expect(state.filledFields.name).toBe("Ada");
      expect(state.personalCollapsed).toBe(true);
      expect(props.scrollToChapter).toHaveBeenCalledWith(2);
    });

    test("personal-info stays put when there is no generate chapter", () => {
      stubMatchMedia(true);
      const { props } = setup({ generateChapterIndex: -1 });

      expect(props.scrollToChapter).not.toHaveBeenCalled();
    });

    test("generate jumps to the finished builder", () => {
      stubMatchMedia(true);
      const { state } = setup({ chapter: "generate" });

      expect(state.builderStage).toBe(6);
    });

    test("generate still holds before moving to the week", () => {
      // The hold is not motion -- it is time to read the finished plan -- so
      // it survives the preference.
      stubMatchMedia(true);
      const { props } = setup({ chapter: "generate", workoutWeekChapterIndex: 3 });

      expect(props.scrollToChapter).not.toHaveBeenCalled();
      advance(PREVIEW_GENERATING_HOLD_MS);
      expect(props.scrollToChapter).toHaveBeenCalledWith(3);
    });

    test("generate stays put with no week chapter", () => {
      stubMatchMedia(true);
      const { props } = setup({ chapter: "generate", workoutWeekChapterIndex: -1 });

      advance(60000);
      expect(props.scrollToChapter).not.toHaveBeenCalled();
    });

    test("workout-week shows the finished week at once", () => {
      stubMatchMedia(true);
      const { state } = setup({ chapter: "workout-week" });

      expect(state.weekStage).toBe(4);
      expect(state.weekHeaderTypingProgress).toBe(1);
      expect(state.weekTypingProgress).toBe(1);
    });

    test("the dashboard jumps to its final stage", () => {
      stubMatchMedia(true);
      const { state } = setup({ chapter: "dashboard-preview" });

      expect(state.dashboardStage).toBe(PREVIEW_DASHBOARD_FINAL_STAGE);
    });
  });

  describe("teardown", () => {
    test("leaving a chapter mid-sequence cancels the rest of it", () => {
      const { state, rerender } = setup();
      advance(FILL_START_DELAY_MS);
      expect(state.filledFields.name).toBe("");

      rerender({ activePreviewChapterId: "intro" });
      const afterLeaving = { ...state.filledFields };

      advance(60000);
      expect(state.filledFields).toEqual(afterLeaving);
    });

    test("unmounting mid-sequence leaves no timers behind", () => {
      const { unmount } = setup();
      advance(FILL_START_DELAY_MS);
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });

    test("clearPreviewFillTimers empties the queue and can be called twice", () => {
      const { result, props } = setup();
      advance(FILL_START_DELAY_MS);

      act(() => result.current.clearPreviewFillTimers());
      expect(props.previewFillTimeoutsRef.current).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);

      // The early return on an empty queue is the second call's whole path.
      expect(() => act(() => result.current.clearPreviewFillTimers())).not.toThrow();
    });

    test("switching chapters does not leak the previous chapter's timers", () => {
      const { state, rerender, props } = setup({ chapter: "workout-week" });
      advance(PREVIEW_WEEK_OUTLINE_START_MS);
      const weekTimerIds = [...props.previewFillTimeoutsRef.current];
      expect(weekTimerIds.length).toBeGreaterThan(0);

      rerender({ activePreviewChapterId: "dashboard-preview" });

      // The queue is the dashboard's own now, with none of the week's ids
      // carried over -- a leaked one would keep driving the week animation
      // underneath the chapter the visitor is actually looking at.
      const afterSwitch = props.previewFillTimeoutsRef.current;
      expect(afterSwitch.some((id) => weekTimerIds.includes(id))).toBe(false);

      advance(60000);
      expect(state.weekStage).toBe(0);
      expect(state.dashboardStage).toBe(PREVIEW_DASHBOARD_FINAL_STAGE);
    });
  });
});
