import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import useBodyModel from "./useBodyModel";

// Stands in for app/units.js. The empty case matters and is easy to get wrong:
// the real helper returns "" when neither field holds anything usable, not 0.
// A stub that returned 0 would hand the hook a number where the app hands it an
// empty string, which is exactly the difference the guard in toFiniteNumber
// turns on -- so the stub would quietly test something the app never does.
const toCmFromFeetInches = (feetValue, inchesValue) => {
  const feet = Number(feetValue);
  const inches = Number(inchesValue);
  const totalCm =
    (Number.isFinite(feet) ? feet : 0) * 30.48 + (Number.isFinite(inches) ? inches : 0) * 2.54;
  return totalCm > 0 ? totalCm : "";
};

// Same care as above. The real helper returns "" only for a falsy value, and
// the string "0" is not falsy -- so an entered zero reaches the hook as a zero
// rather than as nothing, which is the distinction the `> 0` check downstream
// exists to make.
const toKg = (weightValue, unit) => {
  if (!weightValue) return "";
  const weight = Number(weightValue);
  if (!Number.isFinite(weight)) return "";
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
    // This used to resolve to 3%, because `toFiniteNumber` converted before it
    // tested: `Number("")` is 0 and `Number.isFinite(0)` is true, so an
    // unentered body fat became an explicit 0, `clamp(0, 3, 60)` lifted it to
    // 3, and the `??` below treated that as a real answer. The visitor was
    // modelled leaner than an elite athlete and `estimatedBodyFat` was
    // unreachable. The guard now runs before the coercion.
    test("an unentered body fat falls back to the BMI estimate", () => {
      const withoutBodyFat = model({
        personal: { bodyFat: "", heightFeet: "5", heightInches: "11", weight: "180" }
      });

      // 5'11" and 180lb is a BMI around 25.1, which the estimate maps to ~20%.
      expect(withoutBodyFat.effectiveBodyFat).toBeGreaterThan(15);
      expect(withoutBodyFat.effectiveBodyFat).toBeLessThan(25);
      expect(withoutBodyFat.effectiveBodyFat).not.toBe(3);
    });

    test("an unentered body fat and an absent one agree", () => {
      // The two spellings of "not given" used to disagree, which is what made
      // the old behaviour hard to see.
      const personal = { ...BASE_PERSONAL, heightFeet: "5", heightInches: "11", weight: "180" };
      delete personal.bodyFat;
      const absent = renderHook(() =>
        useBodyModel({
          personal,
          heightUnit: "ft",
          weightUnit: "lb",
          toCmFromFeetInches,
          toKg,
          silhouetteViewHeight: 430,
          silhouetteFloorInset: 18
        })
      ).result.current;
      const empty = model({
        personal: { bodyFat: "", heightFeet: "5", heightInches: "11", weight: "180" }
      });

      expect(empty.effectiveBodyFat).toBe(absent.effectiveBodyFat);
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

    test("a body fat of null is treated as not given, like an empty one", () => {
      // A restored or cached profile can carry null where the form carries "".
      // These used to disagree: null coerced to 0 and became 3%.
      const asNull = model({ personal: { bodyFat: null, weight: "180" } });
      const asEmpty = model({ personal: { bodyFat: "", weight: "180" } });

      expect(asNull.effectiveBodyFat).toBe(asEmpty.effectiveBodyFat);
      expect(asNull.effectiveBodyFat).not.toBe(3);
    });

    test("an entered zero is a measurement, and is lifted to the floor", () => {
      // Typing 0 is not the same as leaving it blank: it is a reading, and an
      // implausible one, so the 3% floor applies rather than the estimate.
      expect(model({ personal: { bodyFat: "0", weight: "180" } }).effectiveBodyFat).toBe(3);
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

    test("falls back across units rather than giving up, in either direction", () => {
      // The fallback is written out twice:
      //
      //   heightUnit === "ft" ? (fromImperial ?? fromCm) : (fromCm ?? fromImperial)
      //
      // Both halves used to be dead, because the same convert-before-test
      // coercion made an empty field 0 rather than null, so the left operand
      // was always a number and the right was never reached. A profile
      // carrying a height in only one of the two fields resolved to no height
      // at all. Fixing the coercion is what brought this back to life.
      const imperialOnlyInCmMode = model({
        personal: { heightCm: "", heightFeet: "6", heightInches: "0" },
        heightUnit: "cm"
      });
      const metricOnlyInFtMode = model({
        personal: { heightCm: "183", heightFeet: "", heightInches: "" },
        heightUnit: "ft"
      });

      expect(imperialOnlyInCmMode.resolvedHeightCm).toBeCloseTo(182.88, 2);
      expect(metricOnlyInFtMode.resolvedHeightCm).toBe(183);
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

      test("an unreadable body fat and an unentered one are drawn the same", () => {
        // These used to differ: an unentered body fat became 3% while an
        // unreadable one became nothing, so the same absence of information
        // produced two different bodies. Both now leave the mass estimate to
        // the neutral BMI default.
        const unreadable = { weight: "", bodyFat: "unknown" };

        expect(shape(unreadable).waistHalf).toBe(shape(noWeight).waistHalf);
        expect(shape(unreadable).shoulderHalf).toBe(shape(noWeight).shoulderHalf);
      });

      test("with nothing measured the build sits between the extremes, not at one", () => {
        // Three separate neutral defaults carry this case: the BMI mass score,
        // the body-fat mass score, and the age adjustment. Asserting only that
        // it differs from one extreme would pass with any of them collapsed to
        // zero, so it is bracketed from both ends.
        const nothing = { weight: "", heightFeet: "", heightInches: "", age: "" };
        const veryLean = { weight: "125", bodyFat: "6" };
        const veryHeavy = { weight: "300", bodyFat: "45" };

        expect(shape(nothing).waistHalf).toBeGreaterThan(shape(veryLean).waistHalf);
        expect(shape(nothing).waistHalf).toBeLessThan(shape(veryHeavy).waistHalf);
      });

      test("no body fat at all is not the same as a very low one", () => {
        // With no BMI either, the mass estimate has to fall back to the
        // neutral BMI default. Dropping that fallback would score the absence
        // as zero -- which is what an actually-lean reading scores, so the two
        // would become indistinguishable.
        const nothingMeasured = { weight: "", heightFeet: "", heightInches: "" };
        const measuredVeryLean = { weight: "", heightFeet: "", heightInches: "", bodyFat: "5" };

        expect(shape(nothingMeasured).waistHalf).toBeGreaterThan(shape(measuredVeryLean).waistHalf);
      });

      test("an unreadable age is treated as no age rather than as zero", () => {
        // Age only adds to the fat estimate above 40, so a zero would read as
        // a young visitor -- the same answer the absent case gives. What must
        // not happen is it reading as anything else.
        const noAge = { age: "" };
        const unreadableAge = { age: "grown up" };

        expect(shape(unreadableAge).waistHalf).toBe(shape(noAge).waistHalf);
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
