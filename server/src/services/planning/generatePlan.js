/**
 * The rule-based plan generator: turns the planner's answers, the health screen
 * and the profile's age into a week of training, written in the plan text format
 * every reader parses (docs/specs/2026-11-03-rule-based-plans-design.md, "The generator").
 */
// @ts-check

import { buildInjuryText, detectInjuryAreas } from "./injuryRules.js";
import { EXERCISES, LEVELS, capabilitiesFor } from "./exerciseLibrary.js";

/** @typedef {import("./exerciseLibrary.js").Exercise} Exercise */

/**
 * The planner's answers, already defaulted by the route, with the health
 * screen's answers and the profile's age when there is one.
 * @typedef {object} PlanInput
 * @property {string} goal
 * @property {string} environment
 * @property {string[]} equipment
 * @property {string} level
 * @property {number} days
 * @property {number} duration
 * @property {string} injuries
 * @property {string[]} focuses
 * @property {{ condition?: boolean, symptoms?: boolean, supervised?: boolean, pregnant?: boolean }} [health]
 * @property {number | null} [age]
 */

/**
 * One exercise as a day holds it: the entry used, and, when it stands in for a
 * modified one, the area and the cue.
 * @typedef {object} ChosenExercise
 * @property {string} id
 * @property {string} name
 * @property {string} pattern
 * @property {string[]} needs
 * @property {boolean} regressed
 * @property {string} [area]
 * @property {string} [cue]
 */

/**
 * One day of the week as the gate checks it. `type` is null on a rest day.
 * @typedef {object} PlanDay
 * @property {string} weekday
 * @property {string | null} type
 * @property {string} title
 * @property {ChosenExercise[]} exercises
 * @property {string[]} skipped the patterns a slot found nothing for
 * @property {boolean} supersets
 * @property {ChosenExercise | null} finisher
 * @property {boolean} hard
 * @property {number} walkMinutes
 * @property {number} aerobicMinutes moderate-equivalent minutes the day counts for
 * @property {string[]} lines
 * @property {Prescription[]} prescriptions one per line of sets to log, in line order
 */

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Step 2: the training weekdays, by the days asked, as indexes into WEEKDAYS.
/** @type {Record<number, number[]>} */
const TRAINING_WEEKDAYS = {
  1: [2],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6]
};

// Step 3: each training day's type, by track and level, for 1 to 7 days.
const SEQUENCES = {
  lean: ["FB", "FB FB", "FB FB FB", "U L U L", "U L C U L", "P PL LG P PL LG", "P PL LG P PL LG M"],
  "lean-beginner": [
    "FB",
    "FB FB",
    "FB FB FB",
    "U L U L",
    "FB C FB FB M",
    "FB C FB E FB M",
    "FB C FB E FB M E"
  ],
  "fat-loss": ["FB", "FB FB", "FB FB FB", "U L C FB", "U L C U L", "U L C U L C", "U L C U L C M"],
  "fat-loss-beginner": [
    "FB",
    "FB FB",
    "FB FB FB",
    "FB C FB C",
    "FB C FB C FB",
    "FB C FB C FB M",
    "FB C FB C FB M E"
  ],
  cardio: [
    "FB",
    "FB FB",
    "FB C FB",
    "FB C FB C",
    "FB C FB C LC",
    "FB C FB C FB LC",
    "FB C FB C FB LC M"
  ],
  mobility: [
    "FB",
    "FB FB",
    "FB M FB",
    "FB M FB M",
    "FB M FB M M",
    "FB M FB M FB M",
    "FB M FB M FB M M"
  ],
  recovery: [
    "FB",
    "FB FB",
    "FB E FB",
    "FB E FB M",
    "FB E FB M E",
    "FB E FB M FB E",
    "FB E FB M FB E M"
  ]
};

// Step 3: a Mobility or Recovery focus on 3 to 6 days. A missing cell leaves the
// sequence as it is, and its strength days end with stretches instead.
/** @type {Record<string, Record<number, string>>} */
const FOCUS_SEQUENCES = {
  lean: { 3: "FB FB M", 4: "U L FB M", 5: "U L C FB M", 6: "U L C U L M" },
  "lean-beginner": { 3: "FB FB M", 4: "U L FB M" },
  "fat-loss": { 3: "FB FB M", 4: "FB C FB M", 5: "U L C FB M", 6: "U L C U L M" },
  "fat-loss-beginner": { 3: "FB FB M", 4: "FB C FB M", 5: "FB C FB M FB" },
  cardio: { 4: "FB C FB M", 5: "FB C FB M LC", 6: "FB C FB M FB LC" }
};

const STRENGTH_TYPES = new Set(["FB", "U", "L", "P", "PL", "LG"]);

