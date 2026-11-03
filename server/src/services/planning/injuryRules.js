/**
 * Reads the planner's injuries answer, a planner option or free text, as the
 * body areas the plan generator's exercise library is tagged by. The Guides
 * view keeps its own copy (recommendationUtils.js), held equal by a contract test.
 */
// @ts-check

/** The areas text can name, in the order they are tried: lower back before back. */
export const INJURY_AREAS = ["lower back", "back", "knee", "shoulder", "hip", "wrist", "elbow"];

// The words naming each area, matched whole: the plurals, and the compounds
// that name it. "lowerback" and "upperback", written as one word, are back.
/** @type {Record<string, string[]>} */
const AREA_NAME_FORMS = {
  "lower back": ["lower back", "lower backache", "lower backaches"],
  back: ["back", "backs", "backache", "backaches", "lowerback", "upperback"],
  knee: ["knee", "knees", "kneecap", "kneecaps", "kneel", "kneeling"],
  shoulder: ["shoulder", "shoulders"],
  hip: ["hip", "hips", "hipbone", "hipbones"],
  wrist: ["wrist", "wrists"],
  elbow: ["elbow", "elbows"]
};

// An area a broader one already covers: once the lower back is found, a
// further back mention adds no area.
/** @type {Record<string, string>} */
const COVERED_BY = { back: "lower back" };

// Whole answers to "any injuries?" that mean there are none, anchored at both
// ends, so a note that goes on to name something ("no injuries except a sore
// knee") is a note.
const NO_INJURY_ANSWER =
  /^(none|nothing|nope|no|n\/?a|injury[- ]free|no (current |known )?(injur(y|ies)|limitations?|issues?|problems?|pain)( or (injur(y|ies)|limitations?|issues?|problems?|pain))?)$/;

/**
 * @param {string} text lower-cased
 * @param {string[]} forms
 */
const hasWord = (text, forms) => new RegExp(String.raw`\b(?:${forms.join("|")})\b`).test(text);

/** @param {string} value */
const isNoInjuryAnswer = (value) =>
  NO_INJURY_ANSWER.test(
    value
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.!]+$/, "")
  );

/**
 * The injury text to read: the injuries answer and a profile note, trimmed and
 * joined with a space, each left out when it is empty or is a whole answer
 * meaning none.
 * @param {unknown} injuries
 * @param {unknown} notes
 */
export const buildInjuryText = (injuries, notes) =>
  [injuries, notes]
    .map((value) => String(value || "").trim())
    .filter((value) => value && !isNoInjuryAnswer(value))
    .join(" ");

/**
 * The areas `text` names, as whole words in any case, in INJURY_AREAS' order
 * and once each; a back mention beside a found lower back adds none. Anything
 * that is not a string names no area.
 * @param {unknown} text
 * @returns {string[]}
 */
export const detectInjuryAreas = (text) => {
  const source = typeof text === "string" ? text.toLowerCase().trim() : "";
  /** @type {string[]} */
  const areas = [];
  for (const area of INJURY_AREAS) {
    if (!hasWord(source, AREA_NAME_FORMS[area])) continue;
    if (areas.includes(COVERED_BY[area])) continue;
    areas.push(area);
  }
  return areas;
};
