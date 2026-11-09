/**
 * A generated plan's structure, its days and notes: built from Gemini's text by
 * the generate route when it saves a plan, and checked by the plan repository
 * whenever it stores or reads one. The rules are those of client/src/app/plans.js.
 */
// @ts-check

/**
 * One day of a plan: its position, the weekday its heading opens with (null for
 * the one "Your plan" day of text with no weekday heading), the heading as
 * written, and the lines under it.
 * @typedef {object} PlanDay
 * @property {number} index
 * @property {string | null} weekday
 * @property {string} title
 * @property {string[]} lines
 * @property {Prescription[]} [prescriptions] a rule-built day's sets to log (roadmap B1)
 */

/**
 * What one line of a rule-built day prescribes, as generatePlan writes it:
 * reps or seconds, exactly one, each a range.
 * @typedef {object} Prescription
 * @property {string} name
 * @property {number} sets
 * @property {{ min: number, max: number } | null} reps
 * @property {{ min: number, max: number } | null} seconds
 * @property {boolean} perSide
 * @property {{ min: number, max: number } | null} targetRpe
 * @property {string} [exerciseId] its library entry (roadmap C4); absent from a
 *   plan saved before C4
 * @property {"main" | "accessory" | null} [role] its slot's role (roadmap C4)
 * @property {{ prescription: Prescription, line: string }} [swappedFrom] what the
 *   plan was generated with, on an exercise swapped since (roadmap C4)
 * @property {string | null} [swapReason] the area the latest swap named, if any
 */

/**
 * A plan's structure, as generated_plans.plan_payload stores it.
 * @typedef {object} PlanPayload
 * @property {number} version
 * @property {PlanDay[]} days
 * @property {string[]} notes
 */