/** @type {Record<string, string>} */
const TITLES = {
  U: "Upper body",
  L: "Lower body",
  P: "Push",
  PL: "Pull",
  LG: "Legs",
  C: "Conditioning",
  LC: "Long cardio",
  E: "Easy aerobic",
  M: "Mobility"
};

// Step 4: each day type's slots, in order.
/** @type {Record<string, string[]>} */
const SLOTS = {
  FB: ["squat", "horizontal-push", "hinge", "horizontal-pull", "single-leg", "core", "arms"],
  U: ["horizontal-push", "vertical-pull", "vertical-push", "horizontal-pull", "arms", "core"],
  L: ["squat", "hinge", "single-leg", "glutes-calves", "core"],
  LG: ["squat", "hinge", "single-leg", "glutes-calves", "core"],
  P: ["horizontal-push", "vertical-push", "horizontal-push", "arms", "core"],
  PL: ["vertical-pull", "horizontal-pull", "horizontal-pull", "arms", "core"],
  C: ["conditioning", "conditioning", "core", "conditioning"],
  M: ["mobility", "mobility", "balance", "core", "mobility"]
};

// Step 4: minutes per exercise, by scheme.
/** @type {Record<string, number>} */
const PER_EXERCISE = { lean: 7, strength: 10, "fat-loss": 5, cardio: 6, mobility: 3, recovery: 3 };

// Step 6: the prescriptions, by scheme. `rir` is the reps in reserve.
/**
 * @typedef {object} Dose
 * @property {number} sets
 * @property {string} reps
 * @property {string} rest
 * @property {string} rir
 * @property {string} [note]
 */
/** @type {Record<string, { main: Dose, accessory: Dose }>} */
const SCHEMES = {
  lean: {
    main: { sets: 3, reps: "8-10", rest: "90s", rir: "2" },
    accessory: { sets: 3, reps: "10-12", rest: "60-90s", rir: "1-2" }
  },
  strength: {
    main: { sets: 3, reps: "5", rest: "150-180s", rir: "2" },
    accessory: { sets: 3, reps: "8-10", rest: "90s", rir: "1-2" }
  },
  "fat-loss": {
    main: { sets: 3, reps: "8-12", rest: "90s", rir: "2" },
    accessory: { sets: 3, reps: "12-15", rest: "45-60s", rir: "1-2" }
  },
  cardio: {
    main: { sets: 2, reps: "6-10", rest: "90s", rir: "3" },
    accessory: { sets: 2, reps: "10-12", rest: "60s", rir: "2" }
  },
  mobility: {
    main: {
      sets: 2,
      reps: "10-12",
      rest: "60s",
      rir: "3",
      note: "full range with a 3-second lowering"
    },
    accessory: {
      sets: 2,
      reps: "10-12",
      rest: "60s",
      rir: "3",
      note: "full range with a 3-second lowering"
    }
  }
};

// Step 7: the interval blocks by level, for a conditioning day and for a
// fat-loss finisher, with the minutes each takes.
/** @type {Record<string, { day: [string, number], finisher: [string, number] }>} */
const INTERVALS = {
  beginner: {
    day: ["8 x 30 seconds hard, 60 seconds easy", 12],
    finisher: ["6 x 30 seconds hard, 60 seconds easy", 9]
  },
  intermediate: {
    day: ["10 x 1 minute hard, 1 minute easy", 20],
    finisher: ["8 x 40 seconds hard, 20 seconds easy", 8]
  },
  advanced: {
    day: ["4 x 4 minutes hard, 3 minutes easy", 28],
    finisher: ["8 x 40 seconds hard, 20 seconds easy", 8]
  }
};
const EFFORT = "effort 7-9 out of 10";

// Step 7: the conditioning entries to try first for steady work and for
// intervals; one not named here comes after them, in library order.
const STEADY_ORDER = [
  "treadmill-incline-walk",
  "stationary-bike",
  "elliptical",
  "rowing-machine",
  "stair-climber",
  "pool-walking",
  "lap-swim",
  "brisk-walk",
  "march-in-place",
  "stair-climbing"
];
const INTERVAL_ORDER = [
  "assault-bike",
  "stationary-bike",
  "rowing-machine",
  "treadmill-run",
  "elliptical",
  "stair-climber",
  "lap-swim",
  "shadow-boxing",
  "mountain-climber",
  "squat-jump",
  "burpee",
  "jumping-jacks",
  "march-in-place"
];

