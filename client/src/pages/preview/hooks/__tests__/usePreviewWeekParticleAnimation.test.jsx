import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import usePreviewWeekParticleAnimation from "../usePreviewWeekParticleAnimation";
import {
  PREVIEW_DASHBOARD_AUTO_ADVANCE_MS,
  PREVIEW_WEEK_CHUNK_MAX_TOTAL,
  PREVIEW_WEEK_PARTICLE_MAX_COUNT,
  PREVIEW_WEEK_PARTICLE_MAX_TOTAL,
  PREVIEW_WEEK_PARTICLE_MIN_COUNT
} from "../../constants";

// The hook that dissolves the week table into particles, and the one this repo
// was most confident could not be tested, because it measures real element
// rects and jsdom provides none.
//
// It can. Layout is a boundary: `getBoundingClientRect` is a function on the
// elements handed to the hook, so a test stubs it the way it stubs `fetch`.
// `Math.random` is stubbed for the same reason -- the arithmetic that turns a
// cell's area into a particle count is deterministic once its two inputs are.
// The animation itself is not asserted; what is asserted is how many particles
// a given area produces, which content is picked up, and what happens when the
// timeline reports it has finished.

const timelines = vi.hoisted(() => ({ options: [] }));

vi.mock("animejs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createTimeline: (options) => {
      timelines.options.push(options);
      return actual.createTimeline(options);
    }
  };
});

const rectOf =
  ({ left = 0, top = 0, width = 100, height = 40 }) =>
  () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({})
  });

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

// A wrap containing a table, with a rect on every element the hook measures.
// `cells` is a list of {tag, rect} describing what the table holds.
const buildTable = ({
  wrapRect = { width: 800, height: 400 },
  cells = [],
  withTable = true
} = {}) => {
  const wrap = document.createElement("div");
  wrap.getBoundingClientRect = rectOf(wrapRect);

  if (withTable) {
    const table = document.createElement("table");
    table.className = "preview-week-table";
    const row = document.createElement("tr");
    cells.forEach(({ tag, rect }) => {
      const el = document.createElement(tag);
      el.getBoundingClientRect = rectOf(rect);
      row.appendChild(el);
    });
    table.appendChild(row);
    wrap.appendChild(table);
  }

  document.body.appendChild(wrap);
  return wrap;
};

const layerEl = () => {
  const layer = document.createElement("div");
  document.body.appendChild(layer);
  return layer;
};

const cell = (tag, rect) => ({ tag, rect });

// One 100x40 cell is 4000px2 of area; at 1500px2 per particle that rounds to 3,
// which the min count lifts to 4.
const DEFAULT_CELLS = [cell("td", { left: 0, top: 0, width: 100, height: 40 })];

const setup = ({
  chapter = "workout-week",
  stage = 6,
  cells = DEFAULT_CELLS,
  wrapRect = { width: 800, height: 400 },
  withTable = true,
  withWrap = true,
  withLayer = true,
  dashboardPreviewChapterIndex = -1,
  workoutWeekChapterIndex = 1,
  stepIndex = 1
} = {}) => {
  const wrap = withWrap ? buildTable({ wrapRect, cells, withTable }) : null;
  const layer = withLayer ? layerEl() : null;

  const props = {
    previewWeekTableWrapRef: { current: wrap },
    previewWeekParticleLayerRef: { current: layer },
    previewWeekParticlePlayersRef: { current: [] },
    previewWeekParticleTargetsRef: { current: [] },
    previewFillTimeoutsRef: { current: [] },
    dashboardPreviewChapterIndex,
    workoutWeekChapterIndex,
    previewStepIndexRef: { current: stepIndex },
    scrollToChapter: vi.fn(),
    setPreviewWeekStage: vi.fn()
  };

  const view = renderHook(
    ({ activePreviewChapterId, previewWeekStage }) =>
      usePreviewWeekParticleAnimation({ ...props, activePreviewChapterId, previewWeekStage }),
    { initialProps: { activePreviewChapterId: chapter, previewWeekStage: stage } }
  );

  return { ...view, props, wrap, layer };
};

const particlesIn = (layer) => layer.querySelectorAll(".preview-week-particle");
const chunksIn = (layer) => layer.querySelectorAll(".preview-week-chunk");

