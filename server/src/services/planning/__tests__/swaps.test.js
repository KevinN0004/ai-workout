/**
 * Pins the exercise swaps (roadmap C4): the rules a saved plan was built under,
 * the alternatives to one of its exercises, a swap on every day it is on, and
 * the undo, on plans generated and saved as the generate route saves them.
 */
import { describe, expect, test } from "vitest";
import { generatePlan, prescribe } from "../generatePlan.js";
import { buildFallbackNotes, buildSafetyNotes } from "../fallbackNotes.js";
import { EXERCISES } from "../exerciseLibrary.js";
import { buildPlanPayload, withPrescriptions } from "../../dashboard/planPayloadService.js";
import { SWAP_AREAS, applySwap, rulesForPlan, swapOptions, undoSwap } from "../swaps.js";

const fields = (overrides = {}) => ({
  goal: "Build lean strength and energy",
  environment: "Home",
  equipment: ["Dumbbells", "Adjustable bench"],
  level: "Intermediate",
  days: 3,
  duration: 45,
  injuries: "None",
  focuses: [],
  ...overrides
});

// A plan as the generate route saves it and mapGeneratedPlan returns it: the
// planner's fields, the text with its rule-written notes, and the payload with
// each weekday's prescriptions. The health answers shape it and are not kept.
const savedPlan = (overrides = {}, health = {}, age = null) => {
  const input = fields(overrides);
  const plan = generatePlan({ ...input, health, age });
  const notes = [...buildFallbackNotes(plan), ...buildSafetyNotes(plan)];
  const text = `${plan.text}\n\nCoach Notes:\n${notes.join("\n")}`;
  return {
    id: "plan-1",
    ...input,
    plan: text,
    payload: withPrescriptions(buildPlanPayload(text), plan.week)
  };
};

const NO_AREA = { age: null, area: null };
const dayOf = (plan, weekday) => plan.payload.days.find((day) => day.weekday === weekday);
const entryNamed = (name) => EXERCISES.find((entry) => entry.name === name);
const optionNames = (options) => options.map((option) => option.name);
const lineFor = (day, name) =>
  day.lines.find((line) => new RegExp(`^- (?:[A-Z]\\d\\. )?${name}: `).test(line));
const textLines = (plan) => plan.plan.split("\n");

// Beginner, two days of 30 minutes: Monday's lifts are supersets, and its ramp-up
// names the lead lift, the goblet squat.
const beginner = () => savedPlan({ level: "Beginner", days: 2, duration: 30 });
const GOBLET = "Dumbbell goblet squat";

describe("SWAP_AREAS", () => {
  test("are the injury areas, without pregnancy", () => {
    expect(SWAP_AREAS).toEqual(["lower back", "back", "knee", "shoulder", "hip", "wrist", "elbow"]);
  });
});

describe("rulesForPlan", () => {
  test("reads the plan's own answers", () => {
    const rules = rulesForPlan(
      savedPlan({ level: "Beginner", injuries: "Knee", equipment: ["Dumbbells"] }),
      NO_AREA
    );
    expect(rules).toMatchObject({ level: "beginner", areas: ["knee"], capabilities: ["dumbbell"] });
  });

  test("adds the area a swap names, once", () => {
    expect(rulesForPlan(savedPlan(), { age: null, area: "shoulder" }).areas).toEqual(["shoulder"]);
    expect(
      rulesForPlan(savedPlan({ injuries: "Knee" }), { age: null, area: "knee" }).areas
    ).toEqual(["knee"]);
  });

  test("reads pregnancy and the light-to-moderate mode from the plan's notes", () => {
    const pregnant = rulesForPlan(savedPlan({}, { pregnant: true }), NO_AREA);
    expect(pregnant.areas).toContain("pregnancy");
    expect(pregnant.lightMode).toBe(true);

    const symptoms = rulesForPlan(savedPlan({}, { symptoms: true }), NO_AREA);
    expect(symptoms.areas).not.toContain("pregnancy");
    expect(symptoms.lightMode).toBe(true);

    expect(rulesForPlan(savedPlan(), NO_AREA).lightMode).toBe(false);
  });

  test("reads a plan with no days or minutes saved as the generate route's defaults", () => {
    const rules = rulesForPlan({ ...savedPlan(), days: null, duration: null }, NO_AREA);
    expect(rules).toMatchObject({ days: 3, minutes: 45 });
  });

  test("takes the age from the profile, and none from a plan without a payload", () => {
    expect(rulesForPlan(savedPlan(), { age: 70, area: null }).olderAdult).toBe(true);
    const bare = { ...savedPlan(), payload: null };
    expect(rulesForPlan(bare, NO_AREA)).toMatchObject({ lightMode: false, areas: [] });
  });
});