// Step 6: doses for the patterns with their own, by entry.
const CORE_HOLDS = new Set(["forearm-plank"]);
const CORE_SIDE_HOLDS = new Set(["side-plank", "forearm-side-plank"]);
const CORE_CARRIES = new Set(["dumbbell-suitcase-carry", "kettlebell-suitcase-carry"]);
const CORE_PLAIN_REPS = new Set(["hanging-knee-raise"]);
const STRENGTH_HOLDS = new Set(["wall-sit"]);
const DYNAMIC_MOBILITY = new Set([
  "band-pass-through",
  "band-external-rotation",
  "worlds-greatest-stretch",
  "quadruped-thoracic-rotation",
  "cat-cow",
  "hip-90-90",
  "ankle-rocks",
  "seated-thoracic-rotation",
  "seated-cat-cow",
  "shoulder-rolls"
]);
const TWO_SIDED = new Set([
  "band-pass-through",
  "cat-cow",
  "seated-cat-cow",
  "shoulder-rolls",
  "childs-pose",
  "seated-forward-fold",
  "deep-squat-hold"
]);

// Step 9: the weekly aerobic target, in moderate-equivalent minutes, by track.
/** @type {Record<string, number>} */
const AEROBIC_TARGETS = { lean: 150, "fat-loss": 225, cardio: 200, mobility: 150, recovery: 150 };

const WARMUP_TEXT =
  "easy cardio to raise your temperature, then arm circles, hip circles and leg swings.";

/** @param {unknown} value */
const lower = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/** @param {number} minutes */
const floorTo5 = (minutes) => Math.floor(minutes / 5) * 5;

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * The goal's track: fat loss, cardio, mobility, recovery or lean strength, by
 * its words, so each planner option and free text alike map to one.
 * @param {string} goal
 */
const trackOf = (goal) => {
  const text = lower(goal);
  if (/\b(fat|loss)\b/.test(text)) return "fat-loss";
  if (/\b(cardio|endurance|run|runs|running)\b/.test(text)) return "cardio";
  if (/\bmobility\b/.test(text)) return "mobility";
  if (/\brecovery\b/.test(text)) return "recovery";
  return "lean";
};

/**
 * Step 1: the input as the rules read it.
 * @param {PlanInput} plan
 */
export const readInput = (plan) => {
  const track = trackOf(plan.goal);
  const focuses = (Array.isArray(plan.focuses) ? plan.focuses : []).map(lower);
  const level = LEVELS.includes(lower(plan.level)) ? lower(plan.level) : "intermediate";
  const health = plan.health || {};
  const pregnant = health.pregnant === true;
  const lightMode =
    health.condition === true || health.symptoms === true || health.supervised === true || pregnant;
  const injuryText = buildInjuryText(plan.injuries, "");
  const areas = [...detectInjuryAreas(injuryText), ...(pregnant ? ["pregnancy"] : [])];
  return {
    track,
    strengthFocus: track === "lean" && focuses.includes("strength"),
    mobilityFocus: focuses.includes("mobility") || focuses.includes("recovery"),
    level,
    days: clamp(Math.round(Number(plan.days) || 3), 1, 7),
    minutes: clamp(Math.round(Number(plan.duration) || 45), 15, 180),
    areas,
    injuryText,
    capabilities: capabilitiesFor({ environment: plan.environment, equipment: plan.equipment }),
    lightMode,
    olderAdult: typeof plan.age === "number" && plan.age >= 65
  };
};

/** @typedef {ReturnType<typeof readInput>} Rules */

/**
 * The scheme a strength day's prescription comes from: the strength focus only
 * for a non-beginner outside light-to-moderate mode, lean strength otherwise.
 * @param {Rules} rules
 */
const schemeOf = (rules) => {
  if (rules.track === "mobility" || rules.track === "recovery") return "mobility";
  if (rules.strengthFocus && rules.level !== "beginner" && !rules.lightMode) return "strength";
  return rules.track;
};

/**
 * Step 3: the training days' types.
 * @param {Rules} rules
 */
const dayTypesOf = (rules) => {
  const beginnerKey = `${rules.track}-beginner`;
  const key = rules.level === "beginner" && beginnerKey in SEQUENCES ? beginnerKey : rules.track;
  const base = SEQUENCES[/** @type {keyof typeof SEQUENCES} */ (key)][rules.days - 1];
  const focused = rules.mobilityFocus ? FOCUS_SEQUENCES[key]?.[rules.days] : undefined;
  // Where the focus table leaves a sequence as it is, its strength days end
  // with stretches instead. The mobility and recovery tracks already do.
  const stretchesOnly = rules.mobilityFocus && !focused && key in FOCUS_SEQUENCES;
  return { types: (focused ?? base).split(" "), stretchesOnly };
};

/**
 * Step 5's candidates: every entry of `pattern` that fits the rules, in priority
 * order (the ids in `order` first), with a modify entry replaced by its
 * regression where that fits and is untagged. The one rule both for choosing a
 * plan's exercises and for the alternatives a swap offers (roadmap C4).
 * @param {string} pattern
 * @param {Rules} rules
 * @param {Exercise[]} library
 * @param {string[]} [order] ids to try first
 * @returns {ChosenExercise[]}
 */
