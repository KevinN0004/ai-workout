import { describe, expect, test } from "vitest";
import { generatePlan } from "../../../server/src/services/planning/generatePlan.js";
import {
  buildFallbackNotes,
  buildSafetyNotes
} from "../../../server/src/services/planning/fallbackNotes.js";
import {
  equipmentOptionsByEnv,
  experienceOptions,
  goalOptions,
  injuryOptions
} from "../../../client/src/app/constants.js";
import { scorePlan } from "../scorePlan.mjs";

// The quality gate (docs/specs/2026-11-03-rule-based-plans-design.md, "The
// quality gate"): every plan the rule-based generator writes, across the
// planner's answers, must pass every check here. The scorer is the independent
// check on the text; the rest read the generator's structured week.

const STRENGTH = new Set(["FB", "U", "L", "P", "PL", "LG"]);
const GROUPS = {
  lower: ["squat", "hinge", "single-leg", "glutes-calves"],
  push: ["horizontal-push", "vertical-push"],
  pull: ["horizontal-pull", "vertical-pull"]
};
const LOWER_BODY_DAYS = new Set(["FB", "L", "LG"]);
const GUARANTEED = ["squat", "hinge", "single-leg", "core"];

// Each sweep checks thousands of plans, far past Vitest's default 5 seconds.
const SWEEP_TIMEOUT_MS = 120_000;

const groupsOf = (day) =>
  Object.entries(GROUPS)
    .filter(([, patterns]) => day.exercises.some((exercise) => patterns.includes(exercise.pattern)))
    .map(([group]) => group);

// A line whose dose is sets to log, read from its text alone: the name after
// any superset label, the sets, a count or range of reps, seconds or steps,
// "a side", and the bracketed note. Intervals ("8 x 30 seconds hard, …"),
// minutes of cardio, rounds and the ramp-up line do not match.
const SET_LINE =
  /^- (?:[A-Z]\d\. )?(.+?): (\d+) x (\d+)(?:-(\d+))?( seconds| steps)?( a side)?(?: \((.*)\))?$/;
const EFFORT_CUE = /stop (\d+)(?:-(\d+))? reps short of failure/;

// Roadmap B1: each line of sets has exactly one prescription, in line order,
// that says what the line says. Read independently of the generator, so a
// prescription that drifts from its text fails here.
const prescriptionFailures = (day) => {
  const lines = day.lines.map((line) => SET_LINE.exec(line)).filter(Boolean);
  if (lines.length !== day.prescriptions.length) {
    return [
      `${day.weekday}: ${lines.length} lines of sets, ${day.prescriptions.length} prescriptions`
    ];
  }
  return lines.flatMap((match, index) => {
    const [line, name, sets, min, max = min, unit, side, note] = match;
    const prescription = day.prescriptions[index];
    const seconds = unit === " seconds";
    const range = seconds ? prescription.seconds : prescription.reps;
    const cue = EFFORT_CUE.exec(note ?? "");
    const rpe = cue ? { min: 10 - Number(cue[2] ?? cue[1]), max: 10 - Number(cue[1]) } : null;
    const agrees =
      prescription.name === name &&
      prescription.sets === Number(sets) &&
      range?.min === Number(min) &&
      range?.max === Number(max) &&
      (seconds ? prescription.reps : prescription.seconds) === null &&
      prescription.perSide === Boolean(side) &&
      JSON.stringify(prescription.targetRpe) === JSON.stringify(rpe);
    return agrees ? [] : [`${day.weekday}: ${line}`];
  });
};

