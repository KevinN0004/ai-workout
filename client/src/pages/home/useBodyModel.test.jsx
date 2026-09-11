import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import useBodyModel from "./useBodyModel";

const toCmFromFeetInches = (feetValue, inchesValue) => {
  const feet = Number(feetValue);
  const inches = Number(inchesValue);
  if (!Number.isFinite(feet) && !Number.isFinite(inches)) return null;
  return (Number.isFinite(feet) ? feet : 0) * 30.48 + (Number.isFinite(inches) ? inches : 0) * 2.54;
};

const toKg = (weightValue, unit) => {
  const weight = Number(weightValue);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  return unit === "lb" ? weight * 0.45359237 : weight;
};

const BASE_PERSONAL = {
  name: "Test User",
  age: "30",
  sex: "male",
  heightFeet: "5",
  heightInches: "10",
  heightCm: "",
  weight: "180",
  bodyFat: "",
  activity: "moderate",
  experience: "intermediate",
  cardio: "mixed",
  nutrition: "balanced",
  sleep: "7 - 8 hours",
  trainingDays: ["Monday", "Wednesday", "Friday"],
  notes: ""
};

const renderBodyModel = (overrides = {}) => {
  const personal = { ...BASE_PERSONAL, ...(overrides.personal || {}) };
  const heightUnit = overrides.heightUnit || "ft";
  const weightUnit = overrides.weightUnit || "lb";

  return renderHook(() =>
    useBodyModel({
      personal,
      heightUnit,
      weightUnit,
      toCmFromFeetInches,
      toKg,
      silhouetteViewHeight: 430,
      silhouetteFloorInset: 18
    })
  );
};

describe("useBodyModel -> visualizer mapping", () => {
  test("produces a complete profile and silhouette shape for valid personal info", () => {
    const { result } = renderBodyModel();
    expect(result.current.isPersonalComplete).toBe(true);
    expect(result.current.silhouetteShape).toBeTruthy();
    expect(result.current.silhouetteShape.shoulderHalf).toBeGreaterThan(0);
    expect(result.current.silhouetteRenderSignature).toContain("shoulderHalf");
  });

  test("adjusts silhouette dimensions when personal metrics change", () => {
    const { result, rerender } = renderHook(
      ({ personal }) =>
        useBodyModel({
          personal,
          heightUnit: "ft",
          weightUnit: "lb",
          toCmFromFeetInches,
          toKg,
          silhouetteViewHeight: 430,
          silhouetteFloorInset: 18
        }),
      {
        initialProps: {
          personal: { ...BASE_PERSONAL, weight: "150", heightFeet: "5", heightInches: "6" }
        }
      }
    );

    const leanShape = result.current.silhouetteShape;
    const leanSignature = result.current.silhouetteRenderSignature;

    rerender({
      personal: { ...BASE_PERSONAL, weight: "240", heightFeet: "6", heightInches: "2" }
    });

    const heavierShape = result.current.silhouetteShape;
    const heavierSignature = result.current.silhouetteRenderSignature;

    expect(heavierShape.waistHalf).toBeGreaterThan(leanShape.waistHalf);
    expect(heavierShape.hipHalf).toBeGreaterThan(leanShape.hipHalf);
    expect(heavierShape.armWidth).toBeGreaterThan(leanShape.armWidth);
    expect(heavierShape.armHeight).toBeGreaterThan(leanShape.armHeight);
    expect(heavierSignature).not.toBe(leanSignature);
  });

  test("creates visibly larger torso profile for overweight body-fat inputs", () => {
    const lean = renderBodyModel({
      personal: {
        weight: "150",
        heightFeet: "5",
        heightInches: "10",
        bodyFat: "14"
      }
    });
    const overweight = renderBodyModel({
      personal: {
        weight: "280",
        heightFeet: "5",
        heightInches: "10",
        bodyFat: "38"
      }
    });

    const leanShape = lean.result.current.silhouetteShape;
    const overweightShape = overweight.result.current.silhouetteShape;

    expect(overweightShape.waistHalf / leanShape.waistHalf).toBeGreaterThan(1.2);
    expect(overweightShape.hipHalf / leanShape.hipHalf).toBeGreaterThan(1.14);
    expect(overweightShape.chestHalf / leanShape.chestHalf).toBeGreaterThan(1.12);
    expect(overweightShape.shoulderHalf / leanShape.shoulderHalf).toBeGreaterThan(1.03);
    expect(overweightShape.armWidth / leanShape.armWidth).toBeGreaterThan(1.12);
    expect(overweightShape.calfHalf / leanShape.calfHalf).toBeGreaterThan(1.06);
    expect(overweightShape.chestFat).toBeGreaterThan(leanShape.chestFat);
    expect(overweightShape.armFat).toBeGreaterThan(leanShape.armFat);
    expect(overweightShape.calfFat).toBeGreaterThan(leanShape.calfFat);
    expect(overweightShape.lowerLegAdiposity).toBeGreaterThan(leanShape.lowerLegAdiposity);
    expect(overweightShape.sideFat).toBeGreaterThan(leanShape.sideFat);
  });

  test("reflects sex-based anthropometric differences in silhouette", () => {
    const male = renderBodyModel({
      personal: { sex: "male", weight: "170", heightFeet: "5", heightInches: "8" }
    });
    const female = renderBodyModel({
      personal: { sex: "female", weight: "170", heightFeet: "5", heightInches: "8" }
    });

    expect(male.result.current.silhouetteShape.shoulderHalf).toBeGreaterThan(
      female.result.current.silhouetteShape.shoulderHalf
    );
    expect(female.result.current.silhouetteShape.hipHalf).toBeGreaterThan(
      male.result.current.silhouetteShape.hipHalf
    );
  });
});