export const candidatesFor = (pattern, rules, library, order) => {
  const byId = new Map(library.map((entry) => [entry.id, entry]));
  const rank = LEVELS.indexOf(rules.level);
  const lowImpactOnly = rules.areas.some((area) => ["knee", "hip", "pregnancy"].includes(area));
  /** @param {Exercise} entry */
  const fits = (entry) =>
    entry.needs.every((need) => rules.capabilities.includes(need)) &&
    LEVELS.indexOf(entry.level) <= rank &&
    !(lowImpactOnly && entry.impact === "high");
  /** @param {Exercise} entry */
  const untouched = (entry) => rules.areas.every((area) => !entry.flags[area]);

  /** @type {ChosenExercise[]} */
  const candidates = [];
  const entries = library.filter((entry) => entry.pattern === pattern);
  if (order) {
    entries.sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
    });
  }
  for (const entry of entries) {
    if (!fits(entry)) continue;
    if (rules.areas.some((area) => entry.flags[area] === "avoid")) continue;
    const area = rules.areas.find((candidate) => entry.flags[candidate] === "modify");
    if (!area) {
      candidates.push({
        id: entry.id,
        name: entry.name,
        pattern,
        needs: entry.needs,
        regressed: false
      });
      continue;
    }
    const regression = byId.get(entry.regressions[area]?.id ?? "");
    if (!regression || !fits(regression) || !untouched(regression)) continue;
    candidates.push({
      id: regression.id,
      name: regression.name,
      pattern,
      needs: regression.needs,
      regressed: true,
      area,
      cue: entry.regressions[area].cue
    });
  }
  return candidates;
};

/**
 * Step 5: the first candidate of `pattern` not in `used`, else the first. Null
 * when nothing fits.
 * @param {string} pattern
 * @param {Rules} rules
 * @param {Exercise[]} library
 * @param {Set<string>} used
 * @param {string[]} [order] ids to try first
 * @returns {ChosenExercise | null}
 */
const choose = (pattern, rules, library, used, order) => {
  const candidates = candidatesFor(pattern, rules, library, order);
  return candidates.find((candidate) => !used.has(candidate.id)) ?? candidates[0] ?? null;
};

/** @param {string} rir */
const effortCue = (rir) => `stop ${rir} reps short of failure`;

/**
 * One exercise's dose as numbers: its sets; an amount, a count ("5") or a
 * range ("8-12"), of reps, seconds or steps; whether it is a side; the reps in
 * reserve it targets, or null where the line gives none; the rest its note
 * names, in seconds at the top of its range, or null where it names none; and
 * the note the line writes in brackets after it, or null.
 * @typedef {object} LineDose
 * @property {number} sets
 * @property {string} amount
 * @property {"reps" | "seconds" | "steps"} unit
 * @property {boolean} perSide
 * @property {string | null} rir
 * @property {number | null} restSeconds
 * @property {string | null} note
 */

/**
 * What a strength-day line prescribes, for pre-filling the sets it logs (roadmap
 * B1). Steps count as reps. `targetRpe` is 10 minus the reps in reserve.
 * @typedef {object} Prescription
 * @property {string} name
 * @property {number} sets
 * @property {{ min: number, max: number } | null} reps
 * @property {{ min: number, max: number } | null} seconds
 * @property {boolean} perSide
 * @property {{ min: number, max: number } | null} targetRpe
 * @property {number | null} restSeconds the rest after each set, for the in-gym
 *   timer (roadmap B6), or null where the line names none
 * @property {string} exerciseId the library entry it prescribes (roadmap C4)
 * @property {"main" | "accessory" | null} role its slot's role, which a swap doses
 *   the new exercise in; null for the patterns dosed by their own rules
 */

// The patterns doseFor doses by their own rules, whatever the slot's role.
const OWN_DOSE_PATTERNS = new Set(["core", "balance", "mobility"]);

/**
 * @param {number} sets
 * @param {string} amount
 * @param {"reps" | "seconds" | "steps"} unit
 * @param {boolean} [perSide]
 * @returns {LineDose}
 */
const plainDose = (sets, amount, unit, perSide = false) => ({
  sets,
  amount,
  unit,
  perSide,
  rir: null,
  restSeconds: null,
  note: null
});

/**
 * Step 6: the dose for one exercise on a strength day: core, balance and
 * mobility by their own rules, the rest by the scheme.
 * @param {ChosenExercise} exercise
 * @param {"main" | "accessory"} role
 * @param {Rules} rules
 * @returns {LineDose}
 */
