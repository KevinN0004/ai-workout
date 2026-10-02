/**
 * Measures the preview's week table so the outline its chapter draws sits on
 * the table's real row and column edges. Called by PreviewStage.
 */
import { useEffect } from "react";
import { clamp } from "../utils";

/**
 * While the week chapter shows, measures the table inside
 * `previewWeekTableWrapRef` and passes `setPreviewWeekLineOffsets` the edges as
 * percentages of the wrap: the table's top and each row's bottom, and its left
 * and each header cell's right. It measures on the next animation frame, then
 * again after the window resizes or, where ResizeObserver exists, the wrap or
 * the table does, at most once a frame, and stores a result only when a
 * position changed. A wrap or table with no size, or a table with no rows,
 * leaves the offsets in state as they are. It subscribes afresh when the
 * chapter or the plan changes.
 */
export default function usePreviewWeekOutline({
  activePreviewChapterId,
  previewWeekPlan,
  previewWeekTableWrapRef,
  setPreviewWeekLineOffsets
}) {
  useEffect(() => {
    if (activePreviewChapterId !== "workout-week") return undefined;
    if (typeof window === "undefined") return undefined;
    const wrapEl = previewWeekTableWrapRef.current;
    const tableEl = wrapEl?.querySelector(".preview-week-table");
    if (!wrapEl || !tableEl) return undefined;

    let frameId = 0;

    const areOffsetsEqual = (currentOffsets, nextOffsets) =>
      currentOffsets.horizontal.length === nextOffsets.horizontal.length &&
      currentOffsets.vertical.length === nextOffsets.vertical.length &&
      currentOffsets.horizontal.every((value, index) => value === nextOffsets.horizontal[index]) &&
      currentOffsets.vertical.every((value, index) => value === nextOffsets.vertical[index]);

    const measureOutlineOffsets = () => {
      const wrapRect = wrapEl.getBoundingClientRect();
      const tableRect = tableEl.getBoundingClientRect();
      if (
        wrapRect.width <= 0 ||
        wrapRect.height <= 0 ||
        tableRect.width <= 0 ||
        tableRect.height <= 0
      )
        return;

      const tableRows = Array.from(tableEl.querySelectorAll("tr"));
      const headerCells = tableRows[0] ? Array.from(tableRows[0].children) : [];
      if (!tableRows.length || !headerCells.length) return;

      const horizontalPx = [tableRect.top - wrapRect.top];
      tableRows.forEach((rowEl) => {
        horizontalPx.push(rowEl.getBoundingClientRect().bottom - wrapRect.top);
      });

      const verticalPx = [tableRect.left - wrapRect.left];
      headerCells.forEach((cellEl) => {
        verticalPx.push(cellEl.getBoundingClientRect().right - wrapRect.left);
      });

      const toPercent = (pixelValue, containerSize) =>
        `${clamp((pixelValue / Math.max(containerSize, 1)) * 100, 0, 100).toFixed(3)}%`;

      const nextOffsets = {
        horizontal: horizontalPx.map((pixelValue) => toPercent(pixelValue, wrapRect.height)),
        vertical: verticalPx.map((pixelValue) => toPercent(pixelValue, wrapRect.width))
      };

      setPreviewWeekLineOffsets((currentOffsets) =>
        areOffsetsEqual(currentOffsets, nextOffsets) ? currentOffsets : nextOffsets
      );
    };

    const scheduleMeasure = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(measureOutlineOffsets);
    };

    const resizeObserver =
      typeof ResizeObserver === "function" ? new ResizeObserver(scheduleMeasure) : null;

    resizeObserver?.observe(wrapEl);
    resizeObserver?.observe(tableEl);
    window.addEventListener("resize", scheduleMeasure);
    scheduleMeasure();

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
    // The ref object and the state setter are stable for the component's life,
    // so listing them satisfies the exhaustive-deps rule without adding a
    // re-run: the effect still only re-subscribes when the chapter or plan
    // changes.
  }, [activePreviewChapterId, previewWeekPlan, previewWeekTableWrapRef, setPreviewWeekLineOffsets]);
}
