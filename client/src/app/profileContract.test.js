import { describe, expect, test } from "vitest";
import { personalToProfile, profileToPersonal } from "./profileMapping";
import { defaultPersonalForm } from "./constants";
import { profileBodySchema } from "../../../server/src/services/apiSchemaService.js";
import { buildProfile } from "../../../server/src/services/dashboardDataBuildersService.js";

// The profile crosses the wire through four pieces that each have their own
// tests and no shared one:
//
//   draft -> personalToProfile -> profileBodySchema -> buildProfile -> profileToPersonal
//
// The client suite stops at the mapper and the server suite starts at the
// schema, so a disagreement between them passes both. This file is the seam.
// It imports the server modules directly, which the running app cannot do but a
// test can -- the same technique constants.test.js uses to pin the option lists
// against the server's allowlists.
//
// The e2e smoke suite is the only other thing that runs both halves together,
// and it deliberately does not cover profile editing.

const IMPERIAL = { heightUnit: "ft", weightUnit: "lb" };
const METRIC = { heightUnit: "cm", weightUnit: "kg" };

const save = (draft, units) => {
  const parsed = profileBodySchema.safeParse(personalToProfile(draft, units));
  if (!parsed.success) return { rejected: true, issues: parsed.error.issues };
  const stored = buildProfile(parsed.data);
  return { rejected: false, stored, back: profileToPersonal(stored, units) };
};

const form = (overrides) => ({ ...defaultPersonalForm, ...overrides });

describe("a filled-in profile survives the whole round trip", () => {
  const draft = form({
    name: "Jordan Fields",
    age: "34",
    sex: "Female",
    heightFeet: "5",
    heightInches: "10",
    heightCm: "178",
    weight: "170",
    bodyFat: "22",
    activity: "High",
    timeline: "12 weeks to lose 10 lb",
    experience: "Intermediate",
    trainingDays: ["Monday", "Wednesday", "Friday"],
    goal: "Mobility",
    sleep: "7 - 8 hours",
    nutrition: "High-protein",
    cardio: "Mixed",
    notes: "Back injury, avoid deadlifts"
  });

  test("the schema accepts what the mapper produces", () => {
    expect(save(draft, IMPERIAL).rejected).toBe(false);
  });

  test("the units are converted once, on the way in", () => {
    const { stored } = save(draft, IMPERIAL);

    expect(stored.heightCm).toBe(178);
    expect(stored.weightKg).toBe(77);
  });

  test.each([
    ["name"],
    ["age"],
    ["sex"],
    ["weight"],
    ["bodyFat"],
    ["activity"],
    ["timeline"],
    ["experience"],
    ["goal"],
    ["sleep"],
    ["nutrition"],
    ["cardio"],
    ["notes"],
    ["trainingDays"],
    ["heightFeet"],
    ["heightInches"]
  ])("%s comes back unchanged", (field) => {
    expect(save(draft, IMPERIAL).back[field]).toEqual(draft[field]);
  });
});

describe("an unfilled profile stays unfilled", () => {
  // The invariant the whole repo is built around, asserted across the wire
  // rather than on one side of it: Number("") is 0 and finite, so any coercion
  // that converts before it guards turns a blank field into a measurement.
  test("blank numeric fields reach the database as null, never zero", () => {
    const { stored } = save(form({}), METRIC);

    expect(stored.age).toBeNull();
    expect(stored.heightCm).toBeNull();
    expect(stored.weightKg).toBeNull();
    expect(stored.bodyFat).toBeNull();
  });

  test("and come back as empty fields, never the string zero", () => {
    const { back } = save(form({}), METRIC);

    expect(back.age).toBe("");
    expect(back.weight).toBe("");
    expect(back.bodyFat).toBe("");
  });

  // This is the exact shape of the shipped bug that modelled a user at 3% body
  // fat: everything else filled in, body fat left alone.
  test("an unentered body fat does not become a measurement", () => {
    const { stored } = save(
      form({ name: "A B", age: "30", heightCm: "180", weight: "80", bodyFat: "" }),
      METRIC
    );

    expect(stored.bodyFat).toBeNull();
  });
});

describe("the two sides agree about the awkward cases", () => {
  test("a cleared activity is defaulted by the server and read back as defaulted", () => {
    const { stored, back } = save(form({ activity: "" }), METRIC);

    expect(stored.activity).toBe("Moderate");
    expect(back.activity).toBe("Moderate");
  });

  test("a cleared sex stays cleared, unlike activity", () => {
    expect(save(form({ sex: "" }), METRIC).stored.sex).toBe("");
  });

  test("a metric height and weight survive exactly", () => {
    const { stored, back } = save(form({ heightCm: "181", weight: "77" }), METRIC);

    expect(stored.heightCm).toBe(181);
    expect(back.heightCm).toBe("181");
    expect(back.weight).toBe("77");
  });

  // Imperial height displays to the nearest inch, so a stored centimetre value
  // that is not exactly representable moves once. It must not keep moving --
  // a visitor who opens and saves Settings repeatedly would otherwise shrink.
  test("imperial height drift is one-shot, not cumulative", () => {
    const first = save(form({ heightFeet: "5", heightInches: "11" }), IMPERIAL);
    const second = save(form(first.back), IMPERIAL);

    expect(second.stored.heightCm).toBe(first.stored.heightCm);
  });

  test("a value outside the server's range is rejected rather than coerced", () => {
    expect(save(form({ bodyFat: "0" }), METRIC).rejected).toBe(true);
  });

  test("an unknown training day is rejected rather than silently dropped", () => {
    expect(save(form({ trainingDays: ["Blursday"] }), METRIC).rejected).toBe(true);
  });
});