const doseFor = (exercise, role, rules) => {
  const beginner = rules.level === "beginner";
  if (exercise.pattern === "core") {
    if (CORE_HOLDS.has(exercise.id)) return plainDose(3, beginner ? "10" : "20-30", "seconds");
    if (CORE_SIDE_HOLDS.has(exercise.id)) {
      return plainDose(3, beginner ? "10" : "20-30", "seconds", true);
    }
    if (CORE_CARRIES.has(exercise.id)) return plainDose(3, "30", "seconds", true);
    return plainDose(beginner ? 2 : 3, "8-12", "reps", !CORE_PLAIN_REPS.has(exercise.id));
  }
  if (exercise.pattern === "balance") {
    if (exercise.id === "heel-to-toe-walk") return plainDose(3, "10", "steps");
    if (exercise.id === "paused-step-up") return plainDose(2, "6", "reps", true);
    return plainDose(3, "20-30", "seconds", true);
  }
  if (exercise.pattern === "mobility") {
    const perSide = !TWO_SIDED.has(exercise.id);
    if (DYNAMIC_MOBILITY.has(exercise.id)) return plainDose(2, "8-10", "reps", perSide);
    return plainDose(2, rules.olderAdult ? "45" : "30", "seconds", perSide);
  }
  const scheme = SCHEMES[schemeOf(rules)];
  const asMain = role === "main" && !exercise.regressed;
  const base = asMain ? scheme.main : scheme.accessory;
  let sets = base.sets;
  let reps = base.reps;
  let rir = base.rir;
  if (beginner) {
    sets = Math.max(2, sets - 1);
    rir = "3";
    if (asMain && rules.track === "cardio") reps = "8-10";
  }
  if (asMain && rules.level === "advanced") sets += 1;
  if (asMain && rules.days === 1) sets = Math.max(3, sets + 1);
  if (rules.lightMode) rir = "3";
  const cue = exercise.cue ? `; ${exercise.area}: ${exercise.cue}` : "";
  if (STRENGTH_HOLDS.has(exercise.id)) {
    return { ...plainDose(sets, "30-45", "seconds"), restSeconds: 60, note: `Rest 60s${cue}` };
  }
  const parts = [`Rest ${base.rest}`, ...(base.note ? [base.note] : []), effortCue(rir)];
  return {
    ...plainDose(sets, reps, "reps"),
    rir,
    restSeconds: restSecondsOf(base.rest),
    note: `${parts.join(", ")}${cue}`
  };
};

/**
 * A dose as its line writes it: "3 x 8-10 (Rest 90s, …)", "3 x 20-30 seconds
 * a side", "3 x 10 steps".
 * @param {LineDose} dose
 */
const formatDose = (dose) =>
  `${dose.sets} x ${dose.amount}${dose.unit === "reps" ? "" : ` ${dose.unit}`}` +
  `${dose.perSide ? " a side" : ""}${dose.note ? ` (${dose.note})` : ""}`;

/**
 * The top of a scheme's rest in seconds: "90s" is 90, and "60-90s" is 90. Every
 * rest in SCHEMES ends in its seconds and an "s", which the plan gate checks
 * against each line.
 * @param {string} rest
 */
const restSecondsOf = (rest) => Number(/(\d+)s$/.exec(rest)?.[1]);

/**
 * "8-12" as { min: 8, max: 12 }, and "5" as { min: 5, max: 5 }.
 * @param {string} text
 */
const rangeOf = (text) => {
  const [min, max = min] = text.split("-").map(Number);
  return { min, max };
};

/**
 * The prescription for `exercise` at `dose`, in a slot of `role`.
 * @param {ChosenExercise} exercise
 * @param {LineDose} dose
 * @param {"main" | "accessory"} role
 * @returns {Prescription}
 */
const prescriptionOf = (exercise, dose, role) => {
  const amount = rangeOf(dose.amount);
  const rir = dose.rir === null ? null : rangeOf(dose.rir);
  return {
    name: exercise.name,
    sets: dose.sets,
    reps: dose.unit === "seconds" ? null : amount,
    seconds: dose.unit === "seconds" ? amount : null,
    perSide: dose.perSide,
    targetRpe: rir && { min: 10 - rir.max, max: 10 - rir.min },
    restSeconds: dose.restSeconds,
    exerciseId: exercise.id,
    role: OWN_DOSE_PATTERNS.has(exercise.pattern) ? null : role
  };
};

/**
 * @param {ChosenExercise} exercise
 * @param {string} dose
 * @param {string} [label] the superset label
 */
const exerciseLine = (exercise, dose, label) =>
  `- ${label ? `${label}. ` : ""}${exercise.name}: ${dose}`;

/**
 * `exercise`'s prescription in a slot of `role`, and the line that writes it
 * with any superset `label`, both from one dose, as a plan day writes them. A
 * swap (roadmap C4) writes its new exercise with it too.
 * @param {ChosenExercise} exercise
 * @param {"main" | "accessory"} role
 * @param {Rules} rules
 * @param {string} [label]
 * @returns {{ prescription: Prescription, line: string }}
 */
export const prescribe = (exercise, role, rules, label) => {
  const dose = doseFor(exercise, role, rules);
  return {
    prescription: prescriptionOf(exercise, dose, role),
    line: exerciseLine(exercise, formatDose(dose), label)
  };
};

