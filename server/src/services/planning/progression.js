/**
 * The week's load for each lift of the newest saved plan, worked out from the
 * sessions logged before the week: a step up, a hold or a deload, and a deload
 * week when one is due (docs/specs/2026-11-06-adaptive-progression-design.md).
 */
// @ts-check

import { toNumberOrNull } from "../../repositories/rowValues.js";
import { EXERCISES } from "./exerciseLibrary.js";
import { buildInjuryText, detectInjuryAreas } from "./injuryRules.js";

/** @typedef {import("./exerciseLibrary.js").Exercise} Exercise */
/** @typedef {import("../dashboard/planPayloadService.js").PlanPayload} PlanPayload */

/**
 * A plan as mapGeneratedPlan returns it: the rules read its level, its injury
 * answer and its saved structure.
 * @typedef {object} SavedPlan
 * @property {unknown} [level]
 * @property {unknown} [injuries]
 * @property {PlanPayload | null} payload
 */

/**
 * A session as mapWorkoutSession returns it, with each exercise's sets.
 * @typedef {object} LoggedSession
 * @property {string} date
 * @property {string} createdAt
 * @property {{ name: string, sets: Record<string, unknown>[] }[]} exerciseSets
 */

/**
 * One lift's week. `kg` and `lb` are null for a lift with no load to set; for
 * an `ask`, `target` is the step up it asks about.
 * @typedef {object} LiftWeek
 * @property {string} name
 * @property {string} key
 * @property {"up" | "hold" | "deload" | "ask" | "none"} change
 * @property {{ from: number, target: number } | null} kg
 * @property {{ from: number, target: number } | null} lb
 * @property {number} sets
 * @property {string} why
 * @property {string | null} decision the answer that applies, or null
 */

/**
 * Whether the rules made this a deload week, the training weeks in a row
 * before it, and the user's answer when it is one.
 * @typedef {object} DeloadWeek
 * @property {boolean} active
 * @property {number} count
 * @property {string | null} reason
 * @property {"normal" | null} decision
 */

/** @typedef {{ weekStart: string, deloadWeek: DeloadWeek, lifts: LiftWeek[] }} Progression */

/** @typedef {{ reps: number | null, loadKg: number, rpe: number | null }} LoadedSet */

/** One load step in each unit. */
export const STEPS = Object.freeze({ kg: 2.5, lb: 5 });

// The client stores a load typed in pounds as kg by this factor
// (client/src/app/exerciseSets.js), so the server reads it back the same way.
const KG_PER_LB = 0.45359237;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;
const EASY_RPE = 8;
// Training weeks in a row before a deload week: a beginner's first comes later.
const RUN_WEEKS = 5;
const BEGINNER_FIRST_RUN_WEEKS = 7;
// Equipment a load is logged on. A lift that needs none of it is bodyweight,
// and so is one that needs it only to hang from.
const LOADED_EQUIPMENT = new Set(["dumbbell", "kettlebell", "barbell", "cable", "machine"]);
const BODYWEIGHT_IDS = new Set(["barbell-inverted-row"]);
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DELOAD_WEEK_WHY = "Deload week: same load, half the sets";
const MISSED_WHY = "No workout logged last week; about 10% lighter to rebuild";
const FLOOR_WHY = "Already at the lightest step, so it holds instead of going lighter";

// What each answer turns a change into; an answer missing here is ignored.
/** @type {Record<string, Record<string, "up" | "hold">>} */
const ANSWERS = {
  up: { undo: "hold" },
  deload: { undo: "hold" },
  ask: { accept: "up", decline: "hold" },
  hold: {}
};

/**
 * @param {unknown} value
 * @returns {value is string}
 */
const isDateKey = (value) => {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
};

/**
 * @param {string} key
 * @param {number} days
 */
const addDays = (key, days) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** @param {Date} now */
const utcDateKey = (now) => now.toISOString().slice(0, 10);

/** @param {string} key */
const dayLabel = (key) => {
  const date = new Date(`${key}T00:00:00Z`);
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
};

/**
 * A lift's key: its name trimmed and lower-cased, as Logs groups lifts.
 * @param {unknown} name
 */
