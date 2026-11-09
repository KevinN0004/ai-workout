/**
 * Reads a generated plan, whose prompt asks for weekday headings and a closing
 * "Coach Notes:" section, from its saved structure or its text by the server's
 * rules (planPayloadService), and tells its rest days apart. Used by App and the
 * dashboard for the plan views, the meal plan and the link to a plan day.
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
 * What one line of a rule-built day prescribes, as the server's generator
 * writes it: reps or seconds, exactly one, each a range.
 * @typedef {object} Prescription
 * @property {string} name
 * @property {number} sets
 * @property {{ min: number, max: number } | null} reps
 * @property {{ min: number, max: number } | null} seconds
 * @property {boolean} perSide
 * @property {{ min: number, max: number } | null} targetRpe
 * @property {number | null} [restSeconds] the rest after each set (roadmap B6);
 *   absent from a plan saved before it, and null where the line names none
 * @property {string} [exerciseId] its library entry (roadmap C4); absent from a
 *   plan saved before C4
 * @property {"main" | "accessory" | null} [role] its slot's role (roadmap C4)
 * @property {{ prescription: Prescription, line: string }} [swappedFrom] what the
 *   plan was generated with, on an exercise swapped since (roadmap C4)
 * @property {string | null} [swapReason] the area the latest swap named, if any
 */

/**
 * A plan's days and notes, as the plan views read them.
 * @typedef {object} PlanSections
 * @property {PlanDay[]} days
 * @property {string[]} notes
 */

/** The version of the server's saved structure this file reads. */
export const PLAN_PAYLOAD_VERSION = 1;

/**
 * The workout form's link fields with no plan day: the form's initial value,
 * its reset, and what every ordinary way of opening the Log workout modal
 * spreads into it, so a link left by an unsent plan-day log never reaches the
 * next workout. `planDayLabel` names the day for display and is never sent.
 */
export const NO_PLAN_LINK = Object.freeze({ planId: null, planDayIndex: null, planDayLabel: "" });

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// The weekday a line opens with, in one spelling, or null. A weekday further
// along the line does not count, so "Repeat this on Friday" opens no day.
/** @param {string} line */
const weekdayOf = (line) => {
  const lower = line.toLowerCase();
  return WEEKDAYS.find((day) => lower.startsWith(day.toLowerCase())) ?? null;
};

/** @param {string} line */
const hasNotesHeading = (line) => /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\b/i.test(line);

