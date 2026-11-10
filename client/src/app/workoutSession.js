/**
 * The in-gym session (roadmap B6): its exercises and logged sets, and every
 * change to it, as pure functions of a session. Kept on the device by
 * activeSession.js, and saved at Finish through events.js's queueWorkout.
 */
// @ts-check
import { fromLoadKg, toLoadKg } from "./exerciseSets";
import { getLocalDateKey, toNumberOrNull } from "./units";

/**
 * One logged set: reps, or seconds when the exercise counts seconds; a load in
 * kg, null for bodyweight; and an RPE, null when none was tapped.
 * @typedef {object} SessionSet
 * @property {number} amount
 * @property {number | null} loadKg
 * @property {number | null} rpe
 */

/**
 * One exercise of the session, with its targets as numbers and as text.
 * @typedef {object} SessionExercise
 * @property {string} key
 * @property {string} name
 * @property {"reps" | "seconds"} kind
 * @property {boolean} perSide
 * @property {number | null} targetAmount the top of the prescribed range
 * @property {string} targetText as the card shows it, for example "8-10 reps @ RPE 7-8"
 * @property {number | null} targetLoadKg
 * @property {number} plannedSets 0 for an exercise added in the session
 * @property {number} restSeconds
 * @property {boolean} skipped
 * @property {SessionSet[]} sets
 */

/**
 * The open session.
 * @typedef {object} WorkoutSession
 * @property {1} version
 * @property {string} clientId the replay key Finish sends as `id`
 * @property {number} startedAt ms since the epoch
 * @property {string} date the local date it started, YYYY-MM-DD
 * @property {string} title
 * @property {string | null} planId
 * @property {number | null} planDayIndex
 * @property {number} current the index of the exercise on screen
 * @property {number | null} restEndsAt ms since the epoch, while a rest runs
 * @property {SessionExercise[]} exercises
 */

/**
 * The fields of a plan day the session reads.
 * @typedef {{ index: number, title: string, prescriptions?: Array<{ restSeconds?: unknown }> }} SessionDay
 */

/**
 * The fields of a plan's prescription a swapped-in exercise reads (roadmap C4).
 * @typedef {object} SessionPrescription
 * @property {string} name
 * @property {number} sets
 * @property {{ min: number, max: number } | null} reps
 * @property {{ min: number, max: number } | null} seconds
 * @property {boolean} perSide
 * @property {{ min: number, max: number } | null} targetRpe
 * @property {unknown} [restSeconds]
 */

/**
 * The fields of a Log workout card (app/exerciseSets.js) the session reads.
 * @typedef {{ key: string, name: string, kind: "reps" | "seconds", perSide: boolean, targets: { amount?: string, rpe?: string, load?: string } | null, sets: unknown[] }} SessionCard
 */

/** The rest, in seconds, when a plan gives none. */
export const DEFAULT_REST_SECONDS = 90;
// The shortest and longest rest the ±15 s buttons reach, in seconds.
const MIN_REST_SECONDS = 15;
const MAX_REST_SECONDS = 600;
// A load step in the region's unit: 2.5 kg, or 5 lb.
const LOAD_STEP = { metric: 2.5, imperial: 5 };

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * 1000;
// The server's bounds on a session's duration, in minutes.
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 360;
const MAX_LOAD_KG = 1000;
// Where an exercise with no target starts.
const UNTARGETED_REPS = 10;
const UNTARGETED_SECONDS = 30;
// The steppers' steps and bounds for reps and for seconds.
const AMOUNT_RULES = {
  reps: { step: 1, min: 0, max: 200 },
  seconds: { step: 5, min: 5, max: 3600 }
};

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * The top of a range as a card writes it, "8-10" giving 10 and "5" giving 5, or
 * null when nothing usable is given. Absent text is guarded before it is read
 * as a number, so a missing target never becomes 0.
 * @param {unknown} value
 */
export const topOfRange = (value) =>
  toNumberOrNull(
    String(value ?? "")
      .split("-")
      .at(-1)
      ?.trim() ?? ""
  );

