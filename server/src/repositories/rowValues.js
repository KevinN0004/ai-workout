/**
 * Column value conversions shared between the Prisma repositories and the
 * Mongo compatibility shim that still wraps some of them.
 *
 * These were private to services/prismaDataModels.js. They are lifted here so a
 * repository can be written without importing the shim, and so the two cannot
 * drift apart while both exist.
 */

export const toIso = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export const toDateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

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