export const liftKeyOf = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase();

/**
 * The Monday of a `YYYY-MM-DD` key, as a key, worked out in UTC so the
 * server's zone never moves a day.
 * @param {string} dateKey
 */
export const weekStartOf = (dateKey) => {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return addDays(dateKey, -((weekday + 6) % 7));
};

/**
 * The client's date when it is a real date key within one day of `now`'s UTC
 * date, and otherwise the server's own.
 * @param {unknown} today
 * @param {Date} now
 */
export const clientToday = (today, now) => {
  const own = utcDateKey(now);
  if (!isDateKey(today)) return own;
  const apart = Math.abs(Date.parse(`${today}T00:00:00Z`) - Date.parse(`${own}T00:00:00Z`));
  return apart <= DAY_MS ? today : own;
};

/**
 * The weeks an answer may be given for: the Mondays of `now`'s UTC date and
 * of the days either side of it, earliest first.
 * @param {Date} now
 */
export const allowedWeekStarts = (now) => {
  const own = utcDateKey(now);
  return [...new Set([-1, 0, 1].map((days) => weekStartOf(addDays(own, days))))];
};

/**
 * An exercise's sets in a deload week: half, rounded up, and at least one.
 * @param {number} sets
 */
export const deloadSets = (sets) => Math.max(1, Math.ceil(sets / 2));

/**
 * A logged set's numbers, each read through toNumberOrNull, so a missing one is
 * null and a measured 0 stays 0.
 * @param {Record<string, unknown>} set
 */
export const readSet = (set) => ({
  reps: toNumberOrNull(set.reps),
  loadKg: toNumberOrNull(set.loadKg),
  rpe: toNumberOrNull(set.rpe)
});

/**
 * The nearest step to `value`, and never less than one step.
 * @param {number} value
 * @param {number} step
 */
const toStep = (value, step) => Math.max(step, Math.round(value / step) * step);

/**
 * @param {number} from
 * @param {number} step
 * @param {"up" | "hold" | "deload"} move
 */
const moveBy = (from, step, move) => {
  if (move === "up") return from + step;
  if (move === "deload") return Math.min(from - step, toStep(from * 0.9, step));
  return from;
};

// The library looked up by lift key, and, for each area, the ids an entry names
// as its regression for it. Built once per library.
/** @type {WeakMap<Exercise[], { byKey: Map<string, Exercise>, regressionIds: Map<string, Set<string>> }>} */
const INDEXES = new WeakMap();

/** @param {Exercise[]} library */
const indexOf = (library) => {
  const cached = INDEXES.get(library);
  if (cached) return cached;
  const byKey = new Map(library.map((entry) => [liftKeyOf(entry.name), entry]));
  /** @type {Map<string, Set<string>>} */
  const regressionIds = new Map();
  for (const entry of library) {
    for (const [area, regression] of Object.entries(entry.regressions)) {
      regressionIds.set(area, (regressionIds.get(area) ?? new Set()).add(regression.id));
    }
  }
  const index = { byKey, regressionIds };
  INDEXES.set(library, index);
  return index;
};

/**
 * The plan's lifts, each once under its first prescription: every exercise
 * prescribed in reps, with its sets and the top of its rep range.
 * @param {PlanPayload} payload
 */
const liftsOf = (payload) => {
  const seen = new Set();
  /** @type {{ name: string, key: string, sets: number, top: number }[]} */
  const lifts = [];
  for (const day of payload.days) {
    for (const prescription of day.prescriptions ?? []) {
      const key = liftKeyOf(prescription.name);
      if (!prescription.reps || seen.has(key)) continue;
      seen.add(key);
      lifts.push({
        name: prescription.name,
        key,
        sets: prescription.sets,
        top: prescription.reps.max
      });
    }
  }
  return lifts;
};

/**
 * A session's sets with a load above 0, by lift key.
 * @param {LoggedSession} session
 */
