import { describe, expect, test } from "vitest";
import { generatePlan } from "../generatePlan.js";
import {
  RED_FLAG_LINE,
  GENERAL_NOTICE,
  LIGHT_MODE_LINE,
  PREGNANCY_LINE,
  buildFallbackNotes,
  buildSafetyNotes,
  healthFromNotes
} from "../fallbackNotes.js";

// The rule-written coach notes (docs/specs/2026-11-03-rule-based-plans-design.md,
// "The coach notes"): the notes that stand in when Gemini's cannot be used, and
// the safety lines every plan carries whoever wrote the rest.

const input = (overrides = {}) => ({
  goal: "Build lean strength and energy",
  environment: "Home",
  equipment: ["Dumbbells"],
  level: "Intermediate",
  days: 3,
  duration: 45,
  injuries: "None",
  focuses: [],
  health: {},
  age: null,
  ...overrides
});
const fallback = (overrides) => buildFallbackNotes(generatePlan(input(overrides)));
const safety = (overrides) => buildSafetyNotes(generatePlan(input(overrides)));

describe("buildFallbackNotes", () => {
  test("writes progression, recovery and the track's target", () => {
    expect(fallback({})).toEqual([
      "Add reps first. When every set reaches the top of its range with the reps in reserve shown, add about 2-10% load next time, the smaller step for upper-body lifts.",
      "Aim for at least 7 hours of sleep. If your lifts stall or drop for two weeks or more, you feel unusually tired, or your mood or sleep gets worse, take an easier week.",
      "This plan builds to about 150 minutes of moderate cardio a week, counting the walks on rest days."
    ]);
  });

  test("tells a beginner to learn the movements first", () => {
    expect(fallback({ level: "Beginner" })[1]).toBe(
      "Spend the first two weeks learning the movements."
    );
  });

  test("gives fat loss its target and its deficit line", () => {
    const notes = fallback({ goal: "Fat loss + conditioning" });
    expect(notes).toContain(
      "This plan builds to about 225 minutes of moderate cardio a week, counting the walks on rest days."
    );
    expect(notes).toContain(
      "Most fat loss comes from a moderate calorie deficit and your total weekly activity; lifting keeps your muscle."
    );
  });

  test("tells a one-day plan that two days is the minimum", () => {
    expect(fallback({ days: 1 })).toContain(
      "Two strength days a week is the minimum worth aiming for; the walks on the other days count toward your cardio."
    );
  });

  test("never cites a fat-loss figure from interval training", () => {
    const fatLines = fallback({ goal: "Fat loss + conditioning" }).filter((line) =>
      /fat/i.test(line)
    );
    expect(fatLines.length).toBeGreaterThan(0);
    for (const line of fatLines) expect(line).not.toMatch(/%|interval/i);
  });
});

describe("buildSafetyNotes", () => {
  test("every plan ends with the red-flag line and the general notice", () => {
    expect(safety({})).toEqual([RED_FLAG_LINE, GENERAL_NOTICE]);
    expect(RED_FLAG_LINE).toBe(
      "Stop and get medical help if you have chest pain or pressure, feel faint or dizzy, get breathless out of proportion to the effort, or notice a racing or irregular heartbeat."
    );
    expect(GENERAL_NOTICE).toBe(
      "This plan is general fitness guidance, not medical advice. If you have a heart, lung, metabolic or kidney condition, are pregnant, or have symptoms like chest pain or fainting, check with a health professional first."
    );
  });

  test("names the injured areas in one line, with graded pain guidance", () => {
    expect(safety({ injuries: "Wrist/Elbow" })[0]).toBe(
      "Exercises that commonly bother your wrist and elbow are swapped for easier versions or left out. This is not a rehab programme. Mild discomfort that stays at about 3 out of 10 or less, settles within a day and does not build from week to week is usually fine. Stop an exercise if the pain is sharp, keeps building, changes how you move, or is worse the next day, and see a physiotherapist or doctor if it does not settle."
    );
  });

  test.each([
    ["Knee", "your knee"],
    ["Lower back", "your lower back"],
    ["knee, hip and shoulder", "your knee, shoulder and hip"]
  ])("names %j as %j", (injuries, phrase) => {
    expect(safety({ injuries })[0]).toContain(`commonly bother ${phrase} are swapped`);
  });

  test("says when free text names no area it can adjust for", () => {
    expect(safety({ injuries: "sore ankle" })[0]).toBe(
      'We could not adjust this plan for "sore ankle". Train within what feels comfortable, and check with a physiotherapist or doctor if it hurts.'
    );
  });

  test("adds the referral line in light-to-moderate mode", () => {
    expect(safety({ health: { symptoms: true } })[0]).toBe(
      "Because you answered yes to a health question, keep every session at a pace where you can talk, and check with a health professional before you train harder."
    );
  });

  test("adds the pregnancy line, and no injury line for pregnancy itself", () => {
    const notes = safety({ health: { pregnant: true } });
    expect(notes).toContain(
      "Because you are pregnant or have recently given birth, check with your midwife or doctor before you start, and skip anything that feels wrong."
    );
    expect(notes.join(" ")).not.toMatch(/bother your pregnancy/);
  });

  test("keeps the safety lines in a fixed order", () => {
    const notes = safety({ injuries: "Knee", health: { pregnant: true } });
    expect(notes.map((line) => line.slice(0, 20))).toEqual([
      "Exercises that commo",
      "Because you answered",
      "Because you are preg",
      RED_FLAG_LINE.slice(0, 20),
      GENERAL_NOTICE.slice(0, 20)
    ]);
  });
});

// Roadmap C4: the health answers are never saved with a plan, so a swap reads
// back the rules they set from the safety lines the plan carries.
describe("healthFromNotes", () => {
  test.each([
    ["pregnant", { pregnant: true, condition: true }],
    ["condition", { pregnant: false, condition: true }],
    ["symptoms", { pregnant: false, condition: true }],
    ["supervised", { pregnant: false, condition: true }]
  ])("reads a plan generated with a yes to %s", (answer, health) => {
    const notes = [...fallback({}), ...safety({ health: { [answer]: true } })];
    expect(healthFromNotes(notes)).toEqual(health);
  });

  test("reads a plan with no yes as neither", () => {
    expect(healthFromNotes([...fallback({}), ...safety({ injuries: "Knee" })])).toEqual({
      pregnant: false,
      condition: false
    });
  });

  test.each([
    ["no notes", undefined],
    ["notes that are not a list", "Because you are pregnant"],
    ["a list holding something other than text", [PREGNANCY_LINE, 7]]
  ])("reads %s as neither", (_label, notes) => {
    expect(healthFromNotes(notes)).toEqual({ pregnant: false, condition: false });
  });

  // The reader and the writer share the sentences, so the rules come back whole:
  // for every answer, the health read from the notes gives the plan's own areas
  // and light-to-moderate mode.
  test.each([
    {},
    { pregnant: true },
    { condition: true },
    { symptoms: true },
    { supervised: true }
  ])("gives back the rules of a plan generated with %j", (health) => {
    const plan = generatePlan(input({ injuries: "Knee", health }));
    const read = generatePlan(
      input({ injuries: "Knee", health: healthFromNotes(buildSafetyNotes(plan)) })
    );
    expect(read.rules.areas).toEqual(plan.rules.areas);
    expect(read.rules.lightMode).toBe(plan.rules.lightMode);
  });

  test("the two lines are the ones buildSafetyNotes writes", () => {
    expect(safety({ health: { pregnant: true } })).toEqual(
      expect.arrayContaining([LIGHT_MODE_LINE, PREGNANCY_LINE])
    );
  });
});