/** The version of the payload this module builds and accepts. */
export const PLAN_PAYLOAD_VERSION = 1;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// The notes headings, matched at the start of a line and on a word boundary, so
// "Noteworthy" is not one. NOTES_LABEL is the label with its colon or dash,
// stripped to leave any note written on the heading's own line.
const NOTES_HEADING = /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\b/i;
const COACH_NOTES_HEADING = /^(coach\s*notes?|coach's\s*notes?)\b/i;
const NOTES_LABEL = /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\s*[:-]?\s*/i;

// The weekday a line opens with, in one spelling, or null. A weekday further
// along the line does not count, so "Repeat this on Friday" opens no day.
/** @param {string} line */
const weekdayOf = (line) => {
  const lower = line.toLowerCase();
  return WEEKDAYS.find((day) => lower.startsWith(day.toLowerCase())) ?? null;
};

// The notes open at the first Coach Notes heading, wherever it is, since the
// prompt asks for that section and a note in it can start with a weekday name.
// With none, they open at the first Tip or Note heading below the last weekday
// heading; one higher up sits inside a day and belongs to it. -1 means no notes.
/** @param {string[]} lines */
const findNotesStart = (lines) => {
  const coachNotes = lines.findIndex((line) => COACH_NOTES_HEADING.test(line));
  if (coachNotes >= 0) return coachNotes;
  const lastWeekday = lines.findLastIndex((line) => weekdayOf(line) !== null);
  return lines.findIndex((line, index) => index > lastWeekday && NOTES_HEADING.test(line));
};

/**
 * Parses a plan's text into its payload. A line that opens with a weekday name
 * starts a day, which holds the lines up to the next one; the notes are any text
 * after their heading's label, then every line below it. Text with no weekday
 * heading is one "Your plan" day, and empty text has no days.
 * @param {string} text
 * @returns {PlanPayload}
 */
export const buildPlanPayload = (text) => {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const notesStart = findNotesStart(rawLines);

  // Split off the notes: whatever follows the label on the heading's own line,
  // then every line below it.
  let lines = rawLines;
  /** @type {string[]} */
  let notes = [];
  if (notesStart >= 0) {
    const firstNote = rawLines[notesStart].replace(NOTES_LABEL, "");
    notes = [...(firstNote ? [firstNote] : []), ...rawLines.slice(notesStart + 1)];
    lines = rawLines.slice(0, notesStart);
  }

  // Cut what is left into days at each weekday heading.
  const starts = lines.flatMap((line, index) => (weekdayOf(line) ? [index] : []));
  /** @type {PlanDay[]} */
  const days = starts.length
    ? starts.map((start, index) => ({
        index,
        weekday: weekdayOf(lines[start]),
        title: lines[start],
        lines: lines.slice(start + 1, starts[index + 1] ?? lines.length)
      }))
    : lines.length
      ? [{ index: 0, weekday: null, title: "Your plan", lines }]
      : [];

  return { version: PLAN_PAYLOAD_VERSION, days, notes };
};

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
const isStringList = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

// A day as buildPlanPayload writes one at `position`: its index is its position,
// its weekday one of the seven names or null, and its title and lines are text.
/**
 * @param {unknown} day
 * @param {number} position
 */
const isPlanDay = (day, position) =>
  isRecord(day) &&
  day.index === position &&
  (day.weekday === null || (typeof day.weekday === "string" && WEEKDAYS.includes(day.weekday))) &&
  typeof day.title === "string" &&
  isStringList(day.lines);

/**
 * A range of non-negative numbers whose min does not pass its max.
 * @param {unknown} value
 */
const isRange = (value) =>
  isRecord(value) &&
  typeof value.min === "number" &&
  typeof value.max === "number" &&
  value.min >= 0 &&
  value.min <= value.max;

/**
 * A prescription as generatePlan writes one: a name, a whole number of sets,
 * reps or seconds (exactly one), and a target RPE range or none.
 * @param {unknown} value
 */
const isPrescription = (value) =>
  isRecord(value) &&
  typeof value.name === "string" &&
  value.name.length > 0 &&
  Number.isInteger(value.sets) &&
  /** @type {number} */ (value.sets) >= 1 &&
  (value.reps === null) !== (value.seconds === null) &&
  (value.reps === null || isRange(value.reps)) &&
  (value.seconds === null || isRange(value.seconds)) &&
  typeof value.perSide === "boolean" &&
  (value.targetRpe === null || isRange(value.targetRpe));

// A day as it is kept: its prescriptions when every one is well formed, and
// otherwise without them, so a bad list costs that day its pre-fill and never
// the plan.
/** @param {PlanDay} day */
const keepValidPrescriptions = (day) => {
  if (!("prescriptions" in day)) return day;
  const { prescriptions, ...rest } = day;
  return Array.isArray(prescriptions) && prescriptions.every(isPrescription) ? day : rest;
};

/**
 * A stored or received payload when it is one of this version, shaped as
 * buildPlanPayload writes it, and otherwise null. An older plan's row holds
 * `{}`, so it reads as null: no payload. A day's malformed prescriptions are
 * dropped, and the plan is kept.
 * @param {unknown} value
 * @returns {PlanPayload | null}
 */
export const toPlanPayload = (value) => {
  if (!isRecord(value) || value.version !== PLAN_PAYLOAD_VERSION) return null;
  if (!Array.isArray(value.days) || !value.days.every(isPlanDay) || !isStringList(value.notes)) {
    return null;
  }
  const payload = /** @type {PlanPayload} */ (value);
  const days = payload.days.map(keepValidPrescriptions);
  return days.every((day, index) => day === payload.days[index]) ? payload : { ...payload, days };
};

/**
 * `payload` with each weekday's prescriptions from `week`, generatePlan's
 * days, joined by weekday. A parsed day the generator did not write, and the
 * one "Your plan" day of text with no weekday, get none.
 * @param {PlanPayload} payload
 * @param {{ weekday: string, prescriptions: Prescription[] }[]} week
 * @returns {PlanPayload}
 */
export const withPrescriptions = (payload, week) => ({
  ...payload,
  days: payload.days.map((day) => {
    const generated = week.find((entry) => entry.weekday === day.weekday);
    return generated ? { ...day, prescriptions: generated.prescriptions } : day;
  })
});
