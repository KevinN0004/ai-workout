/**
 * Units, locale and form-value helpers shared by the home flow and its preview,
 * sign-up, the dashboard and the profile mapping: name splitting, the visitor's
 * measurement system, today's local date key, and height and weight conversion.
 */
const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);

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
 * or "" when there is none. It takes the second subtag when there is one, so it
 * assumes language-REGION; a bare language is asked of Intl.Locale.
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
