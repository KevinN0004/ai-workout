const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);

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

export const getPreferredMeasurementSystem = () => {
  if (typeof navigator === "undefined") return "metric";
  const locales = Array.isArray(navigator.languages) && navigator.languages.length
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

export const getLocalDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toCmFromFeetInches = (feetValue, inchesValue) => {
  const feetNum = Number(feetValue);
  const inchesNum = Number(inchesValue);
  if (Number.isNaN(feetNum) && Number.isNaN(inchesNum)) return "";
  const totalInches = (Number.isNaN(feetNum) ? 0 : feetNum * 12) +
    (Number.isNaN(inchesNum) ? 0 : inchesNum);
  if (!totalInches) return "";
  return String(Math.round(totalInches * 2.54));
};

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

export const toKg = (value, fromUnit) => {
  if (!value) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return fromUnit === "lb" ? String(Math.round(num * 0.453592)) : String(num);
};

export const toLb = (value, fromUnit) => {
  if (!value) return "";
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return fromUnit === "kg" ? String(Math.round(num / 0.453592)) : String(num);
};
