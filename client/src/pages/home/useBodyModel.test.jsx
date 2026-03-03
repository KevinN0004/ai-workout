import { renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import useBodyModel from "./useBodyModel";

const toCmFromFeetInches = (feetValue, inchesValue) => {
  const feet = Number(feetValue);
  const inches = Number(inchesValue);
  if (!Number.isFinite(feet) && !Number.isFinite(inches)) return null;
  return ((Number.isFinite(feet) ? feet : 0) * 30.48) + ((Number.isFinite(inches) ? inches : 0) * 2.54);
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
      { initialProps: { personal: { ...BASE_PERSONAL, weight: "150", heightFeet: "5", heightInches: "6" } } }
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
    const male = renderBodyModel({ personal: { sex: "male", weight: "170", heightFeet: "5", heightInches: "8" } });
    const female = renderBodyModel({ personal: { sex: "female", weight: "170", heightFeet: "5", heightInches: "8" } });

    expect(male.result.current.silhouetteShape.shoulderHalf)
      .toBeGreaterThan(female.result.current.silhouetteShape.shoulderHalf);
    expect(female.result.current.silhouetteShape.hipHalf)
      .toBeGreaterThan(male.result.current.silhouetteShape.hipHalf);
  });
});
