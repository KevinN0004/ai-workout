/**
 * Small helpers for the home page's preview walkthrough: day names, clamping
 * and rounding, the typing cadence and random draws. Used by the walkthrough's
 * hooks.
 */
import {
  PREVIEW_TYPING_MAX_MS,
  PREVIEW_TYPING_MIN_MS,
  PREVIEW_WEEK_DAY_NORMALIZATION,
  PREVIEW_WEEK_DAY_ORDER
} from "./constants";

/**
 * The full weekday name for a day name or short form in any case, with
 * surrounding spaces ignored ("MON" and " Weds " give "Monday" and
 * "Wednesday"), looked up in PREVIEW_WEEK_DAY_NORMALIZATION. Anything it does
 * not recognise gives "".
 */
export const normalizePreviewTrainingDay = (dayValue) => {
  const normalizedKey = String(dayValue ?? "")
    .trim()
    .toLowerCase();
  if (!normalizedKey) return "";
  return PREVIEW_WEEK_DAY_NORMALIZATION[normalizedKey] || "";
};

/** `value` held between `min` and `max`. A NaN passes through unchanged. */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** `value` rounded by Math.round to `digits` decimal places, none by default. */
export const roundTo = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * The milliseconds between typed characters for a value `textLength` characters
 * long: 560 ms divided by the length, held between PREVIEW_TYPING_MIN_MS and
 * PREVIEW_TYPING_MAX_MS, so between those bounds a longer value types faster
 * per character. A length that is missing, non-numeric or below 1 counts as 1.
 */
export const getPreviewTypingStepMs = (textLength) =>
  Math.max(
    PREVIEW_TYPING_MIN_MS,
    Math.min(PREVIEW_TYPING_MAX_MS, Math.round(560 / Math.max(Number(textLength) || 1, 1)))
  );

/**
 * A random number from `min` up to, but not including, `max`. It draws on
 * Math.random, so stubbing that fixes the result.
 */
export const randomBetween = (min, max) => min + Math.random() * (max - min);

/**
 * The weekday name of a Date, from PREVIEW_WEEK_DAY_ORDER, which starts on
 * Monday. Anything without a whole-number `getDay()`, an invalid Date included,
 * gives "Monday".
 */
export const getPreviewWeekdayName = (dateValue) => {
  const dayIndex = Number(dateValue?.getDay?.());
  if (!Number.isInteger(dayIndex)) return PREVIEW_WEEK_DAY_ORDER[0];
  const normalizedDayIndex = (dayIndex + 6) % 7;
  return PREVIEW_WEEK_DAY_ORDER[normalizedDayIndex] || PREVIEW_WEEK_DAY_ORDER[0];
};