/** @param {string} line */
const hasCoachNotesHeading = (line) => /^(coach\s*notes?|coach's\s*notes?)\b/i.test(line);

// The notes open at the first Coach Notes heading, wherever it is, since the
// prompt asks for that section and a note in it can start with a weekday
// name. With none, they open at the first Tip or Note heading below the last
// weekday heading; one higher up sits inside a day and belongs to it.
/** @param {string[]} lines */
const findNotesStart = (lines) => {
  const coachNotes = lines.findIndex(hasCoachNotesHeading);
  if (coachNotes >= 0) return coachNotes;
  const lastWeekday = lines.findLastIndex((line) => weekdayOf(line) !== null);
  return lines.findIndex((line, index) => index > lastWeekday && hasNotesHeading(line));
};

/**
 * Splits a plan's text into `days`, each a `title` line and the `lines` under it
 * with its `index` and `weekday`, and `notes`. A line starting with a weekday
 * name opens a day. The notes are the first Coach Notes heading and everything
 * after it, a weekday line among them included. Without one, they are the first
 * Tips or Notes heading below the last weekday heading and everything after it;
 * one higher up is a line of its day. Text with no weekday heading becomes one
 * "Your plan" day. The rules are planPayloadService's, which a contract test pins.
 * @param {unknown} result
 * @returns {PlanSections}
 */
export const parsePlanSections = (result) => {
  if (!result) return { days: [], notes: [] };
  const rawLines = String(result)
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
    const headerLine = rawLines[notesStart];
    const strippedHeader = headerLine.replace(
      /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\s*[:-]?\s*/i,
      ""
    );
    notes = [...[strippedHeader].filter((line) => line), ...rawLines.slice(notesStart + 1)];
    lines = rawLines.slice(0, notesStart);
  }

  // Cut what is left into days at each weekday heading.
  const dayIndices = lines
    .map((line, index) => (weekdayOf(line) !== null ? index : -1))
    .filter((index) => index >= 0);

  /** @type {PlanDay[]} */
  const days = dayIndices.length
    ? dayIndices.map((start, index) => {
        const end = dayIndices[index + 1] ?? lines.length;
        const title = lines[start];
        const dayLines = lines.slice(start + 1, end);
        return { index, weekday: weekdayOf(title), title, lines: dayLines };
      })
    : lines.length
      ? [{ index: 0, weekday: null, title: "Your plan", lines }]
      : [];

  return { days, notes };
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

// A day as the server writes one at `position`: its index is its position, its
// weekday one of the seven names or null, and its title and lines are text.
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
 * @param {unknown} value
 * @returns {value is { version: number, days: PlanDay[], notes: string[] }}
 */
const isPlanPayload = (value) =>
  isRecord(value) &&
  value.version === PLAN_PAYLOAD_VERSION &&
  Array.isArray(value.days) &&
  value.days.every(isPlanDay) &&
  isStringList(value.notes);

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
 * A prescription as the server's generator writes one: a name, a whole number
 * of sets, reps or seconds (exactly one), and a target RPE range or none. The
 * same check as the server's planPayloadService.
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

// A day as it is read: its prescriptions when every one is well formed, and
// otherwise without them, so a bad list costs that day its pre-fill and never
// the plan.
/** @param {PlanDay} day */
const keepValidPrescriptions = (day) => {
  if (!("prescriptions" in day)) return day;
  const { prescriptions, ...rest } = day;
  return Array.isArray(prescriptions) && prescriptions.every(isPrescription) ? day : rest;
};

/**
 * A plan's saved days when the structure the server saved with it is valid,
 * and otherwise null. Only those days can be logged against: a workout
 * session's `planDayIndex` points into them, never into a text parse. A day's
 * malformed prescriptions are dropped, as the server drops them.
 * @param {{ payload?: unknown } | null | undefined} plan
 * @returns {PlanDay[] | null}
 */
export const savedPlanDays = (plan) =>
  isPlanPayload(plan?.payload) ? plan.payload.days.map(keepValidPrescriptions) : null;

/**
 * A plan's days and notes: from the structure the server saved with it when
 * that is valid, and otherwise from its text, which is how a plan saved without
 * one is read.
 * @param {{ payload?: unknown, text?: unknown }} plan
 * @returns {PlanSections}
 */
export const readPlan = ({ payload, text }) =>
  isPlanPayload(payload)
    ? { days: payload.days.map(keepValidPrescriptions), notes: payload.notes }
    : parsePlanSections(text);

// A day's opening main entry: what follows its "Main lifts:" heading, on the
// heading's line or the line below it, or its first line when it has none.
const MAIN_LIFTS_HEADING = /^main\s+lifts?\s*:?\s*/i;
const OPENS_WITH_REST = /^(?:-\s*)?(?:full\s+)?(?:rest|active\s+recovery|optional)\b/i;

/**
 * Whether a day's lines make it a rest day: it has none, or its opening main
 * entry starts with "Rest", "Full Rest", "Active Recovery" or "Optional". Real
 * plans give rest days lines, and training days mention rest between sets, so
 * neither having lines nor naming rest decides it. Takes a day's lines, so it
 * reads a saved day and planByWeekday's merged lines alike.
 * @param {string[]} lines
 */
export const isRestDay = (lines) => {
  if (!lines.length) return true;
  const heading = lines.findIndex((line) => MAIN_LIFTS_HEADING.test(line));
  const opening =
    heading < 0
      ? lines[0]
      : lines[heading].replace(MAIN_LIFTS_HEADING, "") || lines[heading + 1] || "";
  return OPENS_WITH_REST.test(opening);
};

/**
 * A plan's days as a map from weekday name to their lines, in order, so a
 * repeated weekday's lines merge. A day with no weekday, or no lines, adds no key.
 * @param {PlanSections} plan
 * @returns {Record<string, string[]>}
 */
export const planByWeekday = ({ days }) => {
  /** @type {Record<string, string[]>} */
  const week = {};
  for (const day of days) {
    if (day.weekday === null || !day.lines.length) continue;
    week[day.weekday] = [...(week[day.weekday] || []), ...day.lines];
  }
  return week;
};

/**
 * The newest saved plan (`dashboard.plans[0]`), read through readPlan, as
 * planByWeekday's map: the notes are left out, and a day with no lines under it
 * has no key.
 * @param {{ plans?: Array<{ payload?: unknown, plan?: unknown } | null | undefined> } | null | undefined} dashboard
 */
export const extractLatestPlanByWeekday = (dashboard) => {
  const latest = dashboard?.plans?.[0];
  if (!latest) return {};
  return planByWeekday(readPlan({ payload: latest.payload, text: latest.plan }));
};
