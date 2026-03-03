import { useMemo } from "react";

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toLowerText = (value) => String(value || "").trim().toLowerCase();

const roundTo = (value, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export default function useBodyModel({
  personal,
  heightUnit,
  weightUnit,
  toCmFromFeetInches,
  toKg,
  silhouetteViewHeight,
  silhouetteFloorInset
}) {
  const resolvedHeightCm = useMemo(() => {
    const fromCmInput = toFiniteNumber(personal.heightCm);
    const fromImperialInput = toFiniteNumber(
      toCmFromFeetInches(personal.heightFeet, personal.heightInches)
    );
    const picked = heightUnit === "ft"
      ? fromImperialInput ?? fromCmInput
      : fromCmInput ?? fromImperialInput;
    return picked && picked > 0 ? picked : null;
  }, [
    heightUnit,
    personal.heightCm,
    personal.heightFeet,
    personal.heightInches,
    toCmFromFeetInches
  ]);

  const resolvedWeightKg = useMemo(() => {
    const normalized = toFiniteNumber(toKg(personal.weight, weightUnit));
    return normalized && normalized > 0 ? normalized : null;
  }, [personal.weight, toKg, weightUnit]);

  const bmi = useMemo(() => {
    if (!resolvedHeightCm || !resolvedWeightKg) return null;
    const heightMeters = resolvedHeightCm / 100;
    return Number((resolvedWeightKg / (heightMeters * heightMeters)).toFixed(1));
  }, [resolvedHeightCm, resolvedWeightKg]);

  const ageValue = useMemo(() => toFiniteNumber(personal.age), [personal.age]);
  const hasValidName = Boolean(personal.name?.trim());
  const hasValidAge = ageValue !== null && ageValue >= 10 && ageValue <= 99;
  const isPersonalComplete = hasValidName &&
    hasValidAge &&
    resolvedHeightCm !== null &&
    resolvedWeightKg !== null &&
    Boolean(personal.sex);

  const explicitBodyFat = useMemo(() => {
    const value = toFiniteNumber(personal.bodyFat);
    return value === null ? null : clamp(value, 3, 60);
  }, [personal.bodyFat]);

  const activityScore = useMemo(() => {
    const map = {
      light: 0.28,
      moderate: 0.5,
      high: 0.72,
      "very high": 0.9
    };
    const key = toLowerText(personal.activity);
    return map[key] ?? 0.5;
  }, [personal.activity]);

  const experienceScore = useMemo(() => {
    const map = {
      beginner: 0.3,
      intermediate: 0.58,
      advanced: 0.84
    };
    const key = toLowerText(personal.experience);
    return map[key] ?? 0.5;
  }, [personal.experience]);

  const cardioScore = useMemo(() => {
    const map = {
      none: 0.2,
      walking: 0.45,
      running: 0.78,
      cycling: 0.72,
      rowing: 0.74,
      swimming: 0.76,
      hiit: 0.86,
      mixed: 0.7
    };
    const key = toLowerText(personal.cardio);
    return map[key] ?? 0.5;
  }, [personal.cardio]);

  const nutritionScore = useMemo(() => {
    const map = {
      "no preference": 0.5,
      "high-protein": 0.74,
      balanced: 0.62,
      "low-carb": 0.58,
      vegetarian: 0.54,
      vegan: 0.52
    };
    const key = toLowerText(personal.nutrition);
    return map[key] ?? 0.55;
  }, [personal.nutrition]);

  const sleepScore = useMemo(() => {
    const map = {
      "less than 4": 0.16,
      "4 - 6 hours": 0.42,
      "7 - 8 hours": 0.78,
      "more than 8": 0.72
    };
    const key = toLowerText(personal.sleep);
    return map[key] ?? 0.56;
  }, [personal.sleep]);

  const trainingDaysScore = useMemo(() => {
    const total = Array.isArray(personal.trainingDays) ? personal.trainingDays.length : 0;
    const map = [0.35, 0.26, 0.38, 0.52, 0.66, 0.78, 0.88, 0.95];
    const capped = clamp(total, 0, 7);
    return map[capped];
  }, [personal.trainingDays]);

  const estimatedBodyFat = useMemo(() => {
    if (bmi === null) return null;
    const estimate = 1.35 * bmi - 13.5;
    return roundTo(clamp(estimate, 3, 60), 1);
  }, [bmi]);

  const effectiveBodyFat = explicitBodyFat ?? estimatedBodyFat;

  const silhouetteShape = useMemo(() => {
    const bmiMassScore = bmi !== null ? clamp((bmi - 18.5) / (40 - 18.5), 0, 1) : 0.45;
    const bodyFatMassScore = effectiveBodyFat !== null
      ? clamp((effectiveBodyFat - 8) / (42 - 8), 0, 1)
      : null;
    const baseFatScore = clamp(
      (bodyFatMassScore !== null ? bodyFatMassScore : bmiMassScore) * 0.72 +
        bmiMassScore * 0.28,
      0,
      1
    );
    const trainingConsistency = clamp((trainingDaysScore * 0.52) + (activityScore * 0.48), 0, 1);
    const conditioningScore = clamp((cardioScore * 0.58) + (sleepScore * 0.42), 0, 1);
    const profileMuscleBias = clamp(
      ((trainingConsistency - 0.5) * 0.44) +
        ((experienceScore - 0.5) * 0.22) +
        ((nutritionScore - 0.5) * 0.16),
      -0.34,
      0.36
    );
    const profileFatBias = clamp(
      ((conditioningScore - 0.5) * 0.32) +
        ((trainingConsistency - 0.5) * 0.14),
      -0.22,
      0.22
    );
    const ageAdjustment = ageValue !== null
      ? clamp((ageValue - 40) / 45, 0, 0.22)
      : 0;
    const fatScore = clamp(baseFatScore - profileFatBias + (ageAdjustment * 0.32), 0, 1);
    const baseMuscularityScore = clamp((bmiMassScore * 0.64) + ((1 - baseFatScore) * 0.36), 0, 1);
    const muscularityScore = clamp(baseMuscularityScore + profileMuscleBias - (ageAdjustment * 0.24), 0, 1);

    const heightNorm = resolvedHeightCm
      ? clamp((resolvedHeightCm - 150) / (205 - 150), 0, 1)
      : 0.48;
    const sexLabel = String(personal.sex || "").trim().toLowerCase();
    const anthropometry = sexLabel === "male"
      ? {
          headHeight: 0.132,
          acromionHeight: 0.824,
          waistHeight: 0.583,
          crotchHeight: 0.444,
          kneeHeight: 0.27,
          ankleHeight: 0.041,
          shoulderBreadth: 0.259,
          chestBreadth: 0.181,
          waistBreadth: 0.154,
          hipBreadth: 0.191,
          thighBreadth: 0.118,
          calfBreadth: 0.081,
          armBreadth: 0.084,
          armReach: 0.455,
          armSpanRatio: 1
        }
      : sexLabel === "female"
        ? {
            headHeight: 0.131,
            acromionHeight: 0.824,
            waistHeight: 0.596,
            crotchHeight: 0.445,
            kneeHeight: 0.269,
            ankleHeight: 0.04,
            shoulderBreadth: 0.242,
            chestBreadth: 0.171,
            waistBreadth: 0.153,
            hipBreadth: 0.214,
            thighBreadth: 0.126,
            calfBreadth: 0.085,
            armBreadth: 0.078,
            armReach: 0.451,
            armSpanRatio: 1
          }
        : {
            headHeight: 0.1315,
            acromionHeight: 0.824,
            waistHeight: 0.5895,
            crotchHeight: 0.4445,
            kneeHeight: 0.2695,
            ankleHeight: 0.0405,
            shoulderBreadth: 0.2505,
            chestBreadth: 0.176,
            waistBreadth: 0.1535,
            hipBreadth: 0.2025,
            thighBreadth: 0.122,
            calfBreadth: 0.083,
            armBreadth: 0.081,
            armReach: 0.453,
            armSpanRatio: 1
          };

    const legBias = (heightNorm - 0.5) * 18;
    const floorY = silhouetteViewHeight - silhouetteFloorInset;
    const ankleY = floorY + legBias;
    const statureSpan = clamp((silhouetteViewHeight * 0.865) + ((heightNorm - 0.5) * 34), 356, 392);
    const headHeight = clamp(
      statureSpan * anthropometry.headHeight * (1 + (fatScore * 0.04)),
      34,
      56
    );
    const headRadius = clamp(headHeight / 2, 16, 28);
    const headTopY = ankleY - statureSpan;
    const headCenterY = headTopY + headRadius;

    const yFromHeightRatio = (heightRatioFromFloor) => {
      const progressFromTop = (1 - heightRatioFromFloor) / (1 - anthropometry.ankleHeight);
      return headTopY + (statureSpan * clamp(progressFromTop, 0, 1));
    };

    const shoulderYRaw = yFromHeightRatio(anthropometry.acromionHeight);
    const waistYRaw = yFromHeightRatio(anthropometry.waistHeight);
    const groinTargetY = yFromHeightRatio(anthropometry.crotchHeight);
    const kneeTargetY = yFromHeightRatio(anthropometry.kneeHeight);
    const chestYRaw = shoulderYRaw + ((waistYRaw - shoulderYRaw) * 0.34);
    const thighYRaw = groinTargetY + ((kneeTargetY - groinTargetY) * 0.52);
    const hipYRaw = (groinTargetY - (0.13 * thighYRaw)) / 0.87;
    const calfYRaw = (kneeTargetY - (0.62 * thighYRaw)) / 0.38;

    const shoulderY = clamp(shoulderYRaw, 84, 132);
    const chestY = clamp(chestYRaw, shoulderY + 18, shoulderY + 82);
    const waistY = clamp(waistYRaw, chestY + 28, chestY + 122);
    const hipY = clamp(hipYRaw, waistY + 20, waistY + 82);
    const thighY = clamp(thighYRaw, hipY + 30, hipY + 96);
    const calfY = clamp(calfYRaw, thighY + 26, ankleY - 20);

    const shoulderBreadth = statureSpan * anthropometry.shoulderBreadth;
    const chestBreadth = statureSpan * anthropometry.chestBreadth;
    const waistBreadth = statureSpan * anthropometry.waistBreadth;
    const hipBreadth = statureSpan * anthropometry.hipBreadth;
    const thighBreadth = statureSpan * anthropometry.thighBreadth;
    const calfBreadth = statureSpan * anthropometry.calfBreadth;
    const armBreadth = statureSpan * anthropometry.armBreadth;

    const shoulderHalf = clamp(
      (shoulderBreadth * (0.5 + (muscularityScore * 0.06) + (fatScore * 0.02))),
      30,
      72
    );
    const chestHalf = clamp(
      (chestBreadth * (0.5 + (muscularityScore * 0.05) + (fatScore * 0.05))),
      22,
      62
    );
    const waistHalf = clamp(
      (waistBreadth * (0.5 + (fatScore * 0.17))),
      11,
      52
    );
    const hipHalf = clamp(
      (hipBreadth * (0.5 + (fatScore * 0.08))),
      18,
      56
    );
    const thighHalf = clamp(
      (thighBreadth * (0.5 + (muscularityScore * 0.06) + (fatScore * 0.09))),
      13,
      46
    );
    const calfHalf = clamp(
      (calfBreadth * (0.5 + (muscularityScore * 0.05) + (fatScore * 0.06))),
      10,
      34
    );
    const armWidth = clamp(
      (armBreadth * (0.4 + (muscularityScore * 0.12) + (fatScore * 0.1))),
      8,
      24
    );
    const armHeight = clamp(statureSpan * anthropometry.armReach, 146, 194);
    const armSpanRatio = anthropometry.armSpanRatio;

    const fillHue = 24 - fatScore * 4;
    const fillSaturation = clamp(44 + fatScore * 18, 40, 82);
    const fillLightness = clamp(56 - fatScore * 10, 36, 68);
    const strokeLightness = clamp(fillLightness - 24, 20, 48);
    const glowSaturation = clamp(fillSaturation + 8, 46, 94);
    const glowAlpha = clamp(0.08 + fatScore * 0.12, 0.06, 0.24);
    const glowRadius = clamp(112 + waistHalf * 0.7 + hipHalf * 0.45, 118, 176);
    const torsoSoftTissueRatio = clamp(
      (waistHalf + hipHalf) / Math.max(1, chestHalf + shoulderHalf),
      0.64,
      1.2
    );
    const sideFat = clamp((fatScore * 0.7) + ((torsoSoftTissueRatio - 0.72) * 0.85), 0, 1);
    const shoulderFat = clamp((fatScore * 0.56) + ((shoulderHalf / Math.max(chestHalf, 1)) * 0.24), 0, 1);

    return {
      shoulderHalf,
      chestHalf,
      waistHalf,
      hipHalf,
      thighHalf,
      calfHalf,
      armWidth,
      armHeight,
      headRadius,
      shoulderY,
      chestY,
      waistY,
      hipY,
      thighY,
      calfY,
      ankleY,
      headCenterY,
      fillHue,
      fillSaturation,
      fillLightness,
      strokeLightness,
      glowSaturation,
      glowAlpha,
      glowRadius,
      sideFat,
      shoulderFat,
      armSpanRatio
    };
  }, [
    activityScore,
    ageValue,
    bmi,
    cardioScore,
    effectiveBodyFat,
    experienceScore,
    nutritionScore,
    personal.sex,
    resolvedHeightCm,
    sleepScore,
    silhouetteFloorInset,
    silhouetteViewHeight,
    trainingDaysScore
  ]);

  const silhouetteRenderSignature = useMemo(
    () => JSON.stringify(silhouetteShape),
    [silhouetteShape]
  );

  return {
    resolvedHeightCm,
    resolvedWeightKg,
    bmi,
    isPersonalComplete,
    effectiveBodyFat,
    silhouetteShape,
    silhouetteRenderSignature
  };
}