/** @param {number} minutes */
const warmupMinutesOf = (minutes) => (minutes <= 20 ? 3 : minutes < 45 ? 5 : 8);

/**
 * Fills `count` exercises from the day type's slot list, repeated past its end;
 * a slot nothing fits is recorded and the next slot takes its place.
 * @param {string[]} slots
 * @param {number} count
 * @param {Rules} rules
 * @param {Exercise[]} library
 * @param {Set<string>} used
 * @param {ChosenExercise[]} [start]
 */
const fillSlots = (slots, count, rules, library, used, start = []) => {
  const chosen = [...start];
  /** @type {string[]} */
  const skipped = [];
  for (
    let attempt = chosen.length;
    chosen.length < count && attempt < slots.length * 2;
    attempt += 1
  ) {
    const pattern = slots[attempt % slots.length];
    const exercise = choose(pattern, rules, library, used);
    if (!exercise) {
      if (!skipped.includes(pattern)) skipped.push(pattern);
      continue;
    }
    used.add(exercise.id);
    chosen.push(exercise);
  }
  return { chosen, skipped };
};

/**
 * The stretches that close a strength day under a Mobility or Recovery focus or
 * on the mobility and recovery tracks.
 * @param {Rules} rules
 * @param {Exercise[]} library
 * @param {Set<string>} used
 */
const closingStretches = (rules, library, used) => {
  /** @type {ChosenExercise[]} */
  const stretches = [];
  const staticOnly = library.filter(
    (entry) => entry.pattern === "mobility" && !DYNAMIC_MOBILITY.has(entry.id)
  );
  for (let i = 0; i < 2; i += 1) {
    const exercise = choose("mobility", rules, staticOnly, used);
    if (!exercise) break;
    used.add(exercise.id);
    stretches.push(exercise);
  }
  return stretches;
};

/**
 * Builds one training day.
 * @param {object} day
 * @param {string} day.weekday
 * @param {string} day.type
 * @param {string} day.title
 * @param {boolean} day.hard whether its conditioning is the interval kind
 * @param {boolean} day.stretches whether a strength day ends with stretches
 * @param {Rules} rules
 * @param {Exercise[]} library
 * @param {Set<string>} used
 * @returns {PlanDay}
 */
