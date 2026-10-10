/**
 * Small helpers for the home page's preview walkthrough: day names, the locale's
 * region, clamping and rounding, the typing cadence, random draws and the
 * dashboard chapter's chart path. Used by the walkthrough's hooks and by
 * PreviewDashboardChapter.
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

/**
 * A locale tag's second subtag, upper-cased and taken as its region, or
 * Intl.Locale's region for a bare language; "" if neither. The same rule as
 * app/units.js's copy.
 */
export const getRegionFromLocale = (locale) => {
  if (!locale || typeof locale !== "string") return "";
  const localeParts = locale.split(/[-_]/).filter(Boolean);
  if (localeParts.length > 1 && localeParts[1]) {
    return localeParts[1].toUpperCase();
  }
  try {
    const parsed = new Intl.Locale(locale);
    return parsed.region ? parsed.region.toUpperCase() : "";
  } catch {
    return "";
  }
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

/** An SVG path through `values`, spread across a 260 by 110 chart by default. */
export const buildPreviewLinePath = (values, width = 260, height = 110, padding = 10) => {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / Math.max(safeValues.length - 1, 1);

  return safeValues
    .map((value, index) => {
      const x = padding + stepX * index;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
};

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