describe("swapOptions", () => {
  test("offers the exercise's pattern, without itself or anything on its days", () => {
    const plan = beginner();
    const options = swapOptions(plan, GOBLET, rulesForPlan(plan, NO_AREA));
    const onItsDays = plan.payload.days
      .filter((day) => day.prescriptions?.some((p) => p.name === GOBLET))
      .flatMap((day) => day.prescriptions.map((p) => p.name));

    expect(options.length).toBeGreaterThan(0);
    for (const name of optionNames(options)) {
      expect(entryNamed(name).pattern).toBe("squat");
      expect(onItsDays).not.toContain(name);
    }
    expect(optionNames(options)).toContain("Bodyweight squat");
  });

  test("gives each option its equipment, and a regression's area and cue", () => {
    const plan = savedPlan();
    const name = dayOf(plan, "Monday").prescriptions.find(
      (p) => entryNamed(p.name).pattern === "horizontal-push"
    ).name;
    const options = swapOptions(plan, name, rulesForPlan(plan, { age: null, area: "shoulder" }));

    for (const option of options) {
      expect(entryNamed(option.name).flags.shoulder).not.toBe("avoid");
    }
    expect(options).toContainEqual({
      name: "Incline push-up, hands on a counter",
      needs: [],
      regressed: true,
      area: "shoulder",
      cue: "put your hands on a counter to lighten the load"
    });
    expect(options.find((option) => !option.regressed)).toMatchObject({ area: null, cue: null });
    expect(new Set(optionNames(options)).size).toBe(options.length);
  });

  test("an area leaves out what bothers it", () => {
    const plan = savedPlan();
    const name = dayOf(plan, "Monday").prescriptions.find(
      (p) => entryNamed(p.name).pattern === "horizontal-push"
    ).name;
    const plain = optionNames(swapOptions(plan, name, rulesForPlan(plan, NO_AREA)));
    const shoulder = optionNames(
      swapOptions(plan, name, rulesForPlan(plan, { age: null, area: "shoulder" }))
    );
    expect(plain).toContain("Push-up");
    expect(shoulder).not.toContain("Push-up");
  });

  test("offers nothing when everything else that fits is already on its days", () => {
    const plan = savedPlan({ days: 6, duration: 30 });
    expect(swapOptions(plan, "Chest-supported dumbbell row", rulesForPlan(plan, NO_AREA))).toEqual(
      []
    );
  });

  test("is null for a name not in the plan, a name not in the library, or no payload", () => {
    const plan = beginner();
    const rules = rulesForPlan(plan, NO_AREA);
    expect(swapOptions(plan, "Bodyweight squat", rules)).toBeNull();
    expect(swapOptions({ ...plan, payload: null }, GOBLET, rules)).toBeNull();

    const renamed = structuredClone(plan);
    dayOf(renamed, "Monday").prescriptions[0].name = "Squat of my own";
    expect(swapOptions(renamed, "Squat of my own", rules)).toBeNull();
  });

  // A plan saved before per-set logging (B1) has days with lines and no
  // prescriptions, so it has nothing to swap, and nothing to undo.
  test("is null for a plan whose days carry no prescriptions", () => {
    const plan = beginner();
    const bare = structuredClone(plan);
    for (const day of bare.payload.days) delete day.prescriptions;
    const rules = rulesForPlan(bare, NO_AREA);

    expect(swapOptions(bare, GOBLET, rules)).toBeNull();
    expect(
      applySwap(bare, { from: GOBLET, to: "Dumbbell sumo squat", area: null }, rules)
    ).toBeNull();
    expect(undoSwap(bare, GOBLET)).toBeNull();
  });
});