const buildTrainingDay = ({ weekday, type, title, hard, stretches }, rules, library, used) => {
  const minutes = rules.minutes;
  const warmup = type === "M" ? 3 : warmupMinutesOf(minutes);
  const beginner = rules.level === "beginner";
  /** @type {string[]} */
  const lines = [];
  /** @type {ChosenExercise | null} */
  let finisher = null;
  let aerobic = 0;
  let supersets = false;
  /** @type {ChosenExercise[]} */
  let exercises = [];
  /** @type {string[]} */
  let skipped = [];
  /** @type {Prescription[]} */
  const prescriptions = [];

  /**
   * A line whose dose is sets to log, written from the same numbers as the
   * prescription it records alongside.
   * @param {ChosenExercise} exercise
   * @param {"main" | "accessory"} role
   * @param {string} [label] the superset label
   */
  const prescribed = (exercise, role, label) => {
    const { prescription, line } = prescribe(exercise, role, rules, label);
    prescriptions.push(prescription);
    return line;
  };

  if (type === "C" || type === "LC" || type === "E") {
    const block = choose(
      "conditioning",
      rules,
      library,
      used,
      hard ? INTERVAL_ORDER : STEADY_ORDER
    );
    lines.push(`Warmup: ${warmup} minutes - start at an easy pace and build to moderate.`);
    lines.push("Main lifts:");
    if (block) {
      used.add(block.id);
      exercises.push(block);
      if (type === "C" && hard) {
        const [text, blockMinutes] = INTERVALS[rules.level].day;
        lines.push(exerciseLine(block, `${text} (${EFFORT})`));
        aerobic += blockMinutes * 2;
      } else {
        const steady =
          type === "LC"
            ? clamp(floorTo5(minutes - warmup - 5), 20, beginner ? 40 : 60)
            : type === "E"
              ? clamp(floorTo5(minutes - warmup - 10), 20, 40)
              : clamp(floorTo5(minutes - warmup - 10), 10, beginner ? 20 : 30);
        const pace = type === "E" ? "an easy pace" : "a steady pace";
        lines.push(exerciseLine(block, `${steady} minutes at ${pace} you can talk at`));
        aerobic += steady;
      }
    }
    const extraSlots = type === "C" ? SLOTS.C.slice(1) : ["mobility", "mobility", "mobility"];
    const extraCount =
      type === "C" ? clamp(Math.floor((minutes - warmup - 25) / 5), 2, 4) : type === "LC" ? 2 : 3;
    const filled = fillSlots(extraSlots, extraCount, rules, library, used);
    skipped = filled.skipped;
    if (filled.chosen.length) {
      lines.push("Accessories:");
      for (const exercise of filled.chosen) {
        lines.push(
          exercise.pattern === "conditioning"
            ? exerciseLine(exercise, "3 rounds of 1 minute at a moderate pace, 30 seconds easy")
            : prescribed(exercise, "accessory")
        );
      }
    }
    exercises = [...exercises, ...filled.chosen];
    lines.push("Finisher/conditioning:");
    lines.push(
      type === "C"
        ? "- Easy cooldown: 5 minutes, then 2-3 stretches"
        : "- Easy breathing: 5 minutes"
    );
  } else if (type === "M") {
    const count = clamp(Math.floor((minutes - warmup - 5) / 3), 4, 8);
    const filled = fillSlots(SLOTS.M, count, rules, library, used);
    exercises = filled.chosen;
    skipped = filled.skipped;
    lines.push(`Warmup: ${warmup} minutes - easy marching and slow breathing.`);
    lines.push("Main lifts:");
    exercises.slice(0, 2).forEach((exercise) => lines.push(prescribed(exercise, "main")));
    lines.push("Accessories:");
    exercises.slice(2).forEach((exercise) => lines.push(prescribed(exercise, "accessory")));
    lines.push("Finisher/conditioning:");
    lines.push("- Easy breathing: 5 minutes");
  } else {
    const scheme = schemeOf(rules);
    const slots = SLOTS[type];
    const first = fillSlots(slots, 1, rules, library, used);
    const lead = first.chosen[0];
    const rampCount =
      lead && lead.needs.length ? ({ strength: 3, lean: 2, "fat-loss": 1 }[scheme] ?? 0) : 0;
    const cardioBlock =
      rules.track === "cardio" ? Math.min(beginner ? 15 : 20, floorTo5((minutes - warmup) / 2)) : 0;
    const finisherMinutes =
      rules.track === "cardio" || minutes <= 20 ? 0 : rules.track === "fat-loss" ? 10 : 5;
    const budget = minutes - warmup - rampCount - finisherMinutes - cardioBlock;
    const perExercise = PER_EXERCISE[scheme];
    const floorCount = type === "FB" ? 4 : 3;
    const count = clamp(Math.floor(budget / perExercise), floorCount, 8);
    supersets = count * perExercise > budget;
    const filled = fillSlots(slots, count, rules, library, used, first.chosen);
    exercises = filled.chosen;
    skipped = [...first.skipped, ...filled.skipped.filter((p) => !first.skipped.includes(p))];
    if (rules.olderAdult && (type === "FB" || type === "L" || type === "LG")) {
      if (!exercises.some((exercise) => exercise.pattern === "balance")) {
        const balance = choose("balance", rules, library, used);
        if (balance) {
          used.add(balance.id);
          exercises.push(balance);
        }
      }
    }

    lines.push(`Warmup: ${warmup} minutes - ${WARMUP_TEXT}`);
    if (rampCount && lead) {
      const ramps = [
        "x 8 at about half your working weight",
        "x 4 at about 70%",
        "x 1-2 at about 85-90%"
      ];
      lines.push(`- Ramp-up: ${lead.name} ${ramps.slice(0, rampCount).join(", ")}.`);
    }
    if (cardioBlock) {
      const cardio = choose("conditioning", rules, library, used, STEADY_ORDER);
      if (cardio) {
        used.add(cardio.id);
        lines.push("Cardio block:");
        lines.push(exerciseLine(cardio, `${cardioBlock} minutes at a steady pace you can talk at`));
        aerobic += cardioBlock;
      }
    }
    const label = (/** @type {number} */ index) =>
      supersets
        ? `${String.fromCharCode(65 + Math.floor(index / 2))}${(index % 2) + 1}`
        : undefined;
    lines.push("Main lifts:");
    exercises
      .slice(0, 2)
      .forEach((exercise, index) => lines.push(prescribed(exercise, "main", label(index))));
    if (exercises.length > 2) {
      lines.push("Accessories:");
      exercises
        .slice(2)
        .forEach((exercise, index) =>
          lines.push(prescribed(exercise, "accessory", label(index + 2)))
        );
    }

    const closing = [];
    if (stretches || scheme === "mobility") closing.push(...closingStretches(rules, library, used));
    if (finisherMinutes || closing.length) lines.push("Finisher/conditioning:");
    if (finisherMinutes && scheme !== "mobility") {
      finisher = choose("conditioning", rules, library, used, hard ? INTERVAL_ORDER : STEADY_ORDER);
      if (finisher) {
        if (hard) {
          const [text, blockMinutes] = INTERVALS[rules.level].finisher;
          lines.push(exerciseLine(finisher, `${text} (${EFFORT})`));
          aerobic += blockMinutes * 2;
        } else {
          lines.push(
            exerciseLine(finisher, `${finisherMinutes} minutes at a steady pace you can talk at`)
          );
          aerobic += finisherMinutes;
        }
      }
    } else if (finisherMinutes && scheme === "mobility") {
      lines.push(`- Easy breathing: ${finisherMinutes} minutes`);
    }
    closing.forEach((exercise) => lines.push(prescribed(exercise, "accessory")));
  }

  return {
    weekday,
    type,
    title,
    exercises,
    skipped,
    supersets,
    finisher,
    hard,
    walkMinutes: 0,
    aerobicMinutes: aerobic,
    lines,
    prescriptions
  };
};

