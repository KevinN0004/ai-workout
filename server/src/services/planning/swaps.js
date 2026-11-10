/**
 * Exercise swaps (roadmap C4, docs/specs/2026-11-08-exercise-swaps-design.md): a
 * saved plan's alternatives to one exercise under the rules it was built with,
 * a swap on every day the exercise is on, and the undo. Pure; the routes store.
 */
// @ts-check

import { EXERCISES } from "./exerciseLibrary.js";
import { healthFromNotes } from "./fallbackNotes.js";
import { candidatesFor, prescribe, readInput } from "./generatePlan.js";
import { INJURY_AREAS } from "./injuryRules.js";

/** @typedef {import("./exerciseLibrary.js").Exercise} Exercise */
/** @typedef {import("./generatePlan.js").ChosenExercise} ChosenExercise */
/** @typedef {ReturnType<typeof readInput>} Rules */
/** @typedef {import("../dashboard/planPayloadService.js").PlanPayload} PlanPayload */
/** @typedef {import("../dashboard/planPayloadService.js").PlanDay} PlanDay */
/** @typedef {import("../dashboard/planPayloadService.js").Prescription} Prescription */

/**
 * A plan as mapGeneratedPlan returns it, with the fields a swap reads: its text
 * columns always strings and its lists always arrays, while `days` and
 * `duration` are null on a row that has none.
 * @typedef {object} SavedPlan
 * @property {string} goal
 * @property {string[]} equipment
 * @property {string} environment
 * @property {string} level
 * @property {string} injuries
 * @property {number | null} days
 * @property {number | null} duration
 * @property {string[]} focuses
 * @property {string} plan the plan's text
 * @property {PlanPayload | null} payload
 */

/**
 * One alternative a swap offers. `area` and `cue` are set for a regression.
 * @typedef {object} SwapOption
 * @property {string} name
 * @property {string[]} needs
 * @property {boolean} regressed
 * @property {string | null} area
 * @property {string | null} cue
 */

/** The swapped plan's payload and text, as the routes store them. @typedef {{ payload: PlanPayload, planText: string }} SwapResult */

/** The areas a swap can name: the injury areas, never pregnancy. */
export const SWAP_AREAS = INJURY_AREAS;

const RAMP_PREFIX = "- Ramp-up: ";
// A prescription's line: "- " and any superset label, then the name and ": ".
const PRESCRIBED_LINE = /^- (?:([A-Z]\d)\. )?(.+?): /;

/**
 * The rules `plan` was built under, read by readInput from its saved columns and
 * the health answers its safety notes imply (healthFromNotes), with `age` from
 * the profile and `area` added when it is given and not already there. Missing
 * days and minutes default as the generate route defaults them.
 * @param {SavedPlan} plan
 * @param {{ age: number | null, area: string | null }} options
 * @returns {Rules}
 */
export const rulesForPlan = (plan, { age, area }) => {
  const rules = readInput({
    goal: plan.goal,
    environment: plan.environment,
    equipment: plan.equipment,
    level: plan.level,
    days: plan.days ?? 3,
    duration: plan.duration ?? 45,
    injuries: plan.injuries,
    focuses: plan.focuses,
    health: healthFromNotes(plan.payload?.notes),
    age
  });
  return area && !rules.areas.includes(area) ? { ...rules, areas: [...rules.areas, area] } : rules;
};

/**
 * The index in `lines` of the line prescribing `name`, or -1.
 * @param {string[]} lines
 * @param {string} name
 */
const lineIndexOf = (lines, name) =>
  lines.findIndex((line) => PRESCRIBED_LINE.exec(line)?.[2] === name);

/**
 * @param {string} line
 * @returns {string | undefined} the superset label, as "A1", if the line has one
 */
const labelOf = (line) => PRESCRIBED_LINE.exec(line)?.[1];

/**
 * `day`'s prescriptions, none for a day saved before plans carried them.
 * @param {PlanDay} day
 * @returns {Prescription[]}
 */
const prescriptionsOf = (day) => day.prescriptions ?? [];

/**
 * @param {PlanDay} day
 * @param {string} name
 */
