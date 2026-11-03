/**
 * Scores one generated plan: its structure breaks, the lines naming equipment
 * its profile lacks, and the lines naming an exercise its injuries or pregnancy
 * avoid (docs/specs/2026-11-03-rule-based-plans-design.md, "The quality gate").
 */
import { buildPlanPayload } from "../../server/src/services/dashboard/planPayloadService.js";
import { isRestDay } from "../../client/src/app/plans.js";
import {
  buildInjuryText,
  detectInjuryFlags
} from "../../client/src/pages/dashboard/tips/recommendationUtils.js";

// The spec's avoid table as name phrases, each with its word forms, matched
// whole and ignoring case. Kept apart from the exercise library's own tags on
// purpose, so the gate checks the library against an independent list.
const AVOID_PHRASES = {
  knee: ["jump", "jumps", "jumping", "pistol", "pistols"],
  "lower back": ["barbell deadlift", "barbell deadlifts", "good morning", "good mornings"],
  back: ["barbell deadlift", "barbell deadlifts", "good morning", "good mornings"],
  shoulder: [
    "upright row",
    "upright rows",
    "behind-the-neck",
    "dip",
    "dips",
    "snatch",
    "snatches",
    "jerk",
    "jerks"
  ],
  wrist: ["dip", "dips", "skull crusher", "skull crushers"],
  elbow: ["dip", "dips", "skull crusher", "skull crushers"],
  hip: ["pistol", "pistols", "sumo squat", "sumo squats"],
  pregnancy: ["jump", "jumps", "jumping", "burpee", "burpees", "sprint", "sprints"]
};
const avoidPattern = (phrases) => new RegExp(String.raw`\b(?:${phrases.join("|")})\b`, "i");

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// The longest plan text the scorer accepts, in characters: the cap the route held
// Gemini's plans to before the rule-based generator, which writes far shorter ones.
const MAX_PLAN_CHARS = 20000;

// Labels as the planner offers them, lower-cased.
const FULL = "full gym access";
const STRENGTH = "strength floor";
const FUNCTIONAL = "functional training zone";
const CLASSES = "group class studio";
const RECOVERY = "recovery & mobility zone";
const CARDIO = "cardio deck";
const POOL = "pool / aquatic center";

// Each equipment word a plan line can name, matched whole and ignoring case,
// with the labels that supply it. The suppliers follow the capability lines the
// prompt sends (planPromptService.js): racks on the strength floor and the
// functional zone's bodyweight stations are somewhere to do a pull-up. A
// rowing machine is cardio equipment, so "machine" skips it.
const EQUIPMENT_WORDS = [
  { word: "barbell", pattern: /\bbarbells?\b|\bbb\b/i, suppliers: [FULL, STRENGTH] },
  {
    word: "dumbbell",
    pattern: /\bdumbbells?\b|\bdbs?\b/i,
    suppliers: ["dumbbells", FULL, STRENGTH, FUNCTIONAL, CLASSES]
  },
  {
    word: "kettlebell",
    pattern: /\bkettlebells?\b|\bkbs?\b/i,
    suppliers: ["kettlebell", FULL, STRENGTH, FUNCTIONAL, CLASSES]
  },
  { word: "bench", pattern: /\bbench(es)?\b/i, suppliers: ["adjustable bench", FULL, STRENGTH] },
  {
    word: "band",
    pattern: /\bbands?\b|\bbanded\b/i,
    suppliers: ["resistance bands", FULL, FUNCTIONAL, CLASSES, RECOVERY]
  },
  {
    word: "pull-up",
    pattern: /\bpull-?ups?\b|\bchin-?ups?\b|\bhanging\b/i,
    suppliers: ["pull-up bar", FULL, STRENGTH, FUNCTIONAL]
  },
  { word: "cable", pattern: /\bcables?\b/i, suppliers: [FULL, FUNCTIONAL] },
  {
    word: "machine",
    pattern: /\b(?<!rowing )machines?\b|\bsmith\b|\bleg press\b/i,
    suppliers: [FULL, STRENGTH]
  },
  {
    word: "cardio machine",
    pattern:
      /\btreadmills?\b|\bellipticals?\b|\browers?\b|\browing machines?\b|\b(stationary|air|assault|spin) bikes?\b|\bergs?\b|\bstair ?masters?\b/i,
    suppliers: [FULL, CARDIO]
  },
  { word: "pool", pattern: /\bswim(ming)?\b|\bpool\b|\baqua(tic)?\b/i, suppliers: [FULL, POOL] }
];

// The breaks an outcome has before its text is read: a call that failed twice,
// one cut off at the token cap, and a blank or over-long answer. Each is the
// outcome's only break, and its text, if any, is not scored.
const outcomeBreak = (outcome) => {
  if (outcome.error) return "failed";
  if (outcome.finishReason === "MAX_TOKENS") return "truncated";
  const text = typeof outcome.text === "string" ? outcome.text : "";
  if (!text.trim()) return "empty";
  if (text.length > MAX_PLAN_CHARS) return "oversized";
  return null;
};

/**
 * Scores one plan for `profile`. `outcome` is a call's result, `{ text,
 * finishReason }`, or `{ error }` for a call that failed twice. Returns the
 * structure breaks, in the spec's order, and each injury and equipment hit with
 * the weekday and line it is on: an injury hit is a line and an area the
 * profile names (its injuries, or pregnancy from `profile.health`) with one of
 * that area's avoid phrases in it, and an equipment hit a line and a word no
 * label of the profile supplies. Every day's lines are read, rest days included.
 */
export const scorePlan = (profile, outcome) => {
  const early = outcomeBreak(outcome);
  if (early) return { structure: [early], injuryHits: [], equipmentHits: [] };

  const payload = buildPlanPayload(outcome.text);
  const structure = [];
  const weekdays = payload.days.map((day) => day.weekday);
  if (weekdays.join() !== WEEKDAYS.join()) structure.push("weekdays");
  if (!payload.notes.length) structure.push("notes");
  const trainingDays = payload.days.filter((day) => !isRestDay(day.lines)).length;
  if (trainingDays !== profile.days) structure.push("training-days");

  const areas = [
    ...detectInjuryFlags(buildInjuryText(profile.injuries, "")).map((flag) => flag.injury),
    ...(profile.health?.pregnant ? ["pregnancy"] : [])
  ].map((area) => [area, avoidPattern(AVOID_PHRASES[area])]);
  const labels = profile.equipment.map((label) => label.toLowerCase());
  const missing = EQUIPMENT_WORDS.filter(
    ({ suppliers }) => !suppliers.some((supplier) => labels.includes(supplier))
  );

  const injuryHits = [];
  const equipmentHits = [];
  for (const day of payload.days) {
    for (const line of day.lines) {
      for (const [area, pattern] of areas) {
        if (pattern.test(line)) injuryHits.push({ weekday: day.weekday, line, injury: area });
      }
      for (const { word, pattern } of missing) {
        if (pattern.test(line)) equipmentHits.push({ weekday: day.weekday, line, word });
      }
    }
  }

  return { structure, injuryHits, equipmentHits };
};