/**
 * Step 7: which days' conditioning is the interval kind. Conditioning days come
 * first, then fat-loss finishers in turn, within the level's weekly cap and
 * never on consecutive days, the week wrapping round; none in light-to-moderate
 * mode.
 * @param {(string | null)[]} weekTypes the type of each weekday, null for rest
 * @param {Rules} rules
 */
const hardDaysOf = (weekTypes, rules) => {
  /** @type {boolean[]} */
  const hard = weekTypes.map(() => false);
  if (rules.lightMode) return hard;
  const cap = rules.level === "beginner" ? 2 : 3;
  let count = 0;
  /** @param {number} index */
  const free = (index) => !hard[(index + 6) % 7] && !hard[(index + 1) % 7];
  weekTypes.forEach((type, index) => {
    if (type === "C" && count < cap && free(index)) {
      hard[index] = true;
      count += 1;
    }
  });
  if (rules.track === "fat-loss" && rules.minutes > 20) {
    let turn = 0;
    weekTypes.forEach((type, index) => {
      if (!type || !STRENGTH_TYPES.has(type)) return;
      const wantsIntervals = turn % 2 === 0;
      turn += 1;
      if (wantsIntervals && count < cap && free(index)) {
        hard[index] = true;
        count += 1;
      }
    });
  }
  return hard;
};

/**
 * Builds the week's plan text, without its notes, and its structure. `library`
 * stands in for the curated one in tests.
 * @param {PlanInput} plan
 * @param {Exercise[]} [library]
 */
export const generatePlan = (plan, library = EXERCISES) => {
  const rules = readInput(plan);
  const { types, stretchesOnly } = dayTypesOf(rules);
  const trainingIndexes = TRAINING_WEEKDAYS[rules.days];
  /** @type {(string | null)[]} */
  const weekTypes = WEEKDAYS.map((_weekday, index) => {
    const position = trainingIndexes.indexOf(index);
    return position < 0 ? null : types[position];
  });
  const hard = hardDaysOf(weekTypes, rules);
  const used = new Set();
  let fullBody = 0;

  /** @type {PlanDay[]} */
  const week = WEEKDAYS.map((weekday, index) => {
    const type = weekTypes[index];
    if (!type) {
      return {
        weekday,
        type: null,
        title: weekday,
        exercises: [],
        skipped: [],
        supersets: false,
        finisher: null,
        hard: false,
        walkMinutes: 0,
        aerobicMinutes: 0,
        lines: [],
        prescriptions: []
      };
    }
    const title = type === "FB" ? `Full body ${fullBody++ % 2 === 0 ? "A" : "B"}` : TITLES[type];
    return buildTrainingDay(
      {
        weekday,
        type,
        title,
        hard: hard[index],
        stretches: stretchesOnly && STRENGTH_TYPES.has(type)
      },
      rules,
      library,
      used
    );
  });

  // Step 9: walks on rest days close the gap to the track's weekly target.
  const target = AEROBIC_TARGETS[rules.track];
  const counted = week.reduce((sum, day) => sum + day.aerobicMinutes, 0);
  const restDays = week.filter((day) => !day.type);
  const gap = target - counted;
  if (gap > 0 && restDays.length) {
    const fewer = restDays.length - 1;
    const walkers = fewer >= 1 && Math.ceil(gap / fewer / 5) * 5 <= 60 ? fewer : restDays.length;
    const walk = clamp(Math.ceil(gap / walkers / 5) * 5, 20, 60);
    restDays.slice(0, walkers).forEach((day) => {
      day.walkMinutes = walk;
      day.aerobicMinutes = walk;
    });
  }
  for (const day of restDays) {
    day.lines = [
      day.walkMinutes
        ? `Rest day. Brisk walk ${day.walkMinutes} minutes: you can talk but not sing (about 100 steps a minute).`
        : "Rest day. Optional: a 20-minute easy walk."
    ];
  }

  const text = week
    .map((day) =>
      [day.type ? `${day.weekday} - ${day.title}` : day.weekday, ...day.lines].join("\n")
    )
    .join("\n\n");
  return {
    text,
    week,
    rules,
    aerobicTarget: target,
    aerobicMinutes: week.reduce((sum, day) => sum + day.aerobicMinutes, 0)
  };
};
