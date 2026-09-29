import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import PreviewStage from "../PreviewStage";
import { PREVIEW_TOC_SWITCH_MS } from "../constants";

// The machine that drives the guided walkthrough. The four hooks it calls are
// covered in their own suites, so they are stubbed here and what is left is
// exactly this file's own job: routing a chapter id to a chapter body,
// navigating between chapters without losing a half-finished transition, and
// cleaning up after itself.
//
// The stubs capture the arguments they are handed, which is how the tests reach
// `scrollToChapter` and the state setters that only the flow hook would
// normally call.

const derived = vi.hoisted(() => ({ chapters: null }));
const flow = vi.hoisted(() => ({ args: null, clear: null }));
const particles = vi.hoisted(() => ({ args: null, clear: null }));
const outline = vi.hoisted(() => ({ args: null }));

vi.mock("../components/PreviewPersonalChapter", () => ({
  default: (props) => (
    <div
      data-testid="personal-chapter"
      data-generate-view={props.isGenerateView ? "yes" : "no"}
      data-collapsed={props.previewPersonalCollapsed ? "yes" : "no"}
      data-shifted={props.previewPersonalShifted ? "yes" : "no"}
      data-builder-stage={String(props.previewBuilderStage)}
    />
  )
}));

vi.mock("../components/PreviewWorkoutWeekChapter", () => ({
  default: (props) => (
    <div data-testid="week-chapter" data-week-stage={String(props.previewWeekStage)} />
  )
}));

vi.mock("../components/PreviewDashboardChapter", () => ({
  default: (props) => (
    <div data-testid="dashboard-chapter" data-dash-stage={String(props.previewDashboardStage)} />
  )
}));

vi.mock("../hooks/usePreviewWeekOutline", () => ({
  default: (args) => {
    outline.args = args;
  }
}));

vi.mock("../hooks/usePreviewChapterFlow", () => ({
  default: (args) => {
    flow.args = args;
    return { clearPreviewFillTimers: flow.clear };
  }
}));

vi.mock("../hooks/usePreviewWeekParticleAnimation", () => ({
  default: (args) => {
    particles.args = args;
    return { clearPreviewWeekParticleAnimation: particles.clear };
  }
}));

// The four chapters the app actually builds. Only their id and title are read
// outside this file, by the table of contents.
const CHAPTERS = [
  { id: "personal-info", title: "Personal Info", fields: [] },
  { id: "generate", title: "Generate", fields: [] },
  { id: "workout-week", title: "Workout Week", fields: [] },
  { id: "dashboard-preview", title: "Dashboard", fields: [] }
];

vi.mock("../hooks/usePreviewDerivedData", () => ({
  default: ({ previewStepIndex }) => {
    const chapters = derived.chapters;
    return {
      previewWeekPlan: { days: [] },
      previewDashboardSummary: {},
      previewPersonalTargets: {},
      previewFillOrder: [],
      previewInitialTargetsRef: { current: {} },
      previewInitialFillOrderRef: { current: [] },
      previewChapters: chapters,
      generateChapterIndex: 1,
      workoutWeekChapterIndex: 2,
      dashboardPreviewChapterIndex: 3,
      activePreviewChapter: chapters[previewStepIndex] ?? chapters[0],
      previewStageStyle: {},
      previewTocStyle: {},
      getPreviewFieldRows: () => 1,
      getPreviewTextRows: () => 1,
      getPreviewWeekHeaderTypedText: () => "",
      getPreviewWeekTypedText: () => ""
    };
  }
}));

const renderPreview = (props = {}) =>
  render(
    <PreviewStage
      personal={{}}
      form={{}}
      heightUnit="cm"
      weightUnit="kg"
      toFeetInchesFromCm={() => ({ feet: "5", inches: "10" })}
      toLb={() => "170"}
      resolvedHeightCm={178}
      resolvedWeightKg={77}
      effectiveBodyFat={18}
      {...props}
    />
  );

const card = () => document.querySelector(".preview-step-card");
const chips = () => screen.getAllByRole("tab");
// Drives the navigation the flow hook would normally drive, with an index the
// table of contents cannot produce.
const jumpTo = (index) => act(() => flow.args.scrollToChapter(index));

