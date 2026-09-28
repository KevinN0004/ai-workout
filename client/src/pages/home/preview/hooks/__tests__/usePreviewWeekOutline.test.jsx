import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import usePreviewWeekOutline from "../usePreviewWeekOutline";

// Measures where the week table's rules fall and hands them back as
// percentages, so the outline animation can draw them over a container it does
// not itself own. Layout is stubbed the way `fetch` is; what is under test is
// the arithmetic on top of it, the guards that stop it running on nothing, and
// the identity check that keeps it from looping.

const rectOf =
  ({ left = 0, top = 0, width = 100, height = 100 }) =>
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

// A wrap containing a table of `rows` rows and `cols` header cells, with every
// element measured. Rows are stacked evenly down the wrap; header cells are
// spread evenly across it.
const buildTable = ({
  wrap: wrapRect = { width: 200, height: 100 },
  rows = 2,
  cols = 2,
  tableRect = { left: 0, top: 0, width: 200, height: 100 },
  withTable = true
} = {}) => {
  const wrapEl = document.createElement("div");
  wrapEl.getBoundingClientRect = rectOf(wrapRect);

  if (withTable) {
    const tableEl = document.createElement("table");
    tableEl.className = "preview-week-table";
    tableEl.getBoundingClientRect = rectOf(tableRect);

    for (let r = 0; r < rows; r += 1) {
      const rowEl = document.createElement("tr");
      const rowHeight = tableRect.height / Math.max(rows, 1);
      rowEl.getBoundingClientRect = rectOf({
        left: tableRect.left,
        top: tableRect.top + r * rowHeight,
        width: tableRect.width,
        height: rowHeight
      });
      if (r === 0) {
        for (let c = 0; c < cols; c += 1) {
          const cellEl = document.createElement("th");
          const cellWidth = tableRect.width / Math.max(cols, 1);
          cellEl.getBoundingClientRect = rectOf({
            left: tableRect.left + c * cellWidth,
            top: tableRect.top,
            width: cellWidth,
            height: rowHeight
          });
          rowEl.appendChild(cellEl);
        }
      }
      tableEl.appendChild(rowEl);
    }
    wrapEl.appendChild(tableEl);
  }

  document.body.appendChild(wrapEl);
  return wrapEl;
};

let observed;
let observerInstances;

class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    observerInstances.push(this);
  }

  observe(element) {
    observed.push(element);
  }

  disconnect() {
    this.disconnected = true;
  }

  trigger() {
    this.callback([], this);
  }
}

const setup = ({
  chapter = "workout-week",
  previewWeekPlan = [],
  wrapEl = buildTable(),
  setPreviewWeekLineOffsets = vi.fn()
} = {}) => {
  const view = renderHook(
    ({ activePreviewChapterId }) =>
      usePreviewWeekOutline({
        activePreviewChapterId,
        previewWeekPlan,
        previewWeekTableWrapRef: { current: wrapEl },
        setPreviewWeekLineOffsets
      }),
    { initialProps: { activePreviewChapterId: chapter } }
  );
  return { ...view, setPreviewWeekLineOffsets, wrapEl };
};

// The hook writes through an updater, so the value is read by applying it.
const offsetsFrom = (setter, current = { horizontal: [], vertical: [] }) => {
  const updater = setter.mock.calls.at(-1)?.[0];
  return typeof updater === "function" ? updater(current) : updater;
};

const frame = () => act(() => vi.advanceTimersByTime(16));

