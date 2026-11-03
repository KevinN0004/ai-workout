/**
 * Scores one generated plan for the plan-quality evals: its structure breaks,
 * the lines naming equipment its profile lacks, and the lines risky for an
 * injury it names (docs/specs/2026-11-03-plan-quality-evals-design.md).
 */
import { buildPlanPayload } from "../../server/src/services/dashboard/planPayloadService.js";
import { DEFAULT_MAX_PLAN_CHARS } from "../../server/src/routes/generateRoutes.js";
import { isRestDay } from "../../client/src/app/plans.js";
import {
  buildInjuryText,
  detectInjuryFlags
} from "../../client/src/pages/dashboard/tips/recommendationUtils.js";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
  if (text.length > DEFAULT_MAX_PLAN_CHARS) return "oversized";
  return null;
};

/**
 * Scores one plan for `profile`. `outcome` is a call's result, `{ text,
 * finishReason }`, or `{ error }` for a call that failed twice. Returns the
 * structure breaks, in the spec's order, and each injury and equipment hit with
 * the weekday and line it is on: an injury hit is a line and a flagged injury
 * with a keyword in it, counted by substring as the Guides view counts a
 * conflict, and an equipment hit a line and a word no label of the profile
 * supplies. Every day's lines are read, rest days included.
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

  const flags = detectInjuryFlags(buildInjuryText(profile.injuries, ""));
  const labels = profile.equipment.map((label) => label.toLowerCase());
  const missing = EQUIPMENT_WORDS.filter(
    ({ suppliers }) => !suppliers.some((supplier) => labels.includes(supplier))
  );

  const injuryHits = [];
  const equipmentHits = [];
  for (const day of payload.days) {
    for (const line of day.lines) {
      const lower = line.toLowerCase();
      for (const flag of flags) {
        if (flag.keywords.some((keyword) => lower.includes(keyword))) {
          injuryHits.push({ weekday: day.weekday, line, injury: flag.injury });
        }
      }
      for (const { word, pattern } of missing) {
        if (pattern.test(line)) equipmentHits.push({ weekday: day.weekday, line, word });
      }
    }
  }

  return { structure, injuryHits, equipmentHits };
};