let scrollIntoView;

beforeEach(() => {
  derived.chapters = CHAPTERS;
  flow.args = null;
  particles.args = null;
  outline.args = null;
  flow.clear = vi.fn();
  particles.clear = vi.fn();
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  // Fake timers replace requestAnimationFrame with their own, so the spy has to
  // be installed after them or it is the one that gets overwritten. The mount
  // effect nests two frames before scrolling; run both synchronously.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 1;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.classList.remove("preview-smooth-scroll");
});

describe("PreviewStage", () => {
  describe("routing a chapter to its body", () => {
    test("opens on the first chapter", () => {
      renderPreview();

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Personal Info");
      expect(screen.getByTestId("personal-chapter")).toBeInTheDocument();
    });

    test.each([
      ["personal-info", 0, "personal-chapter"],
      ["generate", 1, "personal-chapter"],
      ["workout-week", 2, "week-chapter"],
      ["dashboard-preview", 3, "dashboard-chapter"]
    ])("%s renders its own body", (_id, index, testId) => {
      renderPreview();
      jumpTo(index);

      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    test("the generate chapter reuses the personal body but in generate mode", () => {
      // These two arms are nearly identical and differ only by this flag, so
      // the flag is the whole reason the second arm exists.
      renderPreview();
      expect(screen.getByTestId("personal-chapter")).toHaveAttribute("data-generate-view", "no");

      jumpTo(1);
      expect(screen.getByTestId("personal-chapter")).toHaveAttribute("data-generate-view", "yes");
    });

    test("only one chapter body is mounted at a time", () => {
      renderPreview();
      jumpTo(2);

      expect(screen.queryByTestId("personal-chapter")).not.toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-chapter")).not.toBeInTheDocument();
      expect(screen.getByTestId("week-chapter")).toBeInTheDocument();
    });
  });

  describe("the card's own modifiers", () => {
    test("the first chapter is plain", () => {
      renderPreview();

      expect(card().className).not.toContain("is-generate-view");
      expect(card().className).not.toContain("is-personal-collapsed");
    });

    test("the generate chapter is both a generate view and collapsed", () => {
      // Collapsed without the flow hook having collapsed anything: reaching
      // "generate" is sufficient on its own.
      renderPreview();
      jumpTo(1);

      expect(card().className).toContain("is-generate-view");
      expect(card().className).toContain("is-personal-collapsed");
    });

    test("the personal chapter collapses only once the flow hook says so", () => {
      renderPreview();
      expect(card().className).not.toContain("is-personal-collapsed");

      act(() => flow.args.setPreviewPersonalCollapsed(true));

      expect(card().className).toContain("is-personal-collapsed");
      expect(card().className).not.toContain("is-generate-view");
    });

    test("a collapsed personal chapter does not collapse the later ones", () => {
      renderPreview();
      act(() => flow.args.setPreviewPersonalCollapsed(true));
      jumpTo(2);

      expect(card().className).not.toContain("is-personal-collapsed");
    });
  });

  describe("navigating between chapters", () => {
    test("the table of contents moves to the chapter it names", () => {
      renderPreview();

      fireEvent.click(chips()[2]);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Workout Week");
      expect(chips()[2]).toHaveAttribute("aria-selected", "true");
      expect(chips()[0]).toHaveAttribute("aria-selected", "false");
    });

    test.each([
      ["below the first", -5, 0, "Personal Info"],
      ["beyond the last", 99, 3, "Dashboard"]
    ])("an index %s is pulled back into range", (_label, index, settledOn, expected) => {
      renderPreview();
      jumpTo(index);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(expected);
      // The heading alone would not catch a missing clamp: the derived data
      // falls back to the first chapter for any index it cannot find. The step
      // index itself is what the table of contents reads, and an unclamped -5
      // leaves every chip unselected.
      expect(chips()[settledOn]).toHaveAttribute("aria-selected", "true");
    });

    test("the outgoing and incoming chips animate, then settle", () => {
      renderPreview();

      fireEvent.click(chips()[1]);
      expect(chips()[0].className).toContain("is-contracting");
      expect(chips()[1].className).toContain("is-expanding");

      act(() => vi.advanceTimersByTime(PREVIEW_TOC_SWITCH_MS));

      expect(chips()[0].className).not.toContain("is-contracting");
      expect(chips()[1].className).not.toContain("is-expanding");
    });

    test("the settle timer is not yet due one tick early", () => {
      renderPreview();
      fireEvent.click(chips()[1]);

      act(() => vi.advanceTimersByTime(PREVIEW_TOC_SWITCH_MS - 1));

      expect(chips()[1].className).toContain("is-expanding");
    });

    test("selecting the chapter already open changes nothing", () => {
      // The guard matters: without it, re-selecting would restart the
      // transition and leave the chip mid-animation.
      renderPreview();
      fireEvent.click(chips()[0]);

      expect(chips()[0].className).not.toContain("is-expanding");
      expect(chips()[0].className).not.toContain("is-contracting");
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Personal Info");
    });

    test("a second jump before the first settles does not strand the first chip", () => {
      renderPreview();

      fireEvent.click(chips()[1]);
      act(() => vi.advanceTimersByTime(PREVIEW_TOC_SWITCH_MS - 100));
      fireEvent.click(chips()[3]);

      // The first jump's pending timer was cleared, so it cannot fire early and
      // strip the second jump's classes.
      act(() => vi.advanceTimersByTime(100));
      expect(chips()[3].className).toContain("is-expanding");

      act(() => vi.advanceTimersByTime(PREVIEW_TOC_SWITCH_MS));
      expect(chips()[3].className).not.toContain("is-expanding");
    });
  });

  describe("scrolling and page-level side effects", () => {
    test("scrolls itself into view on arrival", () => {
      renderPreview();

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });

    test("turns smooth scrolling on for the document, and off again on the way out", () => {
      const { unmount } = renderPreview();
      expect(document.documentElement.classList.contains("preview-smooth-scroll")).toBe(true);

      unmount();

      expect(document.documentElement.classList.contains("preview-smooth-scroll")).toBe(false);
    });
  });

  describe("cleaning up", () => {
    test("stops the fill timers and the particle animation on the way out", () => {
      const { unmount } = renderPreview();

      unmount();

      expect(flow.clear).toHaveBeenCalledTimes(1);
      expect(particles.clear).toHaveBeenCalledTimes(1);
    });

    test("drops a transition still in flight rather than letting it land later", () => {
      const { unmount } = renderPreview();
      fireEvent.click(chips()[1]);

      const cleared = vi.spyOn(window, "clearTimeout");
      unmount();

      expect(cleared).toHaveBeenCalled();
      // Nothing is left to fire into an unmounted tree.
      expect(() => act(() => vi.advanceTimersByTime(PREVIEW_TOC_SWITCH_MS * 2))).not.toThrow();
    });
  });

  describe("what it hands the hooks", () => {
    test("tells each hook which chapter is open", () => {
      renderPreview();
      jumpTo(2);

      expect(outline.args.activePreviewChapterId).toBe("workout-week");
      expect(flow.args.activePreviewChapterId).toBe("workout-week");
      expect(particles.args.activePreviewChapterId).toBe("workout-week");
    });

    test("keeps the step index ref in step with the rendered chapter", () => {
      // The particle hook reads this ref rather than the state, so a stale ref
      // would scroll the visitor back to a chapter they have already left.
      renderPreview();
      jumpTo(3);

      expect(particles.args.previewStepIndexRef.current).toBe(3);
    });

    test("a second jump in the same tick departs from the first one's chapter", () => {
      // scrollToChapter writes the ref itself rather than waiting for the
      // effect that syncs it, and this is where that matters: both calls land
      // before React flushes, so the second reads the ref, not the state. With
      // a stale ref it would think it was still leaving chapter 0.
      renderPreview();

      act(() => {
        flow.args.scrollToChapter(1);
        flow.args.scrollToChapter(2);
      });

      expect(chips()[2]).toHaveAttribute("aria-selected", "true");
      expect(chips()[1].className).toContain("is-contracting");
      expect(chips()[0].className).not.toContain("is-contracting");
    });
  });
});
