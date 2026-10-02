/**
 * The preview walkthrough's timed state machine: on arrival each chapter plays
 * a sequence of stage changes on timers, and Personal Info and Generate then
 * move on to the next chapter by themselves. Called by PreviewStage.
 */
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

// When Personal Info's first field starts filling, and the gap before each next
// one starts, in milliseconds.
const PREVIEW_FILL_START_DELAY_MS = 420;
const PREVIEW_FILL_STEP_MS = 220;

/**
 * Plays `activePreviewChapterId`'s sequence on mount and whenever the chapter
 * changes, after cancelling whatever the last one scheduled, through the
 * setters PreviewStage owns:
 *
 * - Personal Info types the profile into the form field by field, collapses
 *   the form, and moves to Generate.
 * - Generate shows the form collapsed, adds a "+" and Environment, then a "+"
 *   and Focus, holds on "Generating", and moves to the week.
 * - The week draws the table's outline, types the headers and then the rows,
 *   scans it once and sets stage 6. usePreviewWeekParticleAnimation's dissolve
 *   takes over from there, and it is that hook that moves to the dashboard.
 * - The dashboard reveals its cards one stage at a time, and stays.
 *
 * Under `prefers-reduced-motion` each chapter shows its finished state at
 * once. Personal Info moves straight to Generate and Generate moves on after
 * PREVIEW_GENERATING_HOLD_MS, but the week stops at stage 4, before the scan, so
 * the dissolve never plays and nothing moves to the dashboard.
 *
 * What is typed is the profile the walkthrough opened with
 * (`previewInitialTargetsRef`, `previewInitialFillOrderRef`). Every timer goes
 * on `previewFillTimeoutsRef`, and `clearPreviewFillTimers`, returned for
 * PreviewStage's unmount, cancels them all, the particle animation's included.
 */
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
  // The list mixes timeouts and intervals, so each id goes to both clears.
  const clearPreviewFillTimers = useCallback(() => {
    if (!previewFillTimeoutsRef.current.length) return;
    previewFillTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
      window.clearInterval(timeoutId);
    });
    previewFillTimeoutsRef.current = [];
  }, [previewFillTimeoutsRef]);

  useEffect(() => {
    // ---- What gets typed, and filling it all at once --------------------------
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

    // Cancels the last chapter's timers. Only Personal Info's animated run
    // returns a cleanup of its own; for the others, this or PreviewStage's
    // unmount is what stops them.
    clearPreviewFillTimers();

    // ---- Generate -------------------------------------------------------------
    // The builder's six stages, PREVIEW_BUILDER_STEP_MS apart, then the move to
    // the week once the last has held for PREVIEW_GENERATING_HOLD_MS.
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

    // ---- The week -------------------------------------------------------------
    // The outline, the headers and the rows start at fixed offsets from
    // arrival; stage 4, then the scan (5) and the break (6), follow the end of
    // the row typing. Typing progress is the time elapsed over the typing's
    // length, sampled every 32 ms, so it keeps to the clock however late a tick
    // runs.
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

    // ---- The dashboard --------------------------------------------------------
    // A card a stage, up to PREVIEW_DASHBOARD_FINAL_STAGE. It is the last
    // chapter, so nothing moves on from here.
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

    // ---- Any other chapter ----------------------------------------------------
    // Cannot run: usePreviewDerivedData builds only the four chapters handled
    // here and below.
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

    // ---- Personal Info --------------------------------------------------------
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

    // Each field starts PREVIEW_FILL_STEP_MS after the one before, whether or
    // not that one has finished, so a long value is still typing as the next
    // begins. latestCompletionMs tracks when the last of them ends.
    fillOrder.forEach((fieldKey, index) => {
      const fieldStartMs = PREVIEW_FILL_START_DELAY_MS + index * PREVIEW_FILL_STEP_MS;
      const timeoutId = window.setTimeout(() => {
        // The training days light up one at a time.
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

        // A select menu is set whole; anything else types a character every
        // getPreviewTypingStepMs.
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

      // When this field ends, worked out ahead from the same timings.
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

    // PREVIEW_COLLAPSE_DELAY_MS after the last field ends, the form collapses.
    // Once the morph has had PREVIEW_POST_MORPH_SHIFT_DELAY_MS, the builder
    // resets and, 42 ms on, the walkthrough moves to Generate, which plays the
    // builder itself. The arm that plays it here instead is for a walkthrough
    // with no Generate chapter, which usePreviewDerivedData never builds.
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
    // which is visibly wrong. Of the other "missing" deps, only scrollToChapter
    // changes: PreviewStage makes a new one each render, so listing it would
    // restart the sequence on every render, and each typed character is one.
    // The copy captured here reads only refs, setters and the fixed chapter
    // list, so it acts as a newer one would. The rest are setState functions,
    // refs and the stable clearPreviewFillTimers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePreviewChapterId, generateChapterIndex, workoutWeekChapterIndex]);

  return { clearPreviewFillTimers };
}
