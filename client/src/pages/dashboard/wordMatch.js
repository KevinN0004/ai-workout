/**
 * Whole-word matching for the dashboard's keyword rules: the goal's track, the
 * injury flags and the categories today's plan favours. Used by planUtils.js and
 * tips/recommendationUtils.js.
 */

/**
 * True when lower-cased `text` holds any of `forms` as a whole word, never
 * inside a longer one, so "cut" is not found in "execute". `forms` are
 * lower-case words or phrases of letters and spaces; each spelling to accept, a
 * plural included, is listed.
 */
export const hasWord = (text, forms) =>
  new RegExp(String.raw`\b(?:${forms.join("|")})\b`).test(text);
