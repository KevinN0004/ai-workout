import {
  PREVIEW_TYPING_MAX_MS,
  PREVIEW_TYPING_MIN_MS,
  PREVIEW_WEEK_DAY_NORMALIZATION,
  PREVIEW_WEEK_DAY_ORDER
} from "./constants";

export const normalizePreviewTrainingDay = (dayValue) => {
  const normalizedKey = String(dayValue ?? "").trim().toLowerCase();
  if (!normalizedKey) return "";
  return PREVIEW_WEEK_DAY_NORMALIZATION[normalizedKey] || "";
};

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

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const roundTo = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const getPreviewTypingStepMs = (textLength) =>
  Math.max(
    PREVIEW_TYPING_MIN_MS,
    Math.min(PREVIEW_TYPING_MAX_MS, Math.round(560 / Math.max(Number(textLength) || 1, 1)))
  );

export const randomBetween = (min, max) => min + (Math.random() * (max - min));

export const buildPreviewLinePath = (values, width = 260, height = 110, padding = 10) => {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / Math.max(safeValues.length - 1, 1);

  return safeValues
    .map((value, index) => {
      const x = padding + stepX * index;
      const y = height - padding - (((value - min) / range) * (height - padding * 2));
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
};

export const getPreviewWeekdayName = (dateValue) => {
  const dayIndex = Number(dateValue?.getDay?.());
  if (!Number.isInteger(dayIndex)) return PREVIEW_WEEK_DAY_ORDER[0];
  const normalizedDayIndex = (dayIndex + 6) % 7;
  return PREVIEW_WEEK_DAY_ORDER[normalizedDayIndex] || PREVIEW_WEEK_DAY_ORDER[0];
};
