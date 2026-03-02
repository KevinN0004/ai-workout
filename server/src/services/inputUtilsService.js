export const cleanText = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

export const toNullableNumber = (value, min, max) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
};

export const toCleanArray = (value, maxItems = 8, maxLen = 60) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

export const toCleanNameArray = (value, maxItems = 10, maxLen = 120) =>
  (Array.isArray(value) ? value : [])
    .map((item) => cleanText(typeof item === "string" ? item : item?.name, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

export const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const toNumberInput = (value) => {
  if (value === "") return null;
  if (value === undefined || value === null) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

export const normalizePlainText = (value, maxLen = 500) => {
  if (typeof value !== "string") return "";
  const stripped = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.slice(0, maxLen);
};

export const parseMultiNumberQuery = (input, min, max, maxItems = 8) => {
  if (input === undefined || input === null || input === "") return [];
  const list = Array.isArray(input) ? input : String(input).split(",");
  const values = [];
  for (const raw of list) {
    const num = toNullableNumber(String(raw).trim(), min, max);
    if (num === null) continue;
    values.push(Math.trunc(num));
    if (values.length >= maxItems) break;
  }
  return values;
};