/**
 * A prescription's rest when it is a positive whole number of seconds, and
 * otherwise the default.
 * @param {unknown} restSeconds
 */
const restOf = (restSeconds) =>
  typeof restSeconds === "number" && Number.isInteger(restSeconds) && restSeconds > 0
    ? restSeconds
    : DEFAULT_REST_SECONDS;

/**
 * A card's targets as one line of text: the range and its unit, a side, and the
 * RPE.
 * @param {SessionCard} card
 */
const targetTextOf = (card) => {
  const amount = card.targets?.amount ?? "";
  if (!amount) return "";
  const unit = card.kind === "seconds" ? "s" : "reps";
  const side = card.perSide ? " a side" : "";
  const rpe = card.targets?.rpe ? ` @ RPE ${card.targets.rpe}` : "";
  return `${amount} ${unit}${side}${rpe}`;
};

/**
 * A session with these exercises, started at `now`.
 * @param {{ title: string, planId: string | null, planDayIndex: number | null, exercises: SessionExercise[], now: number }} fields
 * @returns {WorkoutSession}
 */
const newSession = ({ title, planId, planDayIndex, exercises, now }) => ({
  version: 1,
  clientId: crypto.randomUUID(),
  startedAt: now,
  date: getLocalDateKey(),
  title,
  planId,
  planDayIndex,
  current: 0,
  restEndsAt: null,
  exercises
});

/**
 * A session for a plan day, from the cards buildPlanDayPrefill makes for it
 * (with the week's loads and sets) and each card's prescription's rest. The
 * cards come from the prescriptions in order, so a card and its prescription
 * share an index; a day saved before prescriptions gets the default rest.
 * @param {{ day: SessionDay, cards: SessionCard[], planId: string, system: "metric" | "imperial", now: number }} input
 * @returns {WorkoutSession}
 */
export const sessionFromPlanDay = ({ day, cards, planId, system, now }) =>
  newSession({
    title: day.title,
    planId,
    planDayIndex: day.index,
    now,
    exercises: cards.map((card, index) => ({
      key: card.key,
      name: card.name,
      kind: card.kind,
      perSide: card.perSide,
      targetAmount: topOfRange(card.targets?.amount),
      targetText: targetTextOf(card),
      targetLoadKg: toLoadKg(card.targets?.load, system),
      plannedSets: card.sets.length,
      restSeconds: restOf(day.prescriptions?.[index]?.restSeconds),
      skipped: false,
      sets: []
    }))
  });

/**
 * A session with no exercises yet, titled "Workout".
 * @param {{ now: number }} input
 * @returns {WorkoutSession}
 */
export const blankSession = ({ now }) =>
  newSession({ title: "Workout", planId: null, planDayIndex: null, exercises: [], now });

/**
 * `session` with `exercises` in place of its own.
 * @param {WorkoutSession} session
 * @param {SessionExercise[]} exercises
 * @returns {WorkoutSession}
 */
const withExercises = (session, exercises) => ({ ...session, exercises });

/**
 * `session` with an exercise added by name, untargeted, at the default rest,
 * and on screen. A name that is blank once trimmed adds nothing.
 * @param {WorkoutSession} session
 * @param {{ name: string, kind: "reps" | "seconds" }} exercise
 * @returns {WorkoutSession}
 */
export const addExercise = (session, { name, kind }) => {
  const trimmed = name.trim();
  if (!trimmed) return session;
  const added = {
    key: crypto.randomUUID(),
    name: trimmed,
    kind,
    perSide: false,
    targetAmount: null,
    targetText: "",
    targetLoadKg: null,
    plannedSets: 0,
    restSeconds: DEFAULT_REST_SECONDS,
    skipped: false,
    sets: []
  };
  return {
    ...session,
    exercises: [...session.exercises, added],
    current: session.exercises.length
  };
};