beforeEach(() => {
  vi.useFakeTimers();
  stubMatchMedia(false);
  timelines.options.length = 0;
  // Mid-range, so every randomBetween lands on its midpoint and every
  // `Math.random() > threshold` takes the same side each run.
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("usePreviewWeekParticleAnimation", () => {
  describe("when it does nothing at all", () => {
    test.each([
      ["a different chapter", { chapter: "dashboard-preview" }],
      ["a stage before the dissolve", { stage: 5 }],
      ["no wrap element", { withWrap: false }],
      ["no particle layer", { withLayer: false }],
      ["no table inside the wrap", { withTable: false }]
    ])("%s", (_label, overrides) => {
      const { layer } = setup(overrides);

      if (layer) expect(particlesIn(layer)).toHaveLength(0);
    });

    test("a visitor who asked for reduced motion gets no particles", () => {
      // The whole effect is motion, so there is nothing to degrade to.
      stubMatchMedia(true);
      const { layer } = setup();

      expect(particlesIn(layer)).toHaveLength(0);
      expect(chunksIn(layer)).toHaveLength(0);
    });

    test("a wrap that measures zero is left alone", () => {
      // The table can be laid out but collapsed, and dividing by a zero height
      // would put every particle at the same delay.
      const { layer } = setup({ wrapRect: { width: 0, height: 0 } });

      expect(particlesIn(layer)).toHaveLength(0);
    });

    test("a table with nothing measurable in it produces no timeline", () => {
      const { layer } = setup({ cells: [cell("td", { width: 0, height: 0 })] });

      expect(particlesIn(layer)).toHaveLength(0);
      expect(timelines.options).toHaveLength(0);
    });

    test("a stage past the dissolve does not start a second one", () => {
      // Stage 7 normally arrives from the animation's own completion, which
      // sets the keep-the-frame flag on its way out (covered below). Reaching
      // it any other way tears down instead, and either way stage 7 must not
      // build a fresh set of particles over the top.
      const { layer, rerender } = setup();
      expect(particlesIn(layer).length).toBeGreaterThan(0);
      const built = timelines.options.length;

      rerender({ activePreviewChapterId: "workout-week", previewWeekStage: 7 });

      expect(timelines.options).toHaveLength(built);
      expect(particlesIn(layer)).toHaveLength(0);
    });
  });

  describe("what it builds", () => {
    test("emits particles for a measurable cell", () => {
      const { layer } = setup();

      expect(particlesIn(layer).length).toBeGreaterThan(0);
      expect(chunksIn(layer).length).toBeGreaterThan(0);
    });

    test("a small cell still gets the minimum number of particles", () => {
      // 20x10 is 200px2, which rounds to nothing at 1500px2 per particle.
      const { layer } = setup({ cells: [cell("td", { width: 20, height: 10 })] });

      expect(particlesIn(layer)).toHaveLength(PREVIEW_WEEK_PARTICLE_MIN_COUNT);
    });

    test("a large cell is capped rather than scaling without limit", () => {
      const { layer } = setup({ cells: [cell("td", { width: 800, height: 400 })] });

      expect(particlesIn(layer)).toHaveLength(PREVIEW_WEEK_PARTICLE_MAX_COUNT);
    });

    test("a medium cell scales with its area", () => {
      // 300x40 is 12000px2, so 12000/1500 = 8 particles, inside both bounds.
      const { layer } = setup({ cells: [cell("td", { width: 300, height: 40 })] });

      expect(particlesIn(layer)).toHaveLength(8);
    });

    test("the total is capped across every cell", () => {
      // 40 big cells would be 560 particles without the running total.
      const cells = Array.from({ length: 40 }, (_, i) =>
        cell("td", { left: 0, top: i, width: 800, height: 400 })
      );
      const { layer } = setup({ cells, wrapRect: { width: 800, height: 4000 } });

      expect(particlesIn(layer)).toHaveLength(PREVIEW_WEEK_PARTICLE_MAX_TOTAL);
    });

    test("chunks are capped too", () => {
      const cells = Array.from({ length: 40 }, (_, i) =>
        cell("td", { left: 0, top: i, width: 800, height: 400 })
      );
      const { layer } = setup({ cells, wrapRect: { width: 800, height: 4000 } });

      expect(chunksIn(layer)).toHaveLength(PREVIEW_WEEK_CHUNK_MAX_TOTAL);
    });

    test("text content gets particles but no chunks", () => {
      // Chunks are the cell's own background breaking up; a paragraph has no
      // box of its own to break.
      const { layer } = setup({ cells: [cell("p", { width: 300, height: 40 })] });

      expect(particlesIn(layer).length).toBeGreaterThan(0);
      expect(chunksIn(layer)).toHaveLength(0);
    });

    test("a cell scrolled out to the right is skipped", () => {
      const { layer } = setup({
        cells: [cell("td", { left: 900, top: 0, width: 100, height: 40 })],
        wrapRect: { width: 800, height: 400 }
      });

      expect(particlesIn(layer)).toHaveLength(0);
    });

    test("a cell scrolled off the left is skipped", () => {
      const { layer } = setup({
        cells: [cell("td", { left: -200, top: 0, width: 100, height: 40 })]
      });

      expect(particlesIn(layer)).toHaveLength(0);
    });

    test("a cell below the visible area is skipped", () => {
      const { layer } = setup({
        cells: [cell("td", { left: 0, top: 500, width: 100, height: 40 })],
        wrapRect: { width: 800, height: 400 }
      });

      expect(particlesIn(layer)).toHaveLength(0);
    });

    test("particles are placed inside the cell they came from", () => {
      const { layer } = setup({
        cells: [cell("td", { left: 120, top: 60, width: 100, height: 40 })]
      });

      // Math.random is pinned mid-range, so each offset is half the cell.
      const first = particlesIn(layer)[0];
      expect(parseFloat(first.style.left)).toBeCloseTo(170, 1);
      expect(parseFloat(first.style.top)).toBeCloseTo(80, 1);
    });

    test("a cell with a real background donates it to its chunks", () => {
      // The fallbacks are for the transparent cells. A cell that is actually
      // painted has to break into chunks of its own colour.
      const wrap = buildTable({ cells: [cell("td", { width: 100, height: 40 })] });
      const td = wrap.querySelector("td");
      td.style.backgroundColor = "rgb(10, 20, 30)";
      td.style.borderTopColor = "rgb(40, 50, 60)";
      document.body.appendChild(wrap);

      const layer = layerEl();
      renderHook(() =>
        usePreviewWeekParticleAnimation({
          activePreviewChapterId: "workout-week",
          previewWeekStage: 6,
          previewWeekTableWrapRef: { current: wrap },
          previewWeekParticleLayerRef: { current: layer },
          previewWeekParticlePlayersRef: { current: [] },
          previewWeekParticleTargetsRef: { current: [] },
          previewFillTimeoutsRef: { current: [] },
          dashboardPreviewChapterIndex: -1,
          workoutWeekChapterIndex: 1,
          previewStepIndexRef: { current: 1 },
          scrollToChapter: vi.fn(),
          setPreviewWeekStage: vi.fn()
        })
      );

      const chunk = chunksIn(layer)[0];
      expect(chunk.style.backgroundColor).toBe("rgb(10, 20, 30)");
      expect(chunk.style.border).toContain("rgb(40, 50, 60)");
    });

    test.each([
      [0.9, "50%", "solid"],
      // jsdom drops `border: none` rather than storing the keyword, so the
      // unbordered chunk reads back as no border style at all.
      [0.1, "1px", ""]
    ])("a random draw of %s shapes the debris", (draw, radius, borderStyle) => {
      // Both the particle shape and whether a chunk carries a border are coin
      // flips. Pinning the draw is the only way either side is ever seen.
      Math.random.mockReturnValue(draw);
      const { layer } = setup();

      expect(particlesIn(layer)[0].style.borderRadius).toBe(radius);
      expect(chunksIn(layer)[0].style.borderStyle).toBe(borderStyle);
    });

    test("a header cell and a body cell get different chunk fills", () => {
      // They are different shades in the table, and a uniform chunk colour
      // would read as the header having already gone.
      const { layer } = setup({
        cells: [
          cell("th", { left: 0, top: 0, width: 100, height: 40 }),
          cell("td", { left: 120, top: 0, width: 100, height: 40 })
        ]
      });

      const fills = new Set(Array.from(chunksIn(layer)).map((el) => el.style.backgroundColor));
      expect(fills.size).toBe(2);
    });
  });

  describe("when the dissolve finishes", () => {
    const complete = () => act(() => timelines.options.at(-1).onComplete());

    test("moves the week on to the final stage", () => {
      const { props } = setup();
      complete();

      const [updater] = props.setPreviewWeekStage.mock.calls.at(-1);
      expect(updater(6)).toBe(7);
    });

    test("does not drag a later stage backwards", () => {
      // The updater form exists because the stage can already have moved on.
      const { props } = setup();
      complete();

      const [updater] = props.setPreviewWeekStage.mock.calls.at(-1);
      expect(updater(9)).toBe(9);
    });

    test("moves on to the dashboard chapter after a pause", () => {
      const { props } = setup({ dashboardPreviewChapterIndex: 3, workoutWeekChapterIndex: 1 });
      complete();

      expect(props.scrollToChapter).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(PREVIEW_DASHBOARD_AUTO_ADVANCE_MS));
      expect(props.scrollToChapter).toHaveBeenCalledWith(3);
    });

    test("stays put when there is no dashboard chapter", () => {
      const { props } = setup({ dashboardPreviewChapterIndex: -1 });
      complete();

      act(() => vi.advanceTimersByTime(5000));
      expect(props.scrollToChapter).not.toHaveBeenCalled();
    });

    test("stays put when the visitor has already scrolled elsewhere", () => {
      // The animation finishes on its own schedule. If the visitor moved on
      // while it played, scrolling them back would fight them.
      const { props } = setup({
        dashboardPreviewChapterIndex: 3,
        workoutWeekChapterIndex: 1,
        stepIndex: 2
      });
      complete();

      act(() => vi.advanceTimersByTime(5000));
      expect(props.scrollToChapter).not.toHaveBeenCalled();
    });

    test("the finished frame survives teardown", () => {
      // Completion sets the stage, which unmounts the effect. Clearing then
      // would snap the table back for a frame before the next chapter.
      const { layer, unmount } = setup();
      const before = particlesIn(layer).length;
      complete();

      unmount();

      expect(particlesIn(layer)).toHaveLength(before);
    });
  });

  describe("teardown before it finishes", () => {
    test("leaving the chapter clears the particles", () => {
      const { layer, rerender } = setup();
      expect(particlesIn(layer).length).toBeGreaterThan(0);

      rerender({ activePreviewChapterId: "dashboard-preview", previewWeekStage: 0 });

      expect(particlesIn(layer)).toHaveLength(0);
    });

    test("unmounting clears them too", () => {
      const { layer, unmount } = setup();
      expect(particlesIn(layer).length).toBeGreaterThan(0);

      unmount();

      expect(particlesIn(layer)).toHaveLength(0);
    });

    test("the inline styles it applied are handed back", () => {
      // The cells are the real table, not copies. Leaving willChange and a
      // clip-path on them would keep the table hidden after the animation.
      const { wrap, rerender } = setup();
      const td = wrap.querySelector("td");
      expect(td.style.willChange).not.toBe("");

      rerender({ activePreviewChapterId: "dashboard-preview", previewWeekStage: 0 });

      expect(td.style.willChange).toBe("");
      expect(td.style.transform).toBe("");
      expect(td.style.clipPath).toBe("");
      expect(td.style.transformOrigin).toBe("");
    });

    test("the timeline is cancelled rather than left running", () => {
      const { props, rerender } = setup();
      const player = props.previewWeekParticlePlayersRef.current[0];
      expect(player).toBeTruthy();
      const cancel = vi.spyOn(player, "cancel");

      rerender({ activePreviewChapterId: "dashboard-preview", previewWeekStage: 0 });

      expect(cancel).toHaveBeenCalled();
      expect(props.previewWeekParticlePlayersRef.current).toEqual([]);
    });
  });

  describe("clearPreviewWeekParticleAnimation", () => {
    test("is safe to call when nothing is running", () => {
      const { result } = setup({ chapter: "dashboard-preview" });

      expect(() => act(() => result.current.clearPreviewWeekParticleAnimation())).not.toThrow();
    });

    test("tolerates a target that has gone away", () => {
      // The table can unmount between the animation starting and the cleanup.
      const { result, props } = setup();
      props.previewWeekParticleTargetsRef.current = [null, undefined];

      expect(() => act(() => result.current.clearPreviewWeekParticleAnimation())).not.toThrow();
    });

    test("tolerates a player with no cancel", () => {
      const { result, props } = setup();
      props.previewWeekParticlePlayersRef.current = [null, {}];

      expect(() => act(() => result.current.clearPreviewWeekParticleAnimation())).not.toThrow();
    });

    test("tolerates the layer having gone away", () => {
      const { result, props } = setup();
      props.previewWeekParticleLayerRef.current = null;

      expect(() => act(() => result.current.clearPreviewWeekParticleAnimation())).not.toThrow();
    });

    test("empties the layer", () => {
      const { result, layer } = setup();
      expect(particlesIn(layer).length).toBeGreaterThan(0);

      act(() => result.current.clearPreviewWeekParticleAnimation());

      expect(layer.children).toHaveLength(0);
    });
  });
});
