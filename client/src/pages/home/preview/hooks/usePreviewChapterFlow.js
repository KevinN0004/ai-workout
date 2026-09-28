import { useCallback, useEffect } from "react";
import {
  PREVIEW_INSTANT_FIELDS,
  PREVIEW_TRAINING_DAY_STEP_MS,
  PREVIEW_COLLAPSE_DELAY_MS,
  PREVIEW_POST_MORPH_SHIFT_DELAY_MS,
  PREVIEW_BUILDER_START_DELAY_MS,
  PREVIEW_BUILDER_STEP_MS,
  PREVIEW_GENERATING_HOLD_MS,
  PREVIEW_WEEK_OUTLINE_START_MS,
  PREVIEW_WEEK_OUTLINE_DRAW_MS,
  PREVIEW_WEEK_HEADER_REVEAL_MS,
  PREVIEW_WEEK_ROW_TYPING_MS,
  PREVIEW_WEEK_SCAN_DELAY_MS,
  PREVIEW_WEEK_BREAK_AFTER_SCAN_START_MS,
  PREVIEW_DASHBOARD_STAGE_START_MS,
  PREVIEW_DASHBOARD_STAGE_STEP_MS,
  PREVIEW_DASHBOARD_FINAL_STAGE
} from "../constants";
import { clamp, getPreviewTypingStepMs } from "../utils";

const PREVIEW_FILL_START_DELAY_MS = 420;
const PREVIEW_FILL_STEP_MS = 220;

