/**
 * Column value conversions shared by the repositories: Date columns to ISO
 * strings and date-only keys and back, Decimal columns to numbers, and JSON
 * values and relation lists to arrays and objects. An absent date or number
 * reads as "" or null, never as 0, and an absent list or object as empty.
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
 * `YYYY-MM-DD` string, as UTC midnight. Null when there is no string or it is
 * blank. It does not validate, so a malformed string becomes an Invalid Date.
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

/**
 * Any value as an array: one that is not an array reads as empty. Used on JSON
 * list columns both ways, and by userReadRepository on loaded relation lists.
 */
export const toJsonArray = (value) => (Array.isArray(value) ? value : []);

/** A JSON column read as an object: arrays, null and scalars read as empty. */
export const toJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
