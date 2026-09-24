import { describe, expect, test } from "vitest";
import { personalToProfile, profileToPersonal, toProfileNumber } from "../profileMapping";

// The two shapes disagree about names, about units, and about how they spell
// "no value": `personal` uses "" because it backs form inputs, `profile` uses
// null because it is stored.
//
// Units are the sharp edge. `personal.weight` is a single field holding the
// number in whatever unit is active, so a mapper that ignores the unit stores
// 170 lb as 170 kg. Height has the same problem in the other direction: the cm
// field and the feet/inches fields both exist, and whichever one the user is
// not currently typing into is stale.

describe("toProfileNumber", () => {
  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined]
  ])("treats %s as absent", (_label, value) => {
    expect(toProfileNumber(value)).toBeNull();
  });

  // Both spellings matter. A guard written as `if (!value)` still passes the
  // string "0", which is truthy, and only fails on the number -- so testing the
  // string alone lets the forbidden falsiness guard through.
  test.each([
    ["a numeric string", "0"],
    ["a number", 0]
  ])("keeps a measured zero given as %s", (_label, value) => {
    expect(toProfileNumber(value)).toBe(0);
  });

  test("parses a real measurement", () => {
    expect(toProfileNumber("34")).toBe(34);
  });

  test("treats a non-numeric string as absent", () => {
    expect(toProfileNumber("not-a-number")).toBeNull();
  });
});

describe("personalToProfile", () => {
  test("splits the display name into first and last", () => {
    expect(personalToProfile({ name: "Jordan Fields" })).toMatchObject({
      firstName: "Jordan",
      lastName: "Fields"
    });
  });

  test("sends an unfilled body fat as null, not zero", () => {
    expect(personalToProfile({ bodyFat: "" }).bodyFat).toBeNull();
  });

  test("keeps an entered body fat of zero", () => {
    expect(personalToProfile({ bodyFat: "0" }).bodyFat).toBe(0);
  });

  // The bug this signature exists to prevent: without the unit, 170 lb is
  // stored as 170 kg, which is 375 lb.
  test("converts pounds to kilograms before storing", () => {
    expect(personalToProfile({ weight: "170" }, { weightUnit: "lb" }).weightKg).toBe(77);
  });

  test("stores kilograms unchanged", () => {
    expect(personalToProfile({ weight: "77" }, { weightUnit: "kg" }).weightKg).toBe(77);
  });

  test("sends an unfilled weight as null", () => {
    expect(personalToProfile({ weight: "" }, { weightUnit: "lb" }).weightKg).toBeNull();
  });

  // The active unit decides which height input wins, matching useBodyModel.
  // The other field is stale whenever the user is typing in the first one.
  test("takes height from feet and inches while the imperial unit is active", () => {
    const profile = personalToProfile(
      { heightCm: "180", heightFeet: "5", heightInches: "10" },
      { heightUnit: "ft" }
    );
    expect(profile.heightCm).toBe(178);
  });

  test("takes height from centimetres while the metric unit is active", () => {
    const profile = personalToProfile(
      { heightCm: "180", heightFeet: "5", heightInches: "10" },
      { heightUnit: "cm" }
    );
    expect(profile.heightCm).toBe(180);
  });

  test("falls back across units when the active unit's field is empty", () => {
    expect(
      personalToProfile({ heightCm: "180", heightFeet: "", heightInches: "" }, { heightUnit: "ft" })
        .heightCm
    ).toBe(180);
  });

  test("defaults to metric when no units are supplied", () => {
    expect(personalToProfile({ weight: "77", heightCm: "180" }).weightKg).toBe(77);
  });

  test("carries the training and lifestyle fields straight through", () => {
    expect(
      personalToProfile({
        sleep: "7 - 8 hours",
        timeline: "3 months",
        experience: "Intermediate",
        nutrition: "High-protein",
        cardio: "Mixed",
        goal: "Mobility",
        trainingDays: ["Monday"]
      })
    ).toMatchObject({
      sleep: "7 - 8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "Mixed",
      goal: "Mobility",
      trainingDays: ["Monday"]
    });
  });

  test("never sends a non-array trainingDays", () => {
    expect(personalToProfile({ trainingDays: "Monday" }).trainingDays).toEqual([]);
  });

  test.each([
    ["sex", "Female"],
    ["activity", "High"],
    ["notes", "Back injury, avoid deadlifts"]
  ])("carries a populated %s through", (field, value) => {
    expect(personalToProfile({ [field]: value })[field]).toBe(value);
  });
});

// A default parameter only fires on undefined, and this is a shared module a
// future caller can reach with an explicit null. Neither argument may throw.
describe("defensive arguments", () => {
  test.each([
    ["no arguments at all", undefined, undefined],
    ["a null subject", null, undefined],
    ["null units", {}, null],
    ["both null", null, null]
  ])("personalToProfile survives %s", (_label, subject, units) => {
    expect(() => personalToProfile(subject, units)).not.toThrow();
  });

  test.each([
    ["no arguments at all", undefined, undefined],
    ["a null subject", null, undefined],
    ["null units", {}, null],
    ["both null", null, null]
  ])("profileToPersonal survives %s", (_label, subject, units) => {
    expect(() => profileToPersonal(subject, units)).not.toThrow();
  });
});

