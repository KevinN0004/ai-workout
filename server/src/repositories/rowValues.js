/**
 * Column value conversions shared by the repositories: Date columns to ISO
 * strings and date-only keys and back, and Decimal columns to numbers. An absent
 * value reads as "" or null, never as 0.
 */

/** A timestamp as an ISO string, or "" when there is none. */
export const toIso = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

/** The `YYYY-MM-DD` key of a date column (read in UTC), or "" when there is none. */
export const toDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

/**
 * The Date to write to a `@db.Date` column: the first ten characters of a
 * `YYYY-MM-DD` string, as UTC midnight. Null when there is no string. It does
 * not validate, so a malformed string becomes an Invalid Date.
 */
export const dateOnlyToDate = (value) => {
  const raw = typeof value === "string" ? value.trim().slice(0, 10) : "";
  return raw ? new Date(`${raw}T00:00:00.000Z`) : null;
};

/**
 * Prisma returns Decimal columns as objects, so numeric fields are normalized
 * on the way out. Empty string and null both mean "absent" rather than zero.
 */
export const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
