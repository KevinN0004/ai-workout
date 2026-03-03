import { useEffect } from "react";
import { clamp } from "../utils";

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

    const areOffsetsEqual = (currentOffsets, nextOffsets) => (
      currentOffsets.horizontal.length === nextOffsets.horizontal.length &&
      currentOffsets.vertical.length === nextOffsets.vertical.length &&
      currentOffsets.horizontal.every((value, index) => value === nextOffsets.horizontal[index]) &&
      currentOffsets.vertical.every((value, index) => value === nextOffsets.vertical[index])
    );

    const measureOutlineOffsets = () => {
      const wrapRect = wrapEl.getBoundingClientRect();
      const tableRect = tableEl.getBoundingClientRect();
      if (wrapRect.width <= 0 || wrapRect.height <= 0 || tableRect.width <= 0 || tableRect.height <= 0) return;

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

      const toPercent = (pixelValue, containerSize) => (
        `${clamp((pixelValue / Math.max(containerSize, 1)) * 100, 0, 100).toFixed(3)}%`
      );

      const nextOffsets = {
        horizontal: horizontalPx.map((pixelValue) => toPercent(pixelValue, wrapRect.height)),
        vertical: verticalPx.map((pixelValue) => toPercent(pixelValue, wrapRect.width))
      };

      setPreviewWeekLineOffsets((currentOffsets) => (
        areOffsetsEqual(currentOffsets, nextOffsets) ? currentOffsets : nextOffsets
      ));
    };

    const scheduleMeasure = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(measureOutlineOffsets);
    };

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(scheduleMeasure)
      : null;

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
  }, [activePreviewChapterId, previewWeekPlan]);
}