const loadedByLift = (session) => {
  /** @type {Map<string, LoadedSet[]>} */
  const byLift = new Map();
  for (const exercise of session.exerciseSets) {
    const key = liftKeyOf(exercise.name);
    const loaded = exercise.sets
      .map(readSet)
      .flatMap(({ reps, loadKg, rpe }) =>
        loadKg !== null && loadKg > 0 ? [{ reps, loadKg, rpe }] : []
      );
    if (loaded.length) byLift.set(key, [...(byLift.get(key) ?? []), ...loaded]);
  }
  return { date: session.date, byLift };
};

/**
 * One session of a lift as the rules read it: its working load, the heaviest
 * it logged; the sets at that load; and their average RPE, or null when none
 * of them has one.
 * @param {{ date: string, sets: LoadedSet[] }} entry
 */
const summarize = ({ date, sets }) => {
  const working = Math.max(...sets.map((set) => set.loadKg));
  const atLoad = sets.filter((set) => set.loadKg === working);
  const rpes = atLoad.flatMap((set) => (set.rpe === null ? [] : [set.rpe]));
  const rpe = rpes.length ? rpes.reduce((sum, value) => sum + value, 0) / rpes.length : null;
  return { date, working, atLoad, rpe };
};

/**
 * The last session's average RPE, to one decimal, when the lift's last three
 * sessions were at one load and each averaged a higher RPE than the one
 * before, the last above 8; otherwise null. A session with no RPE breaks the run.
 * @param {ReturnType<typeof summarize>[]} history
 */
const risingRpe = (history) => {
  const run = history.slice(-3);
  if (run.length < 3) return null;
  const [first, second, last] = run;
  if (first.working !== last.working || second.working !== last.working) return null;
  if (first.rpe === null || second.rpe === null || last.rpe === null) return null;
  const rising = first.rpe < second.rpe && second.rpe < last.rpe && last.rpe > EASY_RPE;
  return rising ? Math.round(last.rpe * 10) / 10 : null;
};

/**
 * The deload week: weeks are walked from the first workout's, each with a
 * workout counting one more and a missed one resetting the count. A week the
 * rules make a deload week resets it too, trained or not, so no past answer is read.
 * @param {LoggedSession[]} workouts in date order, all before `weekStart`
 * @param {string} weekStart
 * @param {boolean} beginner
 * @param {string | null} answer the week's stored answer
 * @returns {DeloadWeek}
 */
const deloadWeekOf = (workouts, weekStart, beginner, answer) => {
  const trained = new Set(workouts.map((workout) => weekStartOf(workout.date)));
  let count = 0;
  let deloads = 0;
  const runWeeks = () => (beginner && deloads === 0 ? BEGINNER_FIRST_RUN_WEEKS : RUN_WEEKS);
  const first = workouts[0];
  for (let week = first ? weekStartOf(first.date) : weekStart; week < weekStart;) {
    if (count >= runWeeks()) {
      count = 0;
      deloads += 1;
    } else {
      count = trained.has(week) ? count + 1 : 0;
    }
    week = addDays(week, 7);
  }
  const active = count >= runWeeks();
  return {
    active,
    count,
    // The run before a deload week is 5 or 7 weeks, so "th" is always right.
    reason: active ? `Your ${count + 1}th week in a row: same loads, half the sets` : null,
    decision: active && answer === "normal" ? "normal" : null
  };
};

/**
 * @param {Record<string, string>} decisions
 * @param {string} key
 */
const answerOf = (decisions, key) => (Object.hasOwn(decisions, key) ? decisions[key] : null);

/**
 * The week's progression for `plan`'s lifts, from `sessions` logged before the
 * week of `today`, or null when the plan has no saved structure. `decisions`
 * maps a lift key, or "" for the week, to its stored answer; `notes` is the
 * profile note, read with the plan's injury answer.
 * @param {object} input
 * @param {SavedPlan | null} input.plan
 * @param {LoggedSession[]} input.sessions
 * @param {Record<string, string>} input.decisions
 * @param {string} input.today a date key, already checked with clientToday
 * @param {unknown} input.notes
 * @param {Exercise[]} [input.library]
 * @returns {Progression | null}
 */