const prescribes = (day, name) => prescriptionsOf(day).some((p) => p.name === name);

/**
 * `entry` as the generator hands an exercise it chose to doseFor.
 * @param {Exercise} entry
 * @returns {ChosenExercise}
 */
const chosenOf = (entry) => ({
  id: entry.id,
  name: entry.name,
  pattern: entry.pattern,
  needs: entry.needs,
  regressed: false
});

/**
 * The role `prescription` was dosed in: the one it names, or for a plan saved
 * before C4, "main" when its entry's main dose gives its sets and amounts, else
 * "accessory". A null role, for a pattern dosed by its own rules, doses as
 * either.
 * @param {Prescription} prescription
 * @param {Exercise} entry
 * @param {Rules} rules
 * @returns {"main" | "accessory"}
 */
const roleOf = (prescription, entry, rules) => {
  if (prescription.role !== undefined) return prescription.role ?? "accessory";
  const main = prescribe(chosenOf(entry), "main", rules).prescription;
  /** @type {(a: unknown, b: unknown) => boolean} */
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return main.sets === prescription.sets &&
    same(main.reps, prescription.reps) &&
    same(main.seconds, prescription.seconds)
    ? "main"
    : "accessory";
};

/**
 * The candidates `plan` can swap `name` for, as candidatesFor gives them: of its
 * pattern, without itself or anything on a day it is on, each name once. Null
 * when the plan has no payload, `name` is not one of its prescriptions, or it is
 * not a library entry.
 * @param {SavedPlan} plan
 * @param {string} name
 * @param {Rules} rules
 * @param {Exercise[]} library
 * @returns {{ entry: Exercise, candidates: ChosenExercise[] } | null}
 */
const candidatesIn = (plan, name, rules, library) => {
  const days = (plan.payload?.days ?? []).filter((day) => prescribes(day, name));
  const entry = library.find((candidate) => candidate.name === name);
  if (!days.length || !entry) return null;
  const taken = new Set(days.flatMap((day) => prescriptionsOf(day).map((p) => p.name)));
  /** @type {ChosenExercise[]} */
  const candidates = [];
  for (const candidate of candidatesFor(entry.pattern, rules, library)) {
    if (taken.has(candidate.name)) continue;
    taken.add(candidate.name);
    candidates.push(candidate);
  }
  return { entry, candidates };
};

/**
 * The alternatives to `name` in `plan` under `rules`, in priority order: the
 * candidates of its pattern, without itself or anything on a day it is on.
 * Null when `name` is not one of the plan's prescriptions, or not a library
 * entry.
 * @param {SavedPlan} plan
 * @param {string} name
 * @param {Rules} rules
 * @param {Exercise[]} [library]
 * @returns {SwapOption[] | null}
 */
export const swapOptions = (plan, name, rules, library = EXERCISES) => {
  const found = candidatesIn(plan, name, rules, library);
  return (
    found?.candidates.map(({ name: option, needs, regressed, area, cue }) => ({
      name: option,
      needs,
      regressed,
      area: area ?? null,
      cue: cue ?? null
    })) ?? null
  );
};

/**
 * `day`'s lines with the ramp-up line, if any, made to name `name`: replaced,
 * left out when `name` is null, or put back after the warm-up from `original`.
 * @param {string[]} lines
 * @param {string} from the name the day's ramp-up names now
 * @param {{ name: string | null, original: string | null, originalName: string }} ramp
 */
const withRamp = (lines, from, { name, original, originalName }) => {
  const index = lines.findIndex((line) => line.startsWith(`${RAMP_PREFIX}${from} `));
  const rest = index < 0 ? lines : [...lines.slice(0, index), ...lines.slice(index + 1)];
  if (!name || !original) return rest;
  const ramp = `${RAMP_PREFIX}${name} ${original.slice(`${RAMP_PREFIX}${originalName} `.length)}`;
  const at = index < 0 ? 1 : index;
  return [...rest.slice(0, at), ramp, ...rest.slice(at)];
};

/**
 * `text` with each day's lines replaced by the new day's, found by its title.
 * Null when a day's old lines are not the text's, which no saved plan has.
 * @param {string} text
 * @param {PlanDay[]} before
 * @param {PlanDay[]} after
 */
