/**
 * Units, locale and form-value helpers shared by the home flow and its preview,
 * sign-up, the dashboard and the profile mapping: name splitting, the visitor's
 * measurement system, today's local date key, height and weight conversion, and
 * reading a value that may be absent as a number or null.
 */

/**
 * The regions that measure height in feet and inches and weight in pounds.
 * getPreferredMeasurementSystem picks App's units by it, and usePreviewDerivedData
 * the walkthrough's.
 */
export const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);

/**
 * Splits a full name at whitespace: the first word is the first name and the
 * rest, rejoined with single spaces, the last name. Blank input gives two
 * empty strings.
 */
export const splitFullName = (nameValue) => {
  const nameParts = String(nameValue || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!nameParts.length) {
    return { firstName: "", lastName: "" };
  }
  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(" ")
  };
};

/**
 * The region of a locale tag, upper-cased ("en-US" and "en_us" both give "US"),
 * or "" when there is none. Intl.Locale reads the tag, so a script subtag is not
 * taken for the region ("zh-Hant-TW" gives "TW"). A tag it cannot parse falls
 * back to its second subtag.
 */
export const getRegionFromLocale = (locale) => {
  if (!locale || typeof locale !== "string") return "";
  try {
    // Intl.Locale takes hyphens only, and returns the region upper-cased.
    return new Intl.Locale(locale.replace(/_/g, "-")).region || "";
  } catch {
    const localeParts = locale.split(/[-_]/).filter(Boolean);
    return localeParts.length > 1 ? localeParts[1].toUpperCase() : "";
  }
};

/**
 * "imperial" when any of the browser's preferred locales, not only the first,
 * names a region in IMPERIAL_REGION_CODES; otherwise, and with no navigator,
 * "metric".
 */
export const getPreferredMeasurementSystem = () => {
  if (typeof navigator === "undefined") return "metric";
  const locales =
    Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
  for (const locale of locales) {
    const region = getRegionFromLocale(locale);
    if (IMPERIAL_REGION_CODES.has(region)) {
      return "imperial";
    }
  }
  return "metric";
};

/**
 * Today as YYYY-MM-DD in the visitor's own time zone, the date the log forms
 * default to. Built from local getters, because toISOString would give the UTC
 * date.
 */
export const getLocalDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * A value as a number, or null when it is absent (null, undefined or "") or
 * not a number. It guards before it coerces, because `Number(null)` and
 * `Number("")` are both 0: testing afterwards would turn a missing reading into
 * a measured zero, while a measured 0 stays 0. Same shape as toNumberOrNull in
 * the server's repositories/rowValues.js.
 */
export const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Feet and inches, as form values, to whole centimetres as a string. A blank or
 * non-numeric part counts as zero, and a zero total gives "" rather than "0".
 */
export const toCmFromFeetInches = (feetValue, inchesValue) => {
  const feetNum = Number(feetValue);
  const inchesNum = Number(inchesValue);
  if (Number.isNaN(feetNum) && Number.isNaN(inchesNum)) return "";
  const totalInches =
    (Number.isNaN(feetNum) ? 0 : feetNum * 12) + (Number.isNaN(inchesNum) ? 0 : inchesNum);
  if (!totalInches) return "";
  return String(Math.round(totalInches * 2.54));
};

/**
 * Centimetres to `{ feet, inches }` as strings, with the inches rounded and 12
 * of them carried into a foot. A blank, zero or non-numeric value gives two
 * empty strings.
 */
export const toFeetInchesFromCm = (cmValue) => {
  const cmNum = Number(cmValue);
  if (!cmNum || Number.isNaN(cmNum)) return { feet: "", inches: "" };
  const totalInches = cmNum / 2.54;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet: String(feet), inches: String(inches) };
};

/**
 * A weight in `fromUnit` to kilograms as a string: from "lb" it converts and
 * rounds to a whole kilogram, and any other unit passes the number through. A
 * falsy value (the number 0 included) gives "", and a non-numeric one comes back
 * unchanged.
 */
export const toKg = (value, fromUnit) => {
  if (!value) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return fromUnit === "lb" ? String(Math.round(num * 0.453592)) : String(num);
};

/**
 * toKg's mirror: to whole pounds from "kg", with falsy and non-numeric input
 * handled the same way.
 */
export const toLb = (value, fromUnit) => {
  if (!value) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return fromUnit === "kg" ? String(Math.round(num / 0.453592)) : String(num);
};