/**
 * The set "Done" would log for `exercise`: the first from its targets, a later
 * one copying the previous set's amount and load. The RPE is never copied, so
 * an effort nobody tapped is never logged.
 * @param {SessionExercise} exercise
 * @returns {SessionSet}
 */
export const draftFor = (exercise) => {
  const last = exercise.sets.at(-1);
  if (last) return { amount: last.amount, loadKg: last.loadKg, rpe: null };
  const untargeted = exercise.kind === "seconds" ? UNTARGETED_SECONDS : UNTARGETED_REPS;
  return { amount: exercise.targetAmount ?? untargeted, loadKg: exercise.targetLoadKg, rpe: null };
};

/**
 * `session` with its current exercise changed by `change`.
 * @param {WorkoutSession} session
 * @param {(exercise: SessionExercise) => SessionExercise} change
 * @returns {WorkoutSession}
 */
const changeCurrent = (session, change) =>
  withExercises(
    session,
    session.exercises.map((exercise, index) =>
      index === session.current ? change(exercise) : exercise
    )
  );

/**
 * `session` with `set` logged on the current exercise, and its rest started.
 * @param {WorkoutSession} session
 * @param {SessionSet} set
 * @param {number} now
 * @returns {WorkoutSession}
 */
export const logSet = (session, set, now) => {
  const exercise = session.exercises[session.current];
  return {
    ...changeCurrent(session, (current) => ({ ...current, sets: [...current.sets, set] })),
    restEndsAt: now + exercise.restSeconds * MS_PER_SECOND
  };
};

/**
 * `session` without the current exercise's last set, and with no rest running.
 * With nothing logged there, it is returned unchanged.
 * @param {WorkoutSession} session
 * @returns {WorkoutSession}
 */
export const undoLastSet = (session) => {
  if (!session.exercises[session.current]?.sets.length) return session;
  return {
    ...changeCurrent(session, (current) => ({ ...current, sets: current.sets.slice(0, -1) })),
    restEndsAt: null
  };
};

/**
 * `session` with the exercise at `index` on screen, when there is one.
 * @param {WorkoutSession} session
 * @param {number} index
 * @returns {WorkoutSession}
 */
export const goTo = (session, index) =>
  index >= 0 && index < session.exercises.length ? { ...session, current: index } : session;

/**
 * A prescribed range as the cards write it: "8-10", or "30" when it is one
 * value; "" for none.
 * @param {{ min: number, max: number } | null} range
 */