// Everything above supplies a complete, valid profile. These supply what a
// half-filled form actually holds, which is the case the guards in this hook
// exist for -- and the case CLAUDE.md records three shipped bugs from, because
// `Number("")` and `Number(null)` are both 0 and both finite.
describe("absent and unusable inputs", () => {
  const model = (overrides) => renderBodyModel(overrides).result.current;

  describe("body fat", () => {
    // FINDING, pinned as current behaviour rather than fixed.
    //
    // `toFiniteNumber` here converts before it tests -- `Number("")` is 0 and
    // `Number.isFinite(0)` is true -- so an unentered body fat resolves to 0
    // rather than null, and `clamp(0, 3, 60)` turns it into 3%. The `??` below
    // it then treats 3 as a real answer, so `estimatedBodyFat` is never
    // consulted: a visitor who has entered height and weight but no body fat
    // is modelled at 3% -- leaner than an elite athlete -- rather than at the
    // BMI-derived estimate the code computes for exactly this case.
    //
    // The empty form supplies "" for this field, so this is the default state
    // rather than an edge case. Whether to change it is a product call; that
    // it happens is not.
    test("an unentered body fat resolves to the 3% floor, not the BMI estimate", () => {
      const withoutBodyFat = model({
        personal: { bodyFat: "", heightFeet: "5", heightInches: "11", weight: "180" }
      });

      expect(withoutBodyFat.effectiveBodyFat).toBe(3);
    });

    test("an absent body fat key does reach the BMI estimate", () => {
      // The same field as undefined rather than "" takes the other path, which
      // is what shows the coercion is the cause rather than the intent.
      const personal = { ...BASE_PERSONAL, heightFeet: "5", heightInches: "11", weight: "180" };
      delete personal.bodyFat;
      const { result } = renderHook(() =>
        useBodyModel({
          personal,
          heightUnit: "ft",
          weightUnit: "lb",
          toCmFromFeetInches,
          toKg,
          silhouetteViewHeight: 430,
          silhouetteFloorInset: 18
        })
      );

      expect(result.current.effectiveBodyFat).toBeGreaterThan(10);
    });

    test("an entered body fat is used as given", () => {
      expect(model({ personal: { bodyFat: "22.5" } }).effectiveBodyFat).toBe(22.5);
    });

    test.each([
      ["below the floor", "1", 3],
      ["above the ceiling", "90", 60]
    ])("an implausible body fat %s is clamped", (_label, bodyFat, expected) => {
      expect(model({ personal: { bodyFat } }).effectiveBodyFat).toBe(expected);
    });
  });

  describe("height", () => {
    test.each([
      ["empty", { heightCm: "", heightFeet: "", heightInches: "" }],
      ["zero", { heightCm: "0", heightFeet: "0", heightInches: "0" }],
      ["unusable", { heightCm: "tall", heightFeet: "x", heightInches: "y" }]
    ])("a %s height resolves to nothing rather than to zero", (_label, personal) => {
      // A zero height would make BMI infinite and collapse the silhouette.
      expect(model({ personal, heightUnit: "cm" }).resolvedHeightCm).toBeNull();
    });

    test("is read from centimetres when that is the chosen unit", () => {
      const result = model({
        personal: { heightCm: "180", heightFeet: "5", heightInches: "0" },
        heightUnit: "cm"
      });

      expect(result.resolvedHeightCm).toBe(180);
    });

    test("is read from feet and inches when that is the chosen unit", () => {
      const result = model({
        personal: { heightCm: "180", heightFeet: "6", heightInches: "0" },
        heightUnit: "ft"
      });

      // 6ft is 182.88cm exactly; the imperial reading is preferred over the
      // 180 sitting in the centimetre field.
      expect(result.resolvedHeightCm).toBeCloseTo(182.88, 2);
    });

    test("does not in fact fall back across units, in either direction", () => {
      // SECOND FINDING, same root cause as the body-fat one, pinned the same
      // way.
      //
      // The source reads as a cross-unit fallback:
      //
      //   heightUnit === "ft" ? (fromImperial ?? fromCm) : (fromCm ?? fromImperial)
      //
      // but `??` only falls through on null or undefined, and the same
      // convert-before-test coercion makes an empty field 0 rather than null.
      // The left operand is therefore always a number, the right is never
      // reached, and both fallbacks are dead. A profile carrying a height in
      // only one of the two fields resolves to no height at all.
      //
      // Not a live bug as the app stands: the unit toggle in HomePersonalStage
      // converts and writes the other field before switching, so both are
      // populated in practice. It is defensive code that does not defend,
      // which matters if anything ever sets one field without the other.
      const imperialOnlyInCmMode = model({
        personal: { heightCm: "", heightFeet: "6", heightInches: "0" },
        heightUnit: "cm"
      });
      const metricOnlyInFtMode = model({
        personal: { heightCm: "183", heightFeet: "", heightInches: "" },
        heightUnit: "ft"
      });

      expect(imperialOnlyInCmMode.resolvedHeightCm).toBeNull();
      expect(metricOnlyInFtMode.resolvedHeightCm).toBeNull();
    });
  });

  describe("weight", () => {
    test.each([
      ["empty", ""],
      ["zero", "0"],
      ["unusable", "heavy"]
    ])("a %s weight resolves to nothing rather than to zero", (_label, weight) => {
      expect(model({ personal: { weight } }).resolvedWeightKg).toBeNull();
    });

    test("is converted from the chosen unit", () => {
      expect(model({ personal: { weight: "80" }, weightUnit: "kg" }).resolvedWeightKg).toBe(80);
      // 176lb is 79.83kg; the pound-to-kilo trip is not a round number either way.
      expect(model({ personal: { weight: "176" }, weightUnit: "lb" }).resolvedWeightKg).toBeCloseTo(
        79.83,
        1
      );
    });
  });

  describe("bmi", () => {
    test.each([
      ["height", { heightCm: "", heightFeet: "", heightInches: "" }],
      ["weight", { weight: "" }]
    ])("is nothing at all without a %s", (_label, personal) => {
      expect(model({ personal, heightUnit: "cm" }).bmi).toBeNull();
    });

    test("is computed once both are present", () => {
      const result = model({
        personal: { heightCm: "180", heightFeet: "", heightInches: "", weight: "80" },
        heightUnit: "cm",
        weightUnit: "kg"
      });

      expect(result.bmi).toBe(24.7);
    });
  });

  describe("whether the profile is complete", () => {
    const complete = {
      name: "Ada",
      age: "34",
      sex: "female",
      heightCm: "170",
      heightFeet: "",
      heightInches: "",
      weight: "65"
    };
    const base = (overrides) =>
      model({ personal: { ...complete, ...overrides }, heightUnit: "cm", weightUnit: "kg" });

    test("a full profile is complete", () => {
      expect(base({}).isPersonalComplete).toBe(true);
    });

    test.each([
      ["name", { name: "" }],
      ["a name of only spaces", { name: "   " }],
      ["sex", { sex: "" }],
      ["height", { heightCm: "" }],
      ["weight", { weight: "" }]
    ])("is incomplete without %s", (_label, overrides) => {
      expect(base(overrides).isPersonalComplete).toBe(false);
    });

    test.each([
      ["empty", ""],
      ["too young", "9"],
      ["too old", "100"],
      ["unusable", "grown up"]
    ])("is incomplete with a %s age", (_label, age) => {
      // An empty age coerces to 0, which the range check rejects -- the same
      // coercion that bites body fat is caught here by the bounds.
      expect(base({ age }).isPersonalComplete).toBe(false);
    });

    test.each([["10"], ["99"]])("accepts an age of %s, at the boundary", (age) => {
      expect(base({ age }).isPersonalComplete).toBe(true);
    });
  });

  describe("the descriptive scores", () => {
    const shape = (overrides) => model({ personal: overrides }).silhouetteShape;
    const signature = (overrides) => model({ personal: overrides }).silhouetteRenderSignature;

    // None of these scores are returned, so they are asserted through the
    // silhouette they move. The render signature is the whole shape, which
    // makes "these two profiles are drawn identically" a single comparison.
    describe("reading the stored values", () => {
      test("scores the capitalised labels the form actually stores", () => {
        // Every option in HomePersonalStage stores its label verbatim --
        // "Moderate", "HIIT", "High-protein" -- and every lookup table in this
        // hook is keyed in lower case. toLowerText is the only thing joining
        // the two, so without it every real profile scores at the default
        // instead of at what the visitor chose, silently and for all five
        // fields at once.
        const asStored = {
          activity: "Very high",
          experience: "Advanced",
          cardio: "HIIT",
          nutrition: "High-protein",
          sleep: "More than 8"
        };
        const asKeyed = {
          activity: "very high",
          experience: "advanced",
          cardio: "hiit",
          nutrition: "high-protein",
          sleep: "more than 8"
        };
        const unanswered = {
          activity: "",
          experience: "",
          cardio: "",
          nutrition: "",
          sleep: ""
        };

        expect(signature(asStored)).toBe(signature(asKeyed));
        // and they are not merely both falling through to the defaults
        expect(signature(asStored)).not.toBe(signature(unanswered));
      });

      test("surrounding whitespace does not lose a stored value", () => {
        expect(signature({ activity: "  Very high  " })).toBe(signature({ activity: "very high" }));
      });
    });

    describe("what the scores move", () => {
      test("a higher activity level builds a more muscular silhouette", () => {
        expect(shape({ activity: "Very high" }).shoulderHalf).toBeGreaterThan(
          shape({ activity: "Light" }).shoulderHalf
        );
      });

      test("more training days build a more muscular silhouette", () => {
        // The ladder runs 0.26 to 0.95 over one to seven days, with an
        // unanswered zero sitting at 0.35 rather than below one day -- so the
        // comparison starts at one day, not at none.
        expect(
          shape({ trainingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] }).shoulderHalf
        ).toBeGreaterThan(shape({ trainingDays: ["Mon"] }).shoulderHalf);
      });
    });

    describe("values the current options no longer offer", () => {
      test("an unrecognised activity scores as moderate, not at an extreme", () => {
        // Saved profiles predate the current option list. The fallback is the
        // midpoint of the scale, which is what "Moderate" maps to -- so the two
        // are drawn identically, and neither extreme is.
        expect(signature({ activity: "not a level" })).toBe(signature({ activity: "Moderate" }));
        expect(signature({ activity: "not a level" })).not.toBe(
          signature({ activity: "Very high" })
        );
        expect(signature({ activity: "not a level" })).not.toBe(signature({ activity: "Light" }));
      });

      test.each([
        ["experience", "Beginner", "Advanced"],
        ["cardio", "None", "HIIT"],
        ["nutrition", "Vegan", "High-protein"],
        ["sleep", "Less than 4", "7 - 8 hours"]
      ])("an unrecognised %s falls to one fixed value between the extremes", (field, low, high) => {
        const unknown = signature({ [field]: "not a level" });

        // Two different unrecognised values agreeing is what says they share a
        // fallback, rather than each landing somewhere of its own accord.
        expect(unknown).toBe(signature({ [field]: "something else entirely" }));
        expect(unknown).not.toBe(signature({ [field]: low }));
        expect(unknown).not.toBe(signature({ [field]: high }));
      });

      test("a trainingDays that is not a list is read as unanswered", () => {
        // An older profile can carry a string here. Counting its characters
        // would read "Monday" as six training days.
        expect(signature({ trainingDays: "Monday" })).toBe(signature({ trainingDays: [] }));
        expect(signature({ trainingDays: "Monday" })).not.toBe(
          signature({ trainingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] })
        );
      });
    });

    describe("the silhouette with nothing to go on", () => {
      // Each of these pins a neutral default that only applies when a
      // measurement is missing, and each is compared against the profile whose
      // real measurements produce the value the default would collapse to.
      const noWeight = { weight: "" };
      const veryLight = { weight: "125" }; // a BMI under 18.5, the bottom of the mass scale

      test("a profile with no weight yet is drawn at an average build, not the leanest", () => {
        expect(shape(noWeight).shoulderHalf).toBeGreaterThan(shape(veryLight).shoulderHalf);
      });

      test("with neither a body fat nor a BMI, the build falls back to the middle", () => {
        // An unreadable body fat leaves nothing at all to go on, so the mass
        // estimate comes from the neutral BMI default rather than from zero.
        const unreadable = { weight: "", bodyFat: "unknown" };

        expect(shape(unreadable).waistHalf).toBeGreaterThan(shape(noWeight).waistHalf);
      });

      test("an empty profile still yields a silhouette rather than nothing", () => {
        // The visualizer renders before anything is typed.
        const empty = model({
          personal: {
            name: "",
            age: "",
            sex: "",
            heightCm: "",
            heightFeet: "",
            heightInches: "",
            weight: "",
            bodyFat: "",
            activity: "",
            experience: "",
            cardio: "",
            nutrition: "",
            sleep: "",
            trainingDays: [],
            notes: ""
          },
          heightUnit: "cm"
        });

        expect(empty.silhouetteShape).toBeTruthy();
        expect(empty.isPersonalComplete).toBe(false);
        expect(Number.isFinite(empty.silhouetteShape.shoulderHalf)).toBe(true);
      });
    });
  });
});