describe("profileToPersonal", () => {
  test("joins first and last into the display name", () => {
    expect(profileToPersonal({ firstName: "Jordan", lastName: "Fields" }).name).toBe(
      "Jordan Fields"
    );
  });

  test("renders a null measurement as an empty form field, not zero", () => {
    const personal = profileToPersonal({ age: null, weightKg: null, bodyFat: null });

    expect(personal.age).toBe("");
    expect(personal.weight).toBe("");
    expect(personal.bodyFat).toBe("");
  });

  test("keeps a stored zero visible in the form", () => {
    expect(profileToPersonal({ bodyFat: 0 }).bodyFat).toBe("0");
  });

  test("shows weight in pounds when the imperial unit is active", () => {
    expect(profileToPersonal({ weightKg: 77 }, { weightUnit: "lb" }).weight).toBe("170");
  });

  test("shows weight in kilograms when the metric unit is active", () => {
    expect(profileToPersonal({ weightKg: 77 }, { weightUnit: "kg" }).weight).toBe("77");
  });

  test("fills both height representations", () => {
    const personal = profileToPersonal({ heightCm: 178 });

    expect(personal.heightCm).toBe("178");
    expect(personal.heightFeet).toBe("5");
    expect(personal.heightInches).toBe("10");
  });

  test("defaults trainingDays to an array", () => {
    expect(profileToPersonal({ trainingDays: null }).trainingDays).toEqual([]);
  });

  // These three were carried correctly but nothing asserted it, so deleting any
  // of them fell through to the defaultPersonalForm spread and every test still
  // passed -- the defaults are "" and "Moderate", which is what the assertions
  // would have seen anyway. Populated values are what discriminate.
  test.each([
    ["sex", "Female"],
    ["notes", "Back injury, avoid deadlifts"]
  ])("carries a populated %s through", (field, value) => {
    expect(profileToPersonal({ [field]: value })[field]).toBe(value);
  });

  test("carries a populated activity through", () => {
    expect(profileToPersonal({ activity: "High" }).activity).toBe("High");
  });

  // Not a round trip to "", and deliberately so: buildProfile falls an
  // unrecognised activity back to "Moderate" while sex falls back to "". A
  // cleared activity really is stored as "Moderate", so reading it back that way
  // reports what happened rather than inventing it.
  test("fills a cleared activity with the default, mirroring the server", () => {
    expect(profileToPersonal({ activity: "" }).activity).toBe("Moderate");
    expect(profileToPersonal({ sex: "" }).sex).toBe("");
  });

  test("supplies the rest of the personal form so callers get a complete shape", () => {
    expect(profileToPersonal({})).toHaveProperty("notes", "");
  });
});

describe("round trips", () => {
  test("weight survives a metric round trip exactly", () => {
    const personal = profileToPersonal({ weightKg: 77 }, { weightUnit: "kg" });
    expect(personalToProfile(personal, { weightUnit: "kg" }).weightKg).toBe(77);
  });

  test("weight survives an imperial round trip exactly", () => {
    const personal = profileToPersonal({ weightKg: 77 }, { weightUnit: "lb" });
    expect(personalToProfile(personal, { weightUnit: "lb" }).weightKg).toBe(77);
  });

  test("height survives a metric round trip exactly", () => {
    const personal = profileToPersonal({ heightCm: 181 });
    expect(personalToProfile(personal, { heightUnit: "cm" }).heightCm).toBe(181);
  });

  // Imperial height is displayed to the nearest inch, so a stored centimetre
  // value that is not exactly representable moves by at most 1cm the first time
  // an imperial user saves. Measured across 140-210cm: 43 of 71 values shift,
  // never by more than 1cm, and never again afterwards -- the second save is a
  // fixed point. This is a property of showing height in whole inches, not a
  // defect, and it is pinned here so nobody rediscovers it as a mystery.
  test("imperial height moves by at most one centimetre, once", () => {
    const first = personalToProfile(profileToPersonal({ heightCm: 181 }), {
      heightUnit: "ft"
    }).heightCm;
    const second = personalToProfile(profileToPersonal({ heightCm: first }), {
      heightUnit: "ft"
    }).heightCm;

    expect(Math.abs(first - 181)).toBeLessThanOrEqual(1);
    expect(second).toBe(first);
  });

  test("the training and lifestyle fields survive a round trip unchanged", () => {
    const personal = {
      sleep: "7 - 8 hours",
      timeline: "3 months",
      experience: "Intermediate",
      nutrition: "High-protein",
      cardio: "Mixed",
      goal: "Mobility",
      trainingDays: ["Monday", "Wednesday"]
    };

    expect(profileToPersonal(personalToProfile(personal))).toMatchObject(personal);
  });
});
