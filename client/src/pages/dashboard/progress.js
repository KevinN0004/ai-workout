/**
 * Logs' progress arithmetic (roadmap B2): hard sets per muscle group this week
 * against the four before, each lift's best e1RM, heaviest set and bodyweight
 * reps with their four-week change, and which sessions set a record.
 */
// @ts-check
import { toNumberOrNull } from "../../app/units";

/**
 * A muscle group the Progress panel counts sets for, and the library patterns
 * that train it.
 * @typedef {object} Group
 * @property {string} id
 * @property {string} label
 * @property {string[]} patterns
 */

/**
 * One row of this week's sets: the group, its sets this week, and the average
 * of the four weeks before, to one decimal.
 * @typedef {object} WeekRow
 * @property {string} id
 * @property {string} label
 * @property {number} thisWeek
 * @property {number} average
 */

/**
 * One lift's records as the panel shows them. A loaded lift has an e1RM (when
 * a set had 1 to 10 reps) and a heaviest set; a bodyweight lift, one with no
 * set carrying a load above 0, has its most reps. Each record carries the date
 * it was first reached and its change since four weeks before today, or null.
 * @typedef {object} LiftRecord
 * @property {string} name
 * @property {string} lastDate
 * @property {{ value: number, date: string, change: number | null } | null} e1rm
 * @property {{ loadKg: number, reps: number, date: string, change: number | null } | null} heaviest
 * @property {{ reps: number, date: string, change: number | null } | null} mostReps
 */

/**
 * A record a session set, for its "PR" tag in Logs.
 * @typedef {{ name: string, record: "e1rm" | "heaviest" | "reps" }} PrMark
 */

/** The spec's muscle groups, in the order the panel lists them. */
export const GROUPS = /** @type {Group[]} */ ([
  { id: "legs", label: "Legs", patterns: ["squat", "single-leg"] },
  { id: "posterior", label: "Posterior chain", patterns: ["hinge", "glutes-calves"] },
  { id: "push", label: "Chest & shoulders", patterns: ["horizontal-push", "vertical-push"] },
  { id: "back", label: "Back", patterns: ["horizontal-pull", "vertical-pull"] },
  { id: "core", label: "Core", patterns: ["core"] },
  { id: "arms", label: "Arms", patterns: ["arms"] }
]);

// Not hard sets, so counted toward nothing. Every other set without a group's
// pattern, a typed name's null among them, counts as Not sorted, so nothing
// logged vanishes from the count.
const UNCOUNTED = new Set(["conditioning", "mobility", "balance"]);
const NOT_SORTED = { id: "not-sorted", label: "Not sorted", patterns: [] };
const GROUP_BY_PATTERN = new Map(
  GROUPS.flatMap((group) => group.patterns.map((pattern) => [pattern, group]))
);

const DAY_MS = 86_400_000;
const MAX_E1RM_REPS = 10;

/**
 * The records a session can set, in the order its tag names them.
 * @type {PrMark["record"][]}
 */
const RECORDS = ["e1rm", "heaviest", "reps"];

/** @param {unknown} value */
const listOf = (value) => (Array.isArray(value) ? value : []);

/**
 * A "YYYY-MM-DD" date as a whole day count, NaN when it is not one.
 * @param {unknown} key
 */
const dayOf = (key) => {
  const [year, month, day] = String(key).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
};

// Day 0, 1 January 1970, was a Thursday, so a day's weekday counted from
// Monday is (day - 4) mod 7.
/** @param {number} day */
const weekStartOf = (day) => day - ((((day - 4) % 7) + 7) % 7);

/**
 * The sessions that have a date, in date order and then save order.
 * @param {unknown} sessions
 * @returns {{ session: any, day: number }[]}
 */
const inOrder = (sessions) =>
  listOf(sessions)
    .map((session) => ({ session, day: dayOf(session.date) }))
    .filter(({ day }) => Number.isFinite(day))
    .sort(
      (a, b) =>
        a.day - b.day || String(a.session.createdAt).localeCompare(String(b.session.createdAt))
    );

/**
 * A set's load in kg when it is above 0, or null: a missing load and a 0 kg
 * load are both bodyweight work.
 * @param {{ loadKg?: unknown }} set
 */