describe("applySwap", () => {
  test("rewrites the prescription and its line, keeping the superset label", () => {
    const plan = beginner();
    const rules = rulesForPlan(plan, NO_AREA);
    const swapped = applySwap(plan, { from: GOBLET, to: "Dumbbell sumo squat", area: null }, rules);
    const before = dayOf(plan, "Monday");
    const after = swapped.payload.days.find((day) => day.weekday === "Monday");
    const original = before.prescriptions.find((p) => p.name === GOBLET);
    const fresh = prescribe(
      { ...entryNamed("Dumbbell sumo squat"), regressed: false },
      "main",
      rules,
      "A1"
    );

    expect(after.prescriptions[0]).toEqual({
      ...fresh.prescription,
      swappedFrom: {
        prescription: original,
        line: lineFor(before, GOBLET),
        rampLine:
          "- Ramp-up: Dumbbell goblet squat x 8 at about half your working weight, x 4 at about 70%."
      },
      swapReason: null
    });
    expect(after.lines).toContain(fresh.line);
    expect(fresh.line.startsWith("- A1. Dumbbell sumo squat: ")).toBe(true);
    expect(lineFor(after, GOBLET)).toBeUndefined();
  });

  test("renames the ramp-up for a loaded lift, and drops it for a bodyweight one", () => {
    const plan = beginner();
    const rules = rulesForPlan(plan, NO_AREA);
    const ramp = (swapped) =>
      dayOf(swapped, "Monday").lines.filter((line) => line.startsWith("- Ramp-up: "));
    const asPlan = (result) => ({ ...plan, ...result, plan: result.planText });

    const sumo = asPlan(
      applySwap(plan, { from: GOBLET, to: "Dumbbell sumo squat", area: null }, rules)
    );
    expect(ramp(sumo)).toEqual([
      "- Ramp-up: Dumbbell sumo squat x 8 at about half your working weight, x 4 at about 70%."
    ]);

    const bodyweight = asPlan(
      applySwap(plan, { from: GOBLET, to: "Bodyweight squat", area: null }, rules)
    );
    expect(ramp(bodyweight)).toEqual([]);
    // Thursday's ramp-up names its own lead and stays; Monday's is gone from the text.
    const ramps = textLines(bodyweight).filter((line) => line.startsWith("- Ramp-up: "));
    expect(ramps).toEqual(
      textLines(plan)
        .filter((line) => line.startsWith("- Ramp-up: "))
        .slice(1)
    );
    expect(ramps.some((line) => line.includes(GOBLET))).toBe(false);

    // From bodyweight back to a loaded lift, the ramp-up returns, after the warm-up.
    const loaded = asPlan(
      applySwap(
        bodyweight,
        { from: "Bodyweight squat", to: "Dumbbell sumo squat", area: null },
        rules
      )
    );
    expect(dayOf(loaded, "Monday").lines.slice(0, 2)).toEqual([
      dayOf(plan, "Monday").lines[0],
      "- Ramp-up: Dumbbell sumo squat x 8 at about half your working weight, x 4 at about 70%."
    ]);
  });

  test("rewrites the plan text's lines too, and nothing else in it", () => {
    const plan = beginner();
    const result = applySwap(
      plan,
      { from: GOBLET, to: "Dumbbell sumo squat", area: null },
      rulesForPlan(plan, NO_AREA)
    );
    const rebuilt = buildPlanPayload(result.planText);

    expect(rebuilt.days.map((day) => day.lines)).toEqual(
      result.payload.days.map((day) => day.lines)
    );
    expect(rebuilt.notes).toEqual(plan.payload.notes);
    expect(result.planText).not.toContain(GOBLET);
  });

  test("doses each day's occurrence in that day's own role", () => {
    const plan = savedPlan({ days: 6, duration: 30 });
    const row = "Chest-supported dumbbell row";
    const extra = {
      ...entryNamed("Bent-over dumbbell row"),
      id: "test-row",
      name: "Test row"
    };
    const library = [...EXERCISES, extra];
    const rules = rulesForPlan(plan, NO_AREA);
    const result = applySwap(plan, { from: row, to: "Test row", area: null }, rules, library);
    const chosen = { ...extra, regressed: false };
    const occurrences = result.payload.days.flatMap((day) =>
      (day.prescriptions ?? []).filter((p) => p.name === "Test row")
    );

    expect(occurrences.map((p) => p.swappedFrom.prescription.role)).toEqual(["main", "accessory"]);
    expect(occurrences.map(({ swappedFrom: _s, swapReason: _r, ...p }) => p)).toEqual([
      prescribe(chosen, "main", rules).prescription,
      prescribe(chosen, "accessory", rules).prescription
    ]);
  });

  test("records the area named as the reason", () => {
    const plan = savedPlan();
    const name = dayOf(plan, "Monday").prescriptions.find(
      (p) => entryNamed(p.name).pattern === "horizontal-push"
    ).name;
    const rules = rulesForPlan(plan, { age: null, area: "shoulder" });
    const result = applySwap(
      plan,
      { from: name, to: "Incline push-up, hands on a counter", area: "shoulder" },
      rules
    );
    const swapped = result.payload.days
      .flatMap((day) => day.prescriptions ?? [])
      .find((p) => p.name === "Incline push-up, hands on a counter");
    expect(swapped.swapReason).toBe("shoulder");
  });

  test("a second swap keeps the first original, and swapping back is the original", () => {
    const plan = beginner();
    const rules = rulesForPlan(plan, NO_AREA);
    const first = applySwap(plan, { from: GOBLET, to: "Dumbbell sumo squat", area: null }, rules);
    const once = { ...plan, payload: first.payload, plan: first.planText };
    const second = applySwap(
      once,
      { from: "Dumbbell sumo squat", to: "Bodyweight squat", area: "wrist" },
      rulesForPlan(once, { age: null, area: "wrist" })
    );
    const twice = { ...plan, payload: second.payload, plan: second.planText };
    const monday = dayOf(twice, "Monday").prescriptions[0];

    expect(monday.name).toBe("Bodyweight squat");
    expect(monday.swappedFrom.prescription.name).toBe(GOBLET);
    expect(monday.swapReason).toBe("wrist");

    const back = applySwap(twice, { from: "Bodyweight squat", to: GOBLET, area: null }, rules);
    expect(back.payload).toEqual(plan.payload);
    expect(back.planText).toBe(plan.plan);
  });

  test("is null when the exercise is not in the plan or the new one is not offered", () => {
    const plan = beginner();
    const rules = rulesForPlan(plan, NO_AREA);
    expect(applySwap(plan, { from: "Bodyweight squat", to: GOBLET, area: null }, rules)).toBeNull();
    expect(applySwap(plan, { from: GOBLET, to: "Push-up", area: null }, rules)).toBeNull();
    expect(applySwap(plan, { from: GOBLET, to: GOBLET, area: null }, rules)).toBeNull();
  });

  // A prescription saved before C4 names no library entry or role: the name finds
  // the entry, and the dose the role.
  test("swaps a plan saved before prescriptions named their entry and role", () => {
    const plan = beginner();
    const old = structuredClone(plan);
    for (const day of old.payload.days) {
      day.prescriptions = day.prescriptions?.map(
        ({ exerciseId: _e, role: _r, ...prescription }) => prescription
      );
    }
    const rules = rulesForPlan(old, NO_AREA);
    const result = applySwap(old, { from: GOBLET, to: "Dumbbell sumo squat", area: null }, rules);
    const fresh = prescribe(
      { ...entryNamed("Dumbbell sumo squat"), regressed: false },
      "main",
      rules
    );

    expect(dayOf({ payload: result.payload }, "Monday").prescriptions[0]).toMatchObject(
      fresh.prescription
    );

    // An accessory's dose is not its entry's main dose, so it stays an accessory.
    const hinge = "Dumbbell Romanian deadlift";
    const [alternative] = swapOptions(old, hinge, rules);
    const accessory = applySwap(old, { from: hinge, to: alternative.name, area: null }, rules);
    expect(
      dayOf({ payload: accessory.payload }, "Monday").prescriptions.find(
        (p) => p.name === alternative.name
      )
    ).toMatchObject(
      prescribe({ ...entryNamed(alternative.name), regressed: false }, "accessory", rules)
        .prescription
    );
  });

  test("a balance exercise, dosed by its own rules, keeps no role", () => {
    const plan = savedPlan(
      { equipment: ["Bodyweight only"], level: "Beginner", days: 2, duration: 30 },
      {},
      70
    );
    const rules = rulesForPlan(plan, { age: 70, area: null });
    const balance = dayOf(plan, "Monday").prescriptions.find((p) => p.role === null);
    const [alternative] = swapOptions(plan, balance.name, rules);
    const result = applySwap(plan, { from: balance.name, to: alternative.name, area: null }, rules);
    const swapped = dayOf({ payload: result.payload }, "Monday").prescriptions.find(
      (p) => p.name === alternative.name
    );

    expect(entryNamed(alternative.name).pattern).toBe("balance");
    expect(swapped.role).toBeNull();
  });

  test("is null when the plan's text does not hold the day as its payload does", () => {
    const plan = beginner();
    const rules = rulesForPlan(plan, NO_AREA);
    const swap = { from: GOBLET, to: "Dumbbell sumo squat", area: null };
    const monday = dayOf(plan, "Monday");

    expect(
      applySwap({ ...plan, plan: plan.plan.replace(monday.title, "") }, swap, rules)
    ).toBeNull();
    expect(
      applySwap(
        { ...plan, plan: plan.plan.replace(monday.lines[0], "Warmup: changed") },
        swap,
        rules
      )
    ).toBeNull();
  });
});

describe("undoSwap", () => {
  test("puts back the plan as it was generated, payload and text", () => {
    const plan = beginner();
    const rules = rulesForPlan(plan, NO_AREA);
    const bodyweight = applySwap(plan, { from: GOBLET, to: "Bodyweight squat", area: null }, rules);
    const swapped = { ...plan, payload: bodyweight.payload, plan: bodyweight.planText };

    const undone = undoSwap(swapped, "Bodyweight squat");

    expect(undone.payload).toEqual(plan.payload);
    expect(undone.planText).toBe(plan.plan);
  });

  test("is null when nothing by that name was swapped", () => {
    const plan = beginner();
    expect(undoSwap(plan, GOBLET)).toBeNull();
    expect(undoSwap(plan, "Bodyweight squat")).toBeNull();
    expect(undoSwap({ ...plan, payload: null }, GOBLET)).toBeNull();
  });
});
