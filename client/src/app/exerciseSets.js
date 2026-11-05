/**
 * The Log workout form's set log (roadmap B1): exercise cards, each holding set
 * rows as typed strings, the rules for adding and removing them, the save's
 * conversion to the API's exerciseSets in kg, and the Logs line for a session.
 */
// @ts-check
import { NO_PLAN_LINK } from "./plans";
import { getLocalDateKey, toNumberOrNull } from "./units";

/**
 * One set row as typed: the reps or seconds, the load in the region's unit,
 * and the RPE, each a string.
 * @typedef {object} SetRow
 * @property {string} key
 * @property {string} amount
 * @property {string} load
 * @property {string} rpe
 */

/**
 * One exercise card: its name, whether its rows count reps or seconds, whether
 * each counts per side, the plan's targets shown as placeholders, and its rows.
 * @typedef {object} ExerciseCard
 * @property {string} key
 * @property {string} name
 * @property {"reps" | "seconds"} kind
 * @property {boolean} perSide
 * @property {{ amount: string, rpe: string } | null} targets
 * @property {SetRow[]} sets
 */

/**
 * A logged set as the API takes it: reps or seconds, and a load in kg and an
 * RPE, each a number or null.
 * @typedef {object} LoggedSet
 * @property {number | null} reps
 * @property {number | null} seconds
 * @property {number | null} loadKg
 * @property {number | null} rpe
 */

/** The most cards and rows the API takes (006_exercise_sets.sql's checks). */
export const MAX_CARDS = 18;
export const MAX_SETS = 20;

const KG_PER_LB = 0.45359237;
const MAX_LOAD_KG = 1000;

let lastKey = 0;
const nextKey = () => `set-log-${(lastKey += 1)}`;

/**
 * An empty set row, carrying `load` when one is copied from the row above.
 * @param {string} [load]
 * @returns {SetRow}
 */
const newRow = (load = "") => ({ key: nextKey(), amount: "", load, rpe: "" });

/**
 * A card with `rows` empty rows. A plan day's card passes its name, kind,
 * per-side flag and targets; "Add exercise" passes nothing.
 * @param {Partial<Pick<ExerciseCard, "name" | "kind" | "perSide" | "targets">> & { rows?: number }} [fields]
 * @returns {ExerciseCard}
 */
export const newCard = ({
  name = "",
  kind = "reps",
  perSide = false,
  targets = null,
  rows = 1
} = {}) => ({
  key: nextKey(),
  name,
  kind,
  perSide,
  targets,
  sets: Array.from({ length: Math.min(rows, MAX_SETS) }, () => newRow())
});

/**
 * The Log workout form as it opens: dated today, one empty exercise card, and
 * no plan-day link. App starts with it, and submitWorkout resets to it.
 */
export const newWorkoutForm = () => ({
  date: getLocalDateKey(),
  focus: "",
  duration: "",
  exerciseSets: [newCard()],
  notes: "",
  ...NO_PLAN_LINK
});

/**
 * `cards` with an empty card added, up to MAX_CARDS.
 * @param {ExerciseCard[]} cards
 */
export const addCard = (cards) => (cards.length >= MAX_CARDS ? cards : [...cards, newCard()]);

/**
 * `cards` without the card at `cardKey`.
 * @param {ExerciseCard[]} cards
 * @param {string} cardKey
 */
export const removeCard = (cards, cardKey) => cards.filter((card) => card.key !== cardKey);

/**
 * `cards` with `patch` merged into the card at `cardKey`.
 * @param {ExerciseCard[]} cards
 * @param {string} cardKey
 * @param {Partial<ExerciseCard>} patch
 */
export const updateCard = (cards, cardKey, patch) =>
  cards.map((card) => (card.key === cardKey ? { ...card, ...patch } : card));

/**
 * `cards` with a row added to the card at `cardKey`, up to MAX_SETS. The new
 * row copies the load of the row above it, since sets of a lift usually share
 * one, and nothing else.
 * @param {ExerciseCard[]} cards
 * @param {string} cardKey
 */
export const addSet = (cards, cardKey) =>
  cards.map((card) =>
    card.key !== cardKey || card.sets.length >= MAX_SETS
      ? card
      : { ...card, sets: [...card.sets, newRow(card.sets.at(-1)?.load ?? "")] }
  );

/**
 * `cards` without the row at `rowKey` in the card at `cardKey`.
 * @param {ExerciseCard[]} cards
 * @param {string} cardKey
 * @param {string} rowKey
 */
export const removeSet = (cards, cardKey, rowKey) =>
  cards.map((card) =>
    card.key === cardKey ? { ...card, sets: card.sets.filter((row) => row.key !== rowKey) } : card
  );

/**
 * `cards` with `patch` merged into the row at `rowKey`.
 * @param {ExerciseCard[]} cards
 * @param {string} cardKey
 * @param {string} rowKey
 * @param {Partial<SetRow>} patch
 */
export const updateSet = (cards, cardKey, rowKey, patch) =>
  cards.map((card) =>
    card.key === cardKey
      ? { ...card, sets: card.sets.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)) }
      : card
  );

/** @param {number} value */
const toTwoDecimals = (value) => Math.round(value * 100) / 100;

/** @param {number} value */
const toOneDecimalText = (value) => String(Math.round(value * 10) / 10);