const loadOf = (set) => {
  const kg = toNumberOrNull(set.loadKg);
  return kg !== null && kg > 0 ? kg : null;
};

/**
 * A set's reps when it has at least one, or null: a failed set and a hold
 * reach no record.
 * @param {{ reps?: unknown }} set
 */
const repsOf = (set) => {
  const count = toNumberOrNull(set.reps);
  return count !== null && count >= 1 ? count : null;
};

/**
 * A set's estimated one-rep max by Epley, load × (1 + reps / 30), for a load
 * above 0 and 1 to 10 reps, or null. A single rep's is its load.
 * @param {{ reps?: unknown, loadKg?: unknown }} set
 */
export const e1rmOf = (set) => {
  const kg = loadOf(set);
  const count = repsOf(set);
  if (kg === null || count === null || count > MAX_E1RM_REPS) return null;
  return count === 1 ? kg : kg * (1 + count / 30);
};

/**
 * This week's sets per group against the average of the four weeks before,
 * weeks starting on Monday by each session's date, `today` a "YYYY-MM-DD".
 * Rows follow GROUPS, then Not sorted; a group with no sets in either is left
 * out.
 * @param {unknown} sessions
 * @param {string} today
 * @returns {WeekRow[]}
 */
export const weeklySets = (sessions, today) => {
  const thisWeek = weekStartOf(dayOf(today));
  /** @type {Map<string, number[]>} */
  const counts = new Map();
  for (const { session, day } of inOrder(sessions)) {
    const weeksAgo = (thisWeek - weekStartOf(day)) / 7;
    if (weeksAgo < 0 || weeksAgo > 4) continue;
    for (const exercise of listOf(session.exerciseSets)) {
      if (UNCOUNTED.has(exercise.pattern)) continue;
      const group = GROUP_BY_PATTERN.get(exercise.pattern) ?? NOT_SORTED;
      const weeks = counts.get(group.id) ?? [0, 0, 0, 0, 0];
      weeks[weeksAgo] += listOf(exercise.sets).length;
      counts.set(group.id, weeks);
    }
  }
  return [...GROUPS, NOT_SORTED].flatMap((group) => {
    const [now, ...before] = counts.get(group.id) ?? [0];
    const total = before.reduce((sum, count) => sum + count, 0);
    if (now === 0 && total === 0) return [];
    return [
      {
        id: group.id,
        label: group.label,
        thisWeek: now,
        average: Math.round((total / 4) * 10) / 10
      }
    ];
  });
};

/**
 * A lift's running records, each with the date it was first reached.
 * @typedef {object} Bests
 * @property {number | null} e1rm
 * @property {string} e1rmDate
 * @property {number | null} heaviestKg
 * @property {number} heaviestReps
 * @property {string} heaviestDate
 * @property {number | null} reps
 * @property {string} repsDate
 */

/** @returns {Bests} */
const noBests = () => ({
  e1rm: null,
  e1rmDate: "",
  heaviestKg: null,
  heaviestReps: 0,
  heaviestDate: "",
  reps: null,
  repsDate: ""
});

/**
 * One lift as the walk keeps it: its latest spelling and date, the session it
 * was last trained in, whether any set carried a load, its records now and its
 * records as of the cutoff.
 * @typedef {object} Lift
 * @property {string} name
 * @property {string} lastDate
 * @property {number} lastSession
 * @property {boolean} loaded
 * @property {Bests} now
 * @property {Bests} then
 */

/**
 * Raises `bests` to every record `sets` beats on `date`, and returns which it
 * beat that already existed: a first record beats nothing.
 * @param {Bests} bests
 * @param {any[]} sets
 * @param {string} date
 * @returns {PrMark["record"][]}
 */
const raise = (bests, sets, date) => {
  /** @type {Set<PrMark["record"]>} */
  const beaten = new Set();
  for (const set of sets) {
    const value = e1rmOf(set);
    const kg = loadOf(set);
    const count = repsOf(set);
    if (value !== null && (bests.e1rm === null || value > bests.e1rm)) {
      if (bests.e1rm !== null) beaten.add("e1rm");
      bests.e1rm = value;
      bests.e1rmDate = date;
    }
    if (
      kg !== null &&
      count !== null &&
      (bests.heaviestKg === null ||
        kg > bests.heaviestKg ||
        (kg === bests.heaviestKg && count > bests.heaviestReps))
    ) {
      if (bests.heaviestKg !== null) beaten.add("heaviest");
      bests.heaviestKg = kg;
      bests.heaviestReps = count;
      bests.heaviestDate = date;
    }
    if (count !== null && (bests.reps === null || count > bests.reps)) {
      if (bests.reps !== null) beaten.add("reps");
      bests.reps = count;
      bests.repsDate = date;
    }
  }
  return RECORDS.filter((record) => beaten.has(record));
};