const rewriteText = (text, before, after) => {
  let lines = text.split("\n");
  for (const [index, day] of before.entries()) {
    const next = after[index];
    if (next === day) continue;
    const start = lines.indexOf(day.title);
    const old = lines.slice(start + 1, start + 1 + day.lines.length);
    if (start < 0 || old.join("\n") !== day.lines.join("\n")) return null;
    lines = [
      ...lines.slice(0, start + 1),
      ...next.lines,
      ...lines.slice(start + 1 + day.lines.length)
    ];
  }
  return lines.join("\n");
};

/**
 * `plan` with each of its days changed by `change`, or null when no day changes
 * or the text does not follow.
 * @param {SavedPlan} plan
 * @param {(day: PlanDay) => PlanDay} change
 * @returns {SwapResult | null}
 */
const changeDays = (plan, change) => {
  const payload = /** @type {PlanPayload} */ (plan.payload);
  const days = payload.days.map(change);
  if (days.every((day, index) => day === payload.days[index])) return null;
  const planText = rewriteText(plan.plan, payload.days, days);
  return planText === null ? null : { payload: { ...payload, days }, planText };
};

/**
 * `plan` with every prescription named `from` replaced by `to`, each at the dose
 * prescribe gives it in that prescription's own role, and each line rewritten
 * with its superset label kept. A day's ramp-up follows its lead lift: renamed,
 * or left out for a lift with no load. The first original is kept in
 * `swappedFrom`, so Undo returns to the plan as generated, and swapping back to
 * it is that original. Null when `from` is not in the plan or `to` is not one of
 * its options.
 * @param {SavedPlan} plan
 * @param {{ from: string, to: string, area: string | null }} swap
 * @param {Rules} rules
 * @param {Exercise[]} [library]
 * @returns {SwapResult | null}
 */
export const applySwap = (plan, { from, to, area }, rules, library = EXERCISES) => {
  const found = candidatesIn(plan, from, rules, library);
  const chosen = found?.candidates.find((candidate) => candidate.name === to);
  if (!found || !chosen) return null;

  return changeDays(plan, (day) => {
    if (!prescribes(day, from)) return day;
    let lines = day.lines;
    const prescriptions = prescriptionsOf(day).map((current) => {
      if (current.name !== from) return current;
      const at = lineIndexOf(lines, from);
      const original = current.swappedFrom ?? {
        prescription: current,
        line: lines[at],
        rampLine: lines.find((line) => line.startsWith(`${RAMP_PREFIX}${from} `)) ?? null
      };
      const back = original.prescription.name === to;
      const { prescription, line } = back
        ? { prescription: original.prescription, line: original.line }
        : prescribe(chosen, roleOf(current, found.entry, rules), rules, labelOf(lines[at]));
      lines = lines.map((text, index) => (index === at ? line : text));
      lines = withRamp(lines, from, {
        name: chosen.needs.length ? to : null,
        original: original.rampLine,
        originalName: original.prescription.name
      });
      return back ? prescription : { ...prescription, swappedFrom: original, swapReason: area };
    });
    return { ...day, lines, prescriptions };
  });
};

/**
 * `plan` with each prescription named `name` that was swapped put back to the
 * prescription, line and ramp-up the plan was generated with. Null when none
 * was.
 * @param {SavedPlan} plan
 * @param {string} name
 * @returns {SwapResult | null}
 */
export const undoSwap = (plan, name) => {
  if (!plan.payload) return null;
  return changeDays(plan, (day) => {
    const swapped = prescriptionsOf(day).find((p) => p.name === name && p.swappedFrom);
    if (!swapped?.swappedFrom) return day;
    const original = swapped.swappedFrom;
    const at = lineIndexOf(day.lines, name);
    const lines = withRamp(
      day.lines.map((text, index) => (index === at ? original.line : text)),
      name,
      {
        name: original.prescription.name,
        original: original.rampLine,
        originalName: original.prescription.name
      }
    );
    const prescriptions = prescriptionsOf(day).map((p) =>
      p === swapped ? original.prescription : p
    );
    return { ...day, lines, prescriptions };
  });
};
