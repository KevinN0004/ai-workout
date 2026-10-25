/**
 * Whole-word matching for the dashboard's keyword rules: the goal's track, the
 * injury flags and the categories today's plan favours. Used by planUtils.js and
 * tips/recommendationUtils.js.
 */

/**
 * A pattern matching any of `forms` as a whole word, never inside a longer one,
 * so "cut" is not found in "execute". `forms` are lower-case words or phrases
 * of letters and spaces; each spelling to accept, a plural included, is listed.
 * Pass "g" as `flags` to replace every match.
 */
export const wordPattern = (forms, flags = "") =>
  new RegExp(String.raw`\b(?:${forms.join("|")})\b`, flags);

/** True when lower-cased `text` holds any of `forms` as a whole word. */
export const hasWord = (text, forms) => wordPattern(forms).test(text);