beforeEach(() => {
  observed = [];
  observerInstances = [];
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("usePreviewWeekOutline", () => {
  describe("when it does nothing at all", () => {
    test.each([
      ["a different chapter", { chapter: "dashboard-preview" }],
      ["no wrap element", { wrapEl: null }],
      ["no table inside the wrap", { wrapEl: buildTable({ withTable: false }) }]
    ])("%s", (_label, overrides) => {
      const { setPreviewWeekLineOffsets } = setup(overrides);
      frame();

      expect(setPreviewWeekLineOffsets).not.toHaveBeenCalled();
    });

    test("a wrap that measures zero is left alone", () => {
      // The chapter can be mounted but not laid out yet, and dividing by a
      // zero height would put every rule at the same place.
      const { setPreviewWeekLineOffsets } = setup({
        wrapEl: buildTable({ wrap: { width: 0, height: 0 } })
      });
      frame();

      expect(setPreviewWeekLineOffsets).not.toHaveBeenCalled();
    });

    test("a table that measures zero is left alone too", () => {
      const { setPreviewWeekLineOffsets } = setup({
        wrapEl: buildTable({ tableRect: { left: 0, top: 0, width: 0, height: 0 } })
      });
      frame();

      expect(setPreviewWeekLineOffsets).not.toHaveBeenCalled();
    });

    test("a table with no rows is left alone", () => {
      const { setPreviewWeekLineOffsets } = setup({ wrapEl: buildTable({ rows: 0 }) });
      frame();

      expect(setPreviewWeekLineOffsets).not.toHaveBeenCalled();
    });

    test("a first row with no cells is left alone", () => {
      const { setPreviewWeekLineOffsets } = setup({ wrapEl: buildTable({ cols: 0 }) });
      frame();

      expect(setPreviewWeekLineOffsets).not.toHaveBeenCalled();
    });
  });

  describe("the offsets it measures", () => {
    test("gives one horizontal rule for the top edge plus one per row", () => {
      const { setPreviewWeekLineOffsets } = setup({ wrapEl: buildTable({ rows: 3 }) });
      frame();

      expect(offsetsFrom(setPreviewWeekLineOffsets).horizontal).toHaveLength(4);
    });

    test("gives one vertical rule for the left edge plus one per header cell", () => {
      const { setPreviewWeekLineOffsets } = setup({ wrapEl: buildTable({ cols: 5 }) });
      frame();

      expect(offsetsFrom(setPreviewWeekLineOffsets).vertical).toHaveLength(6);
    });

    test("expresses them as percentages of the wrap, to three decimals", () => {
      // A 200x100 wrap with a table filling it and two rows: the rules fall at
      // the top, then halfway, then the bottom.
      const { setPreviewWeekLineOffsets } = setup({
        wrapEl: buildTable({ wrap: { width: 200, height: 100 }, rows: 2, cols: 2 })
      });
      frame();

      const offsets = offsetsFrom(setPreviewWeekLineOffsets);
      expect(offsets.horizontal).toEqual(["0.000%", "50.000%", "100.000%"]);
      expect(offsets.vertical).toEqual(["0.000%", "50.000%", "100.000%"]);
    });

    test("measures relative to the wrap, not the viewport", () => {
      // The wrap is scrolled down the page; the rules still start at its own
      // top edge rather than at the window's.
      const { setPreviewWeekLineOffsets } = setup({
        wrapEl: buildTable({
          wrap: { left: 40, top: 500, width: 200, height: 100 },
          tableRect: { left: 40, top: 500, width: 200, height: 100 },
          rows: 2,
          cols: 2
        })
      });
      frame();

      expect(offsetsFrom(setPreviewWeekLineOffsets).horizontal[0]).toBe("0.000%");
    });

    test("a table inset within the wrap starts its rules where the table does", () => {
      const { setPreviewWeekLineOffsets } = setup({
        wrapEl: buildTable({
          wrap: { left: 0, top: 0, width: 200, height: 100 },
          tableRect: { left: 20, top: 10, width: 160, height: 80 },
          rows: 2,
          cols: 2
        })
      });
      frame();

      const offsets = offsetsFrom(setPreviewWeekLineOffsets);
      expect(offsets.horizontal[0]).toBe("10.000%");
      expect(offsets.vertical[0]).toBe("10.000%");
    });

    test("a rule beyond the wrap is clamped rather than drawn outside it", () => {
      // An overflowing table would otherwise put a rule at 140%, which the
      // outline draws off the edge of the frame.
      //
      // Note the `Math.max(containerSize, 1)` beside the clamp is unreachable
      // and survives mutation testing: the zero-size guard at the top of the
      // measure has already returned for any wrap without positive width and
      // height, so the divisor is never zero by the time it is used.
      const { setPreviewWeekLineOffsets } = setup({
        wrapEl: buildTable({
          wrap: { width: 100, height: 100 },
          tableRect: { left: 0, top: 0, width: 300, height: 300 },
          rows: 1,
          cols: 1
        })
      });
      frame();

      const offsets = offsetsFrom(setPreviewWeekLineOffsets);
      offsets.horizontal.concat(offsets.vertical).forEach((value) => {
        expect(parseFloat(value)).toBeGreaterThanOrEqual(0);
        expect(parseFloat(value)).toBeLessThanOrEqual(100);
      });
    });

    test("a rule above the wrap is clamped at zero", () => {
      const { setPreviewWeekLineOffsets } = setup({
        wrapEl: buildTable({
          wrap: { left: 0, top: 100, width: 200, height: 100 },
          tableRect: { left: -50, top: 0, width: 200, height: 100 },
          rows: 1,
          cols: 1
        })
      });
      frame();

      const offsets = offsetsFrom(setPreviewWeekLineOffsets);
      expect(offsets.horizontal[0]).toBe("0.000%");
      expect(offsets.vertical[0]).toBe("0.000%");
    });
  });

  describe("the identity check", () => {
    test("returns the very same object when nothing has moved", () => {
      // This is what stops the measure looping: a fresh object every frame is
      // a new state value, which re-renders, which measures again.
      //
      // The previous value has to be a structurally equal *copy*, not the
      // object the updater itself produced. Passing that one back cannot fail
      // -- it is the same reference either way -- which is exactly what let
      // this assertion survive mutation on the first pass.
      const { setPreviewWeekLineOffsets } = setup();
      frame();

      const measured = offsetsFrom(setPreviewWeekLineOffsets);
      const equalButDistinct = {
        horizontal: [...measured.horizontal],
        vertical: [...measured.vertical]
      };
      const updater = setPreviewWeekLineOffsets.mock.calls.at(-1)[0];

      expect(updater(equalButDistinct)).toBe(equalButDistinct);
    });

    test("returns a new object once a rule has moved", () => {
      const { setPreviewWeekLineOffsets } = setup();
      frame();

      const updater = setPreviewWeekLineOffsets.mock.calls.at(-1)[0];
      const stale = { horizontal: ["0.000%", "99.000%", "100.000%"], vertical: [] };

      expect(updater(stale)).not.toBe(stale);
    });

    test("a different number of rules counts as a change", () => {
      const { setPreviewWeekLineOffsets } = setup();
      frame();

      const updater = setPreviewWeekLineOffsets.mock.calls.at(-1)[0];
      const shorter = { horizontal: ["0.000%"], vertical: ["0.000%"] };

      expect(updater(shorter)).not.toBe(shorter);
    });

    test("a change in the vertical rules alone is still a change", () => {
      const { setPreviewWeekLineOffsets } = setup();
      frame();

      const first = offsetsFrom(setPreviewWeekLineOffsets);
      const updater = setPreviewWeekLineOffsets.mock.calls.at(-1)[0];
      const movedVertical = {
        horizontal: [...first.horizontal],
        vertical: first.vertical.map((value, index) => (index === 1 ? "99.000%" : value))
      };

      expect(updater(movedVertical)).not.toBe(movedVertical);
    });
  });

  describe("when it re-measures", () => {
    test("watches both the wrap and the table for resizes", () => {
      // The wrap changes with the window; the table changes as its own content
      // types in. Missing either leaves the outline behind the content.
      const { wrapEl } = setup();

      expect(observed).toHaveLength(2);
      expect(observed[0]).toBe(wrapEl);
      expect(observed[1]).toBe(wrapEl.querySelector(".preview-week-table"));
    });

    test("a resize triggers another measure", () => {
      const { setPreviewWeekLineOffsets } = setup();
      frame();
      const before = setPreviewWeekLineOffsets.mock.calls.length;

      act(() => observerInstances[0].trigger());
      frame();

      expect(setPreviewWeekLineOffsets.mock.calls.length).toBeGreaterThan(before);
    });

    test("a window resize triggers one too", () => {
      const { setPreviewWeekLineOffsets } = setup();
      frame();
      const before = setPreviewWeekLineOffsets.mock.calls.length;

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      frame();

      expect(setPreviewWeekLineOffsets.mock.calls.length).toBeGreaterThan(before);
    });

    test("several resizes in a row coalesce into one measure", () => {
      // Each schedule cancels the last, so a drag does not queue a frame per
      // pixel.
      const { setPreviewWeekLineOffsets } = setup();
      frame();
      const before = setPreviewWeekLineOffsets.mock.calls.length;

      act(() => {
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new Event("resize"));
      });
      frame();

      expect(setPreviewWeekLineOffsets.mock.calls.length).toBe(before + 1);
    });

    test("works without a ResizeObserver, falling back to the window", () => {
      // Not every browser the preview reaches has one.
      vi.stubGlobal("ResizeObserver", undefined);
      const { setPreviewWeekLineOffsets } = setup();

      expect(() => frame()).not.toThrow();
      expect(setPreviewWeekLineOffsets).toHaveBeenCalled();
    });
  });

  describe("teardown", () => {
    test("disconnects the observer and drops the listener", () => {
      const { unmount } = setup();
      frame();

      const removeSpy = vi.spyOn(window, "removeEventListener");
      unmount();

      expect(observerInstances[0].disconnected).toBe(true);
      expect(removeSpy.mock.calls.some(([type]) => type === "resize")).toBe(true);
    });

    test("a pending frame does not fire after unmount", () => {
      const { setPreviewWeekLineOffsets, unmount } = setup();
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      const before = setPreviewWeekLineOffsets.mock.calls.length;

      unmount();
      frame();

      expect(setPreviewWeekLineOffsets.mock.calls.length).toBe(before);
    });

    test("leaving the chapter stops it measuring", () => {
      const { setPreviewWeekLineOffsets, rerender } = setup();
      frame();
      const before = setPreviewWeekLineOffsets.mock.calls.length;

      rerender({ activePreviewChapterId: "dashboard-preview" });
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      frame();

      expect(setPreviewWeekLineOffsets.mock.calls.length).toBe(before);
    });
  });
});