/**
 * A typed load in kg to two decimals, from pounds under an imperial region, or
 * null when nothing usable was typed. A 0 load is bodyweight work, and kept.
 * @param {unknown} typed
 * @param {"metric" | "imperial"} system
 */
export const toLoadKg = (typed, system) => {
  const value = toNumberOrNull(typed);
  if (value === null) return null;
  return toTwoDecimals(system === "imperial" ? value * KG_PER_LB : value);
};

/**
 * A stored load in kg as the region shows it, to one decimal, or "" for none.
 * @param {number | null | undefined} kg
 * @param {"metric" | "imperial"} system
 */
export const fromLoadKg = (kg, system) => {
  const value = toNumberOrNull(kg);
  if (value === null) return "";
  return toOneDecimalText(system === "imperial" ? value / KG_PER_LB : value);
};

/**
 * A whole number within [min, max], or undefined when `value` is not one.
 * @param {number | null} value
 * @param {number} min
 * @param {number} max
 */
const wholeWithin = (value, min, max) =>
  value !== null && Number.isInteger(value) && value >= min && value <= max ? value : undefined;

// One typed row as a logged set, or the message that stops the save, or null
// for a row left wholly blank.
/**
 * @param {SetRow} row
 * @param {"reps" | "seconds"} kind
 * @param {"metric" | "imperial"} system
 * @returns {{ set?: LoggedSet, error?: string } | null}
 */
const readRow = (row, kind, system) => {
  const amount = toNumberOrNull(row.amount.trim());
  const loadKg = toLoadKg(row.load.trim(), system);
  const rpe = toNumberOrNull(row.rpe.trim());
  if (amount === null && loadKg === null && rpe === null) return null;
  if (amount === null) return { error: "Enter reps or seconds" };
  const counted = kind === "seconds" ? wholeWithin(amount, 1, 3600) : wholeWithin(amount, 0, 200);
  if (counted === undefined) {
    return {
      error:
        kind === "seconds"
          ? "Seconds are a whole number from 1 to 3600"
          : "Reps are a whole number from 0 to 200"
    };
  }
  if (loadKg !== null && (loadKg < 0 || loadKg > MAX_LOAD_KG)) {
    const limit = system === "imperial" ? "2204 lb" : "1000 kg";
    return { error: `Load is from 0 to ${limit}` };
  }
  if (rpe !== null && (rpe < 1 || rpe > 10)) return { error: "RPE is from 1 to 10" };
  return {
    set: {
      reps: kind === "seconds" ? null : counted,
      seconds: kind === "seconds" ? counted : null,
      loadKg,
      rpe
    }
  };
};

/**
 * The cards as the API's exerciseSets, loads in kg, and the messages that stop
 * the save: a row's under `${cardKey}:${rowKey}`, a card's under its key.
 * A blank row is dropped, a named card with no filled rows logs its name, and
 * a card wholly blank is dropped. A placeholder target is never a value.
 * @param {ExerciseCard[]} cards
 * @param {"metric" | "imperial"} system
 */
export const toExerciseSets = (cards, system) => {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {{ name: string, sets: LoggedSet[] }[]} */
  const exerciseSets = [];
  for (const card of cards) {
    /** @type {LoggedSet[]} */
    const sets = [];
    for (const row of card.sets) {
      const read = readRow(row, card.kind, system);
      if (read?.error) errors[`${card.key}:${row.key}`] = read.error;
      else if (read?.set) sets.push(read.set);
    }
    const name = card.name.trim();
    if (!name && sets.length) errors[card.key] = "Name this exercise";
    else if (name) exerciseSets.push({ name, sets });
  }
  return { exerciseSets, errors };
};

/**
 * The span of `values`, one value when they all agree: "22.5" or "100-105".
 * @param {string[]} values
 */
const spanOf = (values) =>
  values[0] === values.at(-1) && values.every((value) => value === values[0])
    ? values[0]
    : `${values[0]}-${values.at(-1)}`;

/**
 * One exercise's line in Logs: "Dumbbell bench press: 10, 9, 8 reps | 22.5 kg
 * | RPE 7-9", the load in the region's unit, and each span collapsed when
 * every set shares it. A name with no sets is the name alone.
 * @param {{ name: string, sets: LoggedSet[] }} exercise
 * @param {"metric" | "imperial"} system
 */
export const formatExerciseLine = (exercise, system) => {
  if (!exercise.sets.length) return exercise.name;
  const holds = exercise.sets.every((set) => set.seconds !== null);
  const amounts = exercise.sets.map((set) => String(holds ? set.seconds : set.reps));
  const parts = [`${amounts.join(", ")} ${holds ? "seconds" : "reps"}`];
  const loads = exercise.sets
    .map((set) => toNumberOrNull(set.loadKg))
    .filter((kg) => kg !== null)
    .sort((a, b) => a - b)
    .map((kg) => fromLoadKg(kg, system));
  if (loads.length) parts.push(`${spanOf(loads)} ${system === "imperial" ? "lb" : "kg"}`);
  const rpes = exercise.sets
    .map((set) => toNumberOrNull(set.rpe))
    .filter((rpe) => rpe !== null)
    .sort((a, b) => a - b)
    .map(String);
  if (rpes.length) parts.push(`RPE ${spanOf(rpes)}`);
  return `${exercise.name}: ${parts.join(" | ")}`;
};