/**
 * Walks the sessions in order, keeping each lift's records, and its records as
 * of `cutoffDay`, and every record a session beat. A lift is its name ignoring
 * case and surrounding space; two cards of one lift in a session are one.
 * @param {unknown} sessions
 * @param {number} cutoffDay
 */
const walk = (sessions, cutoffDay) => {
  /** @type {Map<string, Lift>} */
  const lifts = new Map();
  /** @type {{ id: string, key: string, name: string, record: PrMark["record"] }[]} */
  const marks = [];
  inOrder(sessions).forEach(({ session, day }, index) => {
    /** @type {Map<string, { name: string, sets: any[] }>} */
    const trained = new Map();
    for (const exercise of listOf(session.exerciseSets)) {
      const name = String(exercise.name).trim();
      const entry = trained.get(name.toLowerCase()) ?? { name, sets: [] };
      entry.sets.push(...listOf(exercise.sets));
      trained.set(name.toLowerCase(), entry);
    }
    for (const [key, { name, sets }] of trained) {
      const lift = lifts.get(key) ?? {
        name,
        lastDate: "",
        lastSession: 0,
        loaded: false,
        now: noBests(),
        then: noBests()
      };
      for (const record of raise(lift.now, sets, session.date)) {
        marks.push({ id: String(session.id), key, name, record });
      }
      if (day <= cutoffDay) lift.then = { ...lift.now };
      lift.name = name;
      lift.lastDate = session.date;
      lift.lastSession = index;
      lift.loaded ||= sets.some((set) => loadOf(set) !== null);
      lifts.set(key, lift);
    }
  });
  return { lifts, marks };
};

/**
 * `now` less `then` when both exist and they differ, or null.
 * @param {number | null} now
 * @param {number | null} then
 */
const changeOf = (now, then) => (now === null || then === null || now === then ? null : now - then);

/**
 * Each lift's records, most recently trained first, with each record's change
 * since four weeks before `today`, a "YYYY-MM-DD". A lift with no record, one
 * logged only as holds, is left out.
 * @param {unknown} sessions
 * @param {string} today
 * @returns {LiftRecord[]}
 */
export const liftRecords = (sessions, today) => {
  const { lifts } = walk(sessions, dayOf(today) - 28);
  return [...lifts.values()]
    .sort((a, b) => b.lastSession - a.lastSession)
    .flatMap(({ name, lastDate, loaded, now, then }) => {
      const e1rm =
        now.e1rm === null
          ? null
          : { value: now.e1rm, date: now.e1rmDate, change: changeOf(now.e1rm, then.e1rm) };
      const heaviest =
        now.heaviestKg === null
          ? null
          : {
              loadKg: now.heaviestKg,
              reps: now.heaviestReps,
              date: now.heaviestDate,
              change: changeOf(now.heaviestKg, then.heaviestKg)
            };
      const mostReps =
        loaded || now.reps === null
          ? null
          : { reps: now.reps, date: now.repsDate, change: changeOf(now.reps, then.reps) };
      return e1rm || heaviest || mostReps ? [{ name, lastDate, e1rm, heaviest, mostReps }] : [];
    });
};

/**
 * The sessions that set a record, by id, each with the records it set: a
 * better e1RM or heaviest set than every session before it, or for a
 * bodyweight lift more reps in one set.
 * @param {unknown} sessions
 * @returns {Map<string, PrMark[]>}
 */
export const prSessions = (sessions) => {
  const { lifts, marks } = walk(sessions, -Infinity);
  /** @type {Map<string, PrMark[]>} */
  const bySession = new Map();
  for (const { id, key, name, record } of marks) {
    if (record === "reps" && lifts.get(key)?.loaded) continue;
    bySession.set(id, [...(bySession.get(id) ?? []), { name, record }]);
  }
  return bySession;
};