// Every check the spec lists, for one input; each failure names its check.
const checkPlan = (input) => {
  const plan = generatePlan(input);
  const failures = [];
  const fail = (check, detail = "") => failures.push(`${check}${detail ? `: ${detail}` : ""}`);
  const notes = [...buildFallbackNotes(plan), ...buildSafetyNotes(plan)];
  const text = `${plan.text}\n\nCoach Notes:\n${notes.join("\n")}`;
  const score = scorePlan(
    {
      days: input.days,
      equipment: input.equipment,
      injuries: input.injuries,
      health: input.health
    },
    { text, finishReason: "STOP" }
  );
  if (score.structure.length) fail("structure", score.structure.join(", "));
  for (const hit of score.equipmentHits)
    fail("equipment", `${hit.weekday} ${hit.word}: ${hit.line}`);
  for (const hit of score.injuryHits) fail("avoid", `${hit.weekday} ${hit.injury}: ${hit.line}`);

  const week = plan.week;
  const strengthDays = week.filter((day) => STRENGTH.has(day.type));
  if (strengthDays.length >= 2) {
    for (const group of Object.keys(GROUPS)) {
      const exposures = strengthDays.filter((day) => groupsOf(day).includes(group)).length;
      if (exposures < 2) fail("twice a week", `${group} on ${exposures} day(s)`);
    }
  }
  week.forEach((day, index) => {
    for (const detail of prescriptionFailures(day)) fail("prescription", detail);
    const next = week[(index + 1) % 7];
    if (STRENGTH.has(day.type) && STRENGTH.has(next.type) && index + 1 !== 7) {
      const shared = groupsOf(day).filter((group) => groupsOf(next).includes(group));
      if (shared.length) fail("consecutive", `${day.weekday} and ${next.weekday} share ${shared}`);
    }
    if (day.hard && next.hard && day !== next) fail("hard back to back", day.weekday);
    if (STRENGTH.has(day.type)) {
      const floor = day.type === "FB" ? 4 : 3;
      if (day.exercises.length < floor) fail("floor", `${day.weekday} has ${day.exercises.length}`);
      if (LOWER_BODY_DAYS.has(day.type)) {
        for (const pattern of GUARANTEED.filter((p) => day.skipped.includes(p))) {
          fail("guarantee", `${day.weekday} skipped ${pattern}`);
        }
      }
    }
    if (day.type === "M" && day.exercises.length < 4) fail("floor", `${day.weekday} mobility`);
    if (plan.rules.olderAdult && ["FB", "L", "LG", "M"].includes(day.type)) {
      if (!day.exercises.some((exercise) => exercise.pattern === "balance")) {
        fail("balance", day.weekday);
      }
    }
  });
  if (plan.rules.level === "beginner" && ["lean", "fat-loss"].includes(plan.rules.track)) {
    const types = strengthDays.map((day) => day.type).join(" ");
    if (strengthDays.length > 3 && types !== "U L U L") fail("beginner cap", types);
  }
  const hardCount = week.filter((day) => day.hard).length;
  if (hardCount > (plan.rules.level === "beginner" ? 2 : 3)) fail("hard cap", String(hardCount));
  if (plan.rules.lightMode && hardCount) fail("light mode", `${hardCount} hard`);
  const restDays = week.filter((day) => !day.type);
  const walksMaxed = restDays.every((day) => day.walkMinutes === 60);
  if (plan.aerobicMinutes < plan.aerobicTarget && !walksMaxed) {
    fail("aerobic target", `${plan.aerobicMinutes} of ${plan.aerobicTarget}`);
  }
  return failures;
};

const labelSets = (environment) => {
  const labels = equipmentOptionsByEnv[environment];
  return [[], labels, ...labels.map((label) => [label])];
};

const runSweep = (inputs) => {
  const failed = [];
  let count = 0;
  for (const input of inputs) {
    count += 1;
    const failures = checkPlan(input);
    if (failures.length) failed.push({ input, failures });
  }
  return { count, failed };
};

const describeFailures = (failed) =>
  failed
    .slice(0, 5)
    .map(
      ({ input, failures }) => `${JSON.stringify(input)}\n  ${failures.slice(0, 4).join("\n  ")}`
    )
    .join("\n");

describe("the quality gate", () => {
  test(
    "the main sweep: environments, equipment, days, injuries, goals and levels",
    () => {
      function* inputs() {
        for (const environment of ["Home", "Commercial"]) {
          for (const equipment of labelSets(environment)) {
            for (let days = 1; days <= 7; days += 1) {
              for (const injuries of injuryOptions) {
                for (const goal of goalOptions) {
                  for (const level of experienceOptions) {
                    yield {
                      goal,
                      environment,
                      equipment,
                      level,
                      days,
                      duration: 45,
                      injuries,
                      focuses: [],
                      health: {},
                      age: null
                    };
                  }
                }
              }
            }
          }
        }
      }
      const { count, failed } = runSweep(inputs());
      expect(count).toBeGreaterThan(11000);
      expect(failed.length, describeFailures(failed)).toBe(0);
    },
    SWEEP_TIMEOUT_MS
  );

  test(
    "the second sweep: focuses, durations, the screen and age",
    () => {
      const focusSets = [[], ["Strength"], ["Mobility"], ["Recovery"], ["Weight Loss"], ["Cardio"]];
      const variants = [
        {},
        { health: { condition: true } },
        { health: { symptoms: true } },
        { health: { supervised: true } },
        { health: { pregnant: true } },
        { age: 70 },
        { age: 30, injuries: "Knee" }
      ];
      const setups = [
        { environment: "Home", equipment: ["Bodyweight only"] },
        { environment: "Home", equipment: ["Dumbbells", "Adjustable bench"] },
        { environment: "Commercial", equipment: ["Full gym access"] }
      ];
      function* inputs() {
        for (const focuses of focusSets) {
          for (const duration of [15, 20, 30, 45, 90, 180]) {
            for (const variant of variants) {
              for (const setup of setups) {
                for (let days = 1; days <= 7; days += 1) {
                  for (const [goal, level] of [
                    [goalOptions[0], "Beginner"],
                    [goalOptions[0], "Advanced"],
                    [goalOptions[1], "Intermediate"],
                    [goalOptions[4], "Beginner"],
                    [goalOptions[2], "Intermediate"]
                  ]) {
                    yield {
                      goal,
                      level,
                      days,
                      duration,
                      injuries: "None",
                      focuses,
                      health: {},
                      age: null,
                      ...setup,
                      ...variant
                    };
                  }
                }
              }
            }
          }
        }
      }
      const { count, failed } = runSweep(inputs());
      expect(count).toBeGreaterThan(26000);
      expect(failed.length, describeFailures(failed)).toBe(0);
    },
    SWEEP_TIMEOUT_MS
  );
});