const rangeTextOf = (range) =>
  range ? (range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`) : "";

/**
 * `session` with the exercise at `index` replaced by the one `prescription`
 * prescribes, after a swap in the plan (roadmap C4): its targets, sets and
 * rest, a new key, no load to suggest and no sets. An exercise with sets
 * logged, or an index past the end, leaves `session` as it is.
 * @param {WorkoutSession} session
 * @param {number} index
 * @param {SessionPrescription} prescription
 * @returns {WorkoutSession}
 */
export const replaceExercise = (session, index, prescription) => {
  const current = session.exercises[index];
  if (!current || current.sets.length) return session;
  /** @type {SessionCard} */
  const card = {
    key: crypto.randomUUID(),
    name: prescription.name,
    kind: prescription.seconds ? "seconds" : "reps",
    perSide: prescription.perSide,
    targets: {
      amount: rangeTextOf(prescription.reps ?? prescription.seconds),
      rpe: rangeTextOf(prescription.targetRpe)
    },
    sets: []
  };
  return withExercises(
    session,
    session.exercises.map((exercise, at) =>
      at === index
        ? {
            key: card.key,
            name: card.name,
            kind: card.kind,
            perSide: card.perSide,
            targetAmount: topOfRange(card.targets?.amount),
            targetText: targetTextOf(card),
            targetLoadKg: null,
            plannedSets: prescription.sets,
            restSeconds: restOf(prescription.restSeconds),
            skipped: false,
            sets: []
          }
        : exercise
    )
  );
};

/**
 * `session` with the exercise at `index` marked skipped, or back again.
 * @param {WorkoutSession} session
 * @param {number} index
 * @returns {WorkoutSession}
 */
export const skipExercise = (session, index) =>
  withExercises(
    session,
    session.exercises.map((exercise, at) =>
      at === index ? { ...exercise, skipped: !exercise.skipped } : exercise
    )
  );

/**
 * `session` with the current exercise's rest moved by `deltaSeconds`, kept
 * within 15 seconds and 10 minutes, and a running rest moved with it. A rest
 * moved past `now` ends now.
 * @param {WorkoutSession} session
 * @param {number} deltaSeconds
 * @param {number} now
 * @returns {WorkoutSession}
 */
export const adjustRest = (session, deltaSeconds, now) => {
  const changed = changeCurrent(session, (current) => ({
    ...current,
    restSeconds: clamp(current.restSeconds + deltaSeconds, MIN_REST_SECONDS, MAX_REST_SECONDS)
  }));
  if (session.restEndsAt === null) return changed;
  return {
    ...changed,
    restEndsAt: clamp(
      session.restEndsAt + deltaSeconds * MS_PER_SECOND,
      now,
      now + MAX_REST_SECONDS * MS_PER_SECOND
    )
  };
};

/**
 * `session` with no rest running.
 * @param {WorkoutSession} session
 * @returns {WorkoutSession}
 */
export const endRest = (session) => ({ ...session, restEndsAt: null });

/**
 * How many sets `session` holds.
 * @param {WorkoutSession} session
 */
export const loggedSetCount = (session) =>
  session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);

/**
 * `amount` moved one step up (`direction` 1) or down (-1): reps by one from 0
 * to 200, seconds by five from 5 to 3600.
 * @param {number} amount
 * @param {1 | -1} direction
 * @param {"reps" | "seconds"} kind
 */
export const stepAmount = (amount, direction, kind) => {
  const { step, min, max } = AMOUNT_RULES[kind];
  return clamp(amount + direction * step, min, max);
};

/**
 * A load in kg moved one step, in the region's unit: 2.5 kg or 5 lb. Down from
 * the lightest step is bodyweight (null), never 0 kg, and up stops at 1000 kg.
 * @param {number | null} loadKg
 * @param {1 | -1} direction
 * @param {"metric" | "imperial"} system
 * @returns {number | null}
 */
export const stepLoad = (loadKg, direction, system) => {
  const step = LOAD_STEP[system];
  const shown = toNumberOrNull(fromLoadKg(loadKg, system));
  if (shown === null) return direction === 1 ? toLoadKg(step, system) : null;
  if (direction === -1 && shown <= step) return null;
  const next = toLoadKg(shown + direction * step, system);
  return next === null ? null : Math.min(next, MAX_LOAD_KG);
};

/**
 * What Finish queues through queueWorkout: the session's replay key, date and
 * title, its plan-day link, and its exercises with sets, in the API's shape and
 * in kg. The duration is the whole minutes since the start, kept within the
 * server's 5 to 360.
 * @param {WorkoutSession} session
 * @param {number} now
 */
export const toWorkoutSave = (session, now) => ({
  id: session.clientId,
  date: session.date,
  focus: session.title,
  duration: clamp(
    Math.round((now - session.startedAt) / MS_PER_MINUTE),
    MIN_DURATION_MINUTES,
    MAX_DURATION_MINUTES
  ),
  notes: "",
  exerciseSets: session.exercises
    .filter((exercise) => exercise.sets.length)
    .map((exercise) => ({
      name: exercise.name,
      sets: exercise.sets.map((set) => ({
        reps: exercise.kind === "seconds" ? null : set.amount,
        seconds: exercise.kind === "seconds" ? set.amount : null,
        loadKg: set.loadKg,
        rpe: set.rpe
      }))
    })),
  planId: session.planId,
  planDayIndex: session.planDayIndex
});

/**
 * When `session` started, as the clock reads it in the visitor's locale, for
 * "started 18:05".
 * @param {{ startedAt: number }} session
 */
export const startedAtText = (session) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(
    session.startedAt
  );