export const buildProgression = ({
  plan,
  sessions,
  decisions,
  today,
  notes,
  library = EXERCISES
}) => {
  if (!plan?.payload) return null;
  const weekStart = weekStartOf(today);
  const index = indexOf(library);
  const areas = detectInjuryAreas(buildInjuryText(plan.injuries, notes));
  const workouts = sessions
    .filter((session) => isDateKey(session.date) && session.date < weekStart)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  // The level as the generator reads it, where only a beginner differs.
  const beginner = liftKeyOf(plan.level) === "beginner";
  const deloadWeek = deloadWeekOf(workouts, weekStart, beginner, answerOf(decisions, ""));
  const lightWeek = deloadWeek.active && deloadWeek.decision === null;
  // A lift with a working load has a workout before the week before, so a
  // week before with none is always the spec's missed week.
  const weekBefore = addDays(weekStart, -7);
  const missedLastWeek = !workouts.some((workout) => workout.date >= weekBefore);
  const windowStart = addDays(weekStart, -WINDOW_DAYS);
  const recent = workouts.filter((workout) => workout.date >= windowStart).map(loadedByLift);

  const lifts = liftsOf(plan.payload).map(({ name, key, sets: prescribed, top }) => {
    const sets = lightWeek ? deloadSets(prescribed) : prescribed;
    const entry = index.byKey.get(key);
    /** @param {string} why @returns {LiftWeek} */
    const none = (why) => ({
      name,
      key,
      change: "none",
      kg: null,
      lb: null,
      sets,
      why,
      decision: null
    });
    const loaded = entry?.needs.some((need) => LOADED_EQUIPMENT.has(need));
    if (entry && (!loaded || BODYWEIGHT_IDS.has(entry.id))) {
      return none("Bodyweight: no load to set");
    }
    const history = recent.flatMap(({ date, byLift }) => {
      const logged = byLift.get(key);
      return logged ? [summarize({ date, sets: logged })] : [];
    });
    const last = history[history.length - 1];
    if (!last) return none("Pick a load: none logged in the last four weeks");

    const from = {
      kg: toStep(last.working, STEPS.kg),
      lb: toStep(last.working / KG_PER_LB, STEPS.lb)
    };
    const when = dayLabel(last.date);
    const easy = `${top} reps at RPE 8 or below`;
    const rising = risingRpe(history);
    /** @type {{ change: "up" | "hold" | "deload" | "ask", why: string }} */
    let ruled;
    if (lightWeek) {
      ruled = { change: "hold", why: DELOAD_WEEK_WHY };
    } else if (missedLastWeek || rising !== null) {
      // A lift already at one step holds. One step in pounds is under 7.5 lb,
      // which is one step in kg too, so the kg floor covers both units.
      ruled =
        from.kg <= STEPS.kg
          ? { change: "hold", why: FLOOR_WHY }
          : {
              change: "deload",
              why: missedLastWeek
                ? MISSED_WHY
                : `RPE rose three sessions in a row, to ${rising} on ${when}; about 10% lighter to recover`
            };
    } else if (
      last.atLoad.length >= prescribed &&
      last.atLoad.every(
        (set) => set.reps !== null && set.reps >= top && set.rpe !== null && set.rpe <= EASY_RPE
      )
    ) {
      const area =
        entry &&
        areas.find(
          (candidate) => entry.flags[candidate] || index.regressionIds.get(candidate)?.has(entry.id)
        );
      const why = `Every set reached ${easy} on ${when}`;
      ruled = area
        ? {
            change: "ask",
            why: `${why}. It asks first because your injury answer or note names your ${area}`
          }
        : { change: "up", why };
    } else {
      ruled = {
        change: "hold",
        why: `Same load until every set reaches ${easy} (last logged ${when})`
      };
    }

    const answer = answerOf(decisions, key);
    const answered = answer !== null && Object.hasOwn(ANSWERS[ruled.change], answer);
    const change = answered ? ANSWERS[ruled.change][/** @type {string} */ (answer)] : ruled.change;
    const move = change === "ask" ? "up" : change;
    return {
      name,
      key,
      change,
      kg: { from: from.kg, target: moveBy(from.kg, STEPS.kg, move) },
      lb: { from: from.lb, target: moveBy(from.lb, STEPS.lb, move) },
      sets,
      why: ruled.why,
      decision: answered ? answer : null
    };
  });

  return { weekStart, deloadWeek, lifts };
};