export default function usePreviewChapterFlow({
  activePreviewChapterId,
  generateChapterIndex,
  workoutWeekChapterIndex,
  previewInitialTargetsRef,
  previewInitialFillOrderRef,
  previewPersonalTargets,
  previewFillOrder,
  previewFillTimeoutsRef,
  scrollToChapter,
  setPreviewFilledFields,
  setPreviewPersonalCollapsed,
  setPreviewPersonalShifted,
  setPreviewBuilderStage,
  setPreviewWeekStage,
  setPreviewDashboardStage,
  setPreviewWeekHeaderTypingProgress,
  setPreviewWeekTypingProgress
}) {
  const clearPreviewFillTimers = useCallback(() => {
    if (!previewFillTimeoutsRef.current.length) return;
    previewFillTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
      window.clearInterval(timeoutId);
    });
    previewFillTimeoutsRef.current = [];
  }, [previewFillTimeoutsRef]);

  useEffect(() => {
    const personalTargets = previewInitialTargetsRef.current || previewPersonalTargets;
    const fillOrder = previewInitialFillOrderRef.current || previewFillOrder;

    const markAllFilled = () => {
      const nextFilled = {};
      fillOrder.forEach((fieldKey) => {
        if (fieldKey === "trainingDays") {
          nextFilled[fieldKey] = Array.isArray(personalTargets.trainingDays)
            ? [...personalTargets.trainingDays]
            : [];
          return;
        }
        nextFilled[fieldKey] = String(personalTargets[fieldKey] ?? "");
      });
      setPreviewFilledFields(nextFilled);
    };

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    clearPreviewFillTimers();

    if (activePreviewChapterId === "generate") {
      setPreviewWeekStage(0);
      setPreviewDashboardStage(0);
      setPreviewWeekHeaderTypingProgress(0);
      setPreviewWeekTypingProgress(0);
      markAllFilled();
      setPreviewPersonalCollapsed(true);
      setPreviewPersonalShifted(true);
      setPreviewBuilderStage(0);

      if (prefersReducedMotion) {
        setPreviewBuilderStage(6);
        if (workoutWeekChapterIndex >= 0) {
          const weekChapterTimeoutId = window.setTimeout(() => {
            scrollToChapter(workoutWeekChapterIndex);
          }, PREVIEW_GENERATING_HOLD_MS);
          previewFillTimeoutsRef.current.push(weekChapterTimeoutId);
        }
        return undefined;
      }

      [1, 2, 3, 4, 5, 6].forEach((stage, idx) => {
        const builderStepTimeoutId = window.setTimeout(
          () => {
            setPreviewBuilderStage(stage);
          },
          PREVIEW_BUILDER_START_DELAY_MS + idx * PREVIEW_BUILDER_STEP_MS
        );
        previewFillTimeoutsRef.current.push(builderStepTimeoutId);
      });

      if (workoutWeekChapterIndex >= 0) {
        const weekChapterTimeoutId = window.setTimeout(
          () => {
            scrollToChapter(workoutWeekChapterIndex);
          },
          PREVIEW_BUILDER_START_DELAY_MS + 5 * PREVIEW_BUILDER_STEP_MS + PREVIEW_GENERATING_HOLD_MS
        );
        previewFillTimeoutsRef.current.push(weekChapterTimeoutId);
      }
      return undefined;
    }

    if (activePreviewChapterId === "workout-week") {
      setPreviewFilledFields({});
      setPreviewPersonalCollapsed(false);
      setPreviewPersonalShifted(false);
      setPreviewBuilderStage(0);
      setPreviewWeekStage(0);
      setPreviewDashboardStage(0);
      setPreviewWeekHeaderTypingProgress(0);
      setPreviewWeekTypingProgress(0);

      if (prefersReducedMotion) {
        setPreviewWeekStage(4);
        setPreviewWeekHeaderTypingProgress(1);
        setPreviewWeekTypingProgress(1);
        return undefined;
      }

      const outlineTimeoutId = window.setTimeout(() => {
        setPreviewWeekStage(1);
      }, PREVIEW_WEEK_OUTLINE_START_MS);
      previewFillTimeoutsRef.current.push(outlineTimeoutId);

      const headerTimeoutId = window.setTimeout(() => {
        setPreviewWeekStage(2);
        setPreviewWeekHeaderTypingProgress(0);
        const headerTypingStartedAt = Date.now();
        const headerTypingIntervalId = window.setInterval(() => {
          const elapsedMs = Date.now() - headerTypingStartedAt;
          const nextProgress = clamp(elapsedMs / PREVIEW_WEEK_HEADER_REVEAL_MS, 0, 1);
          setPreviewWeekHeaderTypingProgress(nextProgress);
          if (nextProgress >= 1) {
            window.clearInterval(headerTypingIntervalId);
          }
        }, 32);
        previewFillTimeoutsRef.current.push(headerTypingIntervalId);
      }, PREVIEW_WEEK_OUTLINE_START_MS + PREVIEW_WEEK_OUTLINE_DRAW_MS);
      previewFillTimeoutsRef.current.push(headerTimeoutId);

      const rowTypingTimeoutId = window.setTimeout(
        () => {
          setPreviewWeekStage(3);
          setPreviewWeekHeaderTypingProgress(1);
          setPreviewWeekTypingProgress(0);
          const typingStartedAt = Date.now();
          const typingIntervalId = window.setInterval(() => {
            const elapsedMs = Date.now() - typingStartedAt;
            const nextProgress = clamp(elapsedMs / PREVIEW_WEEK_ROW_TYPING_MS, 0, 1);
            setPreviewWeekTypingProgress(nextProgress);
            if (nextProgress >= 1) {
              window.clearInterval(typingIntervalId);
              setPreviewWeekStage(4);
              const scanTimeoutId = window.setTimeout(() => {
                setPreviewWeekStage(5);
                const breakTimeoutId = window.setTimeout(() => {
                  setPreviewWeekStage(6);
                }, PREVIEW_WEEK_BREAK_AFTER_SCAN_START_MS);
                previewFillTimeoutsRef.current.push(breakTimeoutId);
              }, PREVIEW_WEEK_SCAN_DELAY_MS);
              previewFillTimeoutsRef.current.push(scanTimeoutId);
            }
          }, 32);
          previewFillTimeoutsRef.current.push(typingIntervalId);
        },
        PREVIEW_WEEK_OUTLINE_START_MS + PREVIEW_WEEK_OUTLINE_DRAW_MS + PREVIEW_WEEK_HEADER_REVEAL_MS
      );
      previewFillTimeoutsRef.current.push(rowTypingTimeoutId);
      return undefined;
    }

    if (activePreviewChapterId === "dashboard-preview") {
      setPreviewFilledFields({});
      setPreviewPersonalCollapsed(false);
      setPreviewPersonalShifted(false);
      setPreviewBuilderStage(0);
      setPreviewWeekStage(0);
      setPreviewWeekHeaderTypingProgress(0);
      setPreviewWeekTypingProgress(0);
      setPreviewDashboardStage(0);

      if (prefersReducedMotion) {
        setPreviewDashboardStage(PREVIEW_DASHBOARD_FINAL_STAGE);
        return undefined;
      }

      const dashboardStageSteps = Array.from(
        { length: PREVIEW_DASHBOARD_FINAL_STAGE },
        (_, index) => index + 1
      );
      dashboardStageSteps.forEach((stage, index) => {
        const dashboardStepTimeoutId = window.setTimeout(
          () => {
            setPreviewDashboardStage(stage);
          },
          PREVIEW_DASHBOARD_STAGE_START_MS + index * PREVIEW_DASHBOARD_STAGE_STEP_MS
        );
        previewFillTimeoutsRef.current.push(dashboardStepTimeoutId);
      });
      return undefined;
    }

    if (activePreviewChapterId !== "personal-info") {
      setPreviewWeekStage(0);
      setPreviewDashboardStage(0);
      setPreviewWeekHeaderTypingProgress(0);
      setPreviewWeekTypingProgress(0);
      setPreviewFilledFields({});
      setPreviewPersonalCollapsed(false);
      setPreviewPersonalShifted(false);
      setPreviewBuilderStage(0);
      return undefined;
    }

    if (prefersReducedMotion) {
      markAllFilled();
      setPreviewPersonalCollapsed(true);
      if (generateChapterIndex >= 0) {
        scrollToChapter(generateChapterIndex);
      }
      return undefined;
    }

    setPreviewFilledFields({});
    setPreviewWeekStage(0);
    setPreviewDashboardStage(0);
    setPreviewWeekHeaderTypingProgress(0);
    setPreviewWeekTypingProgress(0);
    setPreviewPersonalCollapsed(false);
    setPreviewPersonalShifted(false);
    setPreviewBuilderStage(0);
    let latestCompletionMs = 0;

    fillOrder.forEach((fieldKey, index) => {
      const fieldStartMs = PREVIEW_FILL_START_DELAY_MS + index * PREVIEW_FILL_STEP_MS;
      const timeoutId = window.setTimeout(() => {
        if (fieldKey === "trainingDays") {
          const trainingDays = Array.isArray(personalTargets.trainingDays)
            ? personalTargets.trainingDays
            : [];
          setPreviewFilledFields((prev) => ({ ...prev, trainingDays: [] }));
          trainingDays.forEach((day, dayIndex) => {
            const dayTimerId = window.setTimeout(() => {
              setPreviewFilledFields((prev) => {
                const currentDays = Array.isArray(prev.trainingDays) ? prev.trainingDays : [];
                if (currentDays.includes(day)) return prev;
                return { ...prev, trainingDays: [...currentDays, day] };
              });
            }, dayIndex * PREVIEW_TRAINING_DAY_STEP_MS);
            previewFillTimeoutsRef.current.push(dayTimerId);
          });
          return;
        }

        const targetValue = String(personalTargets[fieldKey] ?? "");
        if (!targetValue) {
          setPreviewFilledFields((prev) => ({ ...prev, [fieldKey]: "" }));
          return;
        }

        if (PREVIEW_INSTANT_FIELDS.has(fieldKey)) {
          setPreviewFilledFields((prev) => ({ ...prev, [fieldKey]: targetValue }));
          return;
        }

        setPreviewFilledFields((prev) => ({ ...prev, [fieldKey]: "" }));
        let cursor = 0;
        const typingStepMs = getPreviewTypingStepMs(targetValue.length);
        const typingIntervalId = window.setInterval(() => {
          cursor += 1;
          const nextValue = targetValue.slice(0, cursor);
          setPreviewFilledFields((prev) => ({ ...prev, [fieldKey]: nextValue }));
          if (cursor >= targetValue.length) {
            window.clearInterval(typingIntervalId);
          }
        }, typingStepMs);
        previewFillTimeoutsRef.current.push(typingIntervalId);
      }, fieldStartMs);
      previewFillTimeoutsRef.current.push(timeoutId);

      if (fieldKey === "trainingDays") {
        const trainingDays = Array.isArray(personalTargets.trainingDays)
          ? personalTargets.trainingDays
          : [];
        const revealMs =
          trainingDays.length > 0 ? (trainingDays.length - 1) * PREVIEW_TRAINING_DAY_STEP_MS : 0;
        latestCompletionMs = Math.max(latestCompletionMs, fieldStartMs + revealMs);
        return;
      }

      const targetValue = String(personalTargets[fieldKey] ?? "");
      if (!targetValue || PREVIEW_INSTANT_FIELDS.has(fieldKey)) {
        latestCompletionMs = Math.max(latestCompletionMs, fieldStartMs);
        return;
      }

      const typingStepMs = getPreviewTypingStepMs(targetValue.length);
      latestCompletionMs = Math.max(
        latestCompletionMs,
        fieldStartMs + targetValue.length * typingStepMs
      );
    });

    const collapseTimeoutId = window.setTimeout(() => {
      setPreviewPersonalCollapsed(true);
      const postMorphShiftTimeoutId = window.setTimeout(() => {
        if (generateChapterIndex >= 0) {
          setPreviewPersonalShifted(false);
          setPreviewBuilderStage(0);
          const generateAdvanceTimeoutId = window.setTimeout(() => {
            scrollToChapter(generateChapterIndex);
          }, 42);
          previewFillTimeoutsRef.current.push(generateAdvanceTimeoutId);
          return;
        }
        setPreviewPersonalShifted(true);
        setPreviewBuilderStage(0);
        [1, 2, 3, 4, 5, 6].forEach((stage, idx) => {
          const builderStepTimeoutId = window.setTimeout(
            () => {
              setPreviewBuilderStage(stage);
            },
            PREVIEW_BUILDER_START_DELAY_MS + idx * PREVIEW_BUILDER_STEP_MS
          );
          previewFillTimeoutsRef.current.push(builderStepTimeoutId);
        });
      }, PREVIEW_POST_MORPH_SHIFT_DELAY_MS);
      previewFillTimeoutsRef.current.push(postMorphShiftTimeoutId);
    }, latestCompletionMs + PREVIEW_COLLAPSE_DELAY_MS);
    previewFillTimeoutsRef.current.push(collapseTimeoutId);

    return () => {
      clearPreviewFillTimers();
    };
    // Deliberately keyed on the chapter transition alone. This schedules a
    // timed animation sequence; re-running it because `previewPersonalTargets`
    // or `previewFillOrder` changed would restart that sequence mid-flight,
    // which is visibly wrong. The remaining "missing" deps are setState
    // functions and refs, which are stable and would change nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePreviewChapterId, generateChapterIndex, workoutWeekChapterIndex]);

  return { clearPreviewFillTimers };
}
