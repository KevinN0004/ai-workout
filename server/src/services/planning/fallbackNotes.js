/**
 * The rule-written coach notes: those that stand in when Gemini's cannot be
 * used, the safety lines every plan carries whoever wrote the rest, and the
 * health rules those lines say applied (docs/specs/2026-11-03-rule-based-plans-design.md).
 */
// @ts-check

/** @typedef {ReturnType<typeof import("./generatePlan.js").generatePlan>} GeneratedPlan */

/** The red-flag line every plan ends with (the ACSM 2015 and PAR-Q+ symptom set). */
export const RED_FLAG_LINE =
  "Stop and get medical help if you have chest pain or pressure, feel faint or dizzy, get breathless out of proportion to the effort, or notice a racing or irregular heartbeat.";

/** The general notice every plan carries. */
export const GENERAL_NOTICE =
  "This plan is general fitness guidance, not medical advice. If you have a heart, lung, metabolic or kidney condition, are pregnant, or have symptoms like chest pain or fainting, check with a health professional first.";

/** The referral line a plan carries in light-to-moderate mode: a yes to a health question. */
export const LIGHT_MODE_LINE =
  "Because you answered yes to a health question, keep every session at a pace where you can talk, and check with a health professional before you train harder.";

/** The line a plan carries when it was generated for pregnancy or after a recent birth. */
export const PREGNANCY_LINE =
  "Because you are pregnant or have recently given birth, check with your midwife or doctor before you start, and skip anything that feels wrong.";

const PAIN_GUIDANCE =
  "This is not a rehab programme. Mild discomfort that stays at about 3 out of 10 or less, settles within a day and does not build from week to week is usually fine. Stop an exercise if the pain is sharp, keeps building, changes how you move, or is worse the next day, and see a physiotherapist or doctor if it does not settle.";

/** @param {string[]} items */
const listOf = (items) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * The notes that stand in for Gemini's: progression, recovery, and the weekly
 * cardio target the plan builds to, with a line for beginners, for fat loss and
 * for a one-day plan.
 * @param {GeneratedPlan} plan
 * @returns {string[]}
 */
export const buildFallbackNotes = ({ rules, aerobicTarget }) => [
  "Add reps first. When every set reaches the top of its range with the reps in reserve shown, add about 2-10% load next time, the smaller step for upper-body lifts.",
  ...(rules.level === "beginner" ? ["Spend the first two weeks learning the movements."] : []),
  "Aim for at least 7 hours of sleep. If your lifts stall or drop for two weeks or more, you feel unusually tired, or your mood or sleep gets worse, take an easier week.",
  `This plan builds to about ${aerobicTarget} minutes of moderate cardio a week, counting the walks on rest days.`,
  ...(rules.track === "fat-loss"
    ? [
        "Most fat loss comes from a moderate calorie deficit and your total weekly activity; lifting keeps your muscle."
      ]
    : []),
  ...(rules.days === 1
    ? [
        "Two strength days a week is the minimum worth aiming for; the walks on the other days count toward your cardio."
      ]
    : [])
];

/**
 * The safety lines, in order: the injury line naming every area found (or the
 * line for free text naming none), the referral line in light-to-moderate mode,
 * the pregnancy line, the red-flag line and the general notice.
 * @param {GeneratedPlan} plan
 * @returns {string[]}
 */
export const buildSafetyNotes = ({ rules }) => {
  const areas = rules.areas.filter((area) => area !== "pregnancy");
  /** @type {string[]} */
  const lines = [];
  if (areas.length) {
    lines.push(
      `Exercises that commonly bother your ${listOf(areas)} are swapped for easier versions or left out. ${PAIN_GUIDANCE}`
    );
  } else if (rules.injuryText) {
    lines.push(
      `We could not adjust this plan for "${rules.injuryText}". Train within what feels comfortable, and check with a physiotherapist or doctor if it hurts.`
    );
  }
  if (rules.lightMode) lines.push(LIGHT_MODE_LINE);
  if (rules.areas.includes("pregnancy")) lines.push(PREGNANCY_LINE);
  lines.push(RED_FLAG_LINE, GENERAL_NOTICE);
  return lines;
};

/**
 * The health answers a saved plan's `notes` imply, for readInput (roadmap C4).
 * The answers themselves are never saved with a plan, but the safety lines that
 * every plan carries say which rules they set: `pregnant` when the pregnancy
 * line is there, and `condition` when the light-to-moderate line is, since any
 * of the three yes answers writes that one line and sets the same rules.
 * Anything that is not a list of strings reads as no notes.
 * @param {unknown} notes
 * @returns {{ pregnant: boolean, condition: boolean }}
 */
export const healthFromNotes = (notes) => {
  const lines =
    Array.isArray(notes) && notes.every((line) => typeof line === "string") ? notes : [];
  return { pregnant: lines.includes(PREGNANCY_LINE), condition: lines.includes(LIGHT_MODE_LINE) };
};
