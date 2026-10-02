/**
 * The visitor's body as the home page models it: height and weight read from
 * whichever units the form is in, BMI and body fat, whether the profile step is
 * complete, and the silhouette shape PhysiqueSilhouette2D draws. Called by
 * HomePage.
 */
import { useMemo } from "react";

// Guards before it coerces, because `Number("")` and `Number(null)` are both 0
// and both finite -- so testing afterwards turns an unfilled field into a real
// measurement. Same shape as `toNumberOrNull` in the server's rowValues.js.
const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
// The form stores each option's label verbatim ("Moderate", "HIIT",
// "High-protein") and the five option score tables are keyed in lower case, so
// this is what joins them. Without it every one of those lookups would miss
// and fall to its default.
const toLowerText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const roundTo = (value, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

// Where fat sits, by sex: each region's share, and the waist-to-hip ratio from
// lean to high adiposity. They weight how the fat score widens each part of the
// silhouette. `neutral`, for any other answer, is the average of the two.
const MEDICAL_REGION_PROFILES = {
  male: {
    // Regional adipose tendency from DXA population trends:
    // men carry proportionally more trunk fat, with relatively lower gluteofemoral share.
    trunkFatShare: 0.54,
    hipFatShare: 0.17,
    thighFatShare: 0.16,
    armFatShare: 0.09,
    calfFatShare: 0.04,
    // Typical waist-to-hip ratio range by adiposity state (clinical screening guidance).
    whrLean: 0.88,
    whrHighAdiposity: 1.0
  },
  female: {
    // Women generally present higher gluteofemoral fat share with lower trunk bias.
    trunkFatShare: 0.46,
    hipFatShare: 0.22,
    thighFatShare: 0.2,
    armFatShare: 0.08,
    calfFatShare: 0.04,
    whrLean: 0.78,
    whrHighAdiposity: 0.9
  },
  neutral: {
    trunkFatShare: 0.5,
    hipFatShare: 0.195,
    thighFatShare: 0.18,
    armFatShare: 0.085,
    calfFatShare: 0.04,
    whrLean: 0.83,
    whrHighAdiposity: 0.95
  }
};

/**
 * Derives the body model from App's `personal` form. Returns the height in
 * centimetres and the weight in kilograms, each null when it is missing or not
 * positive; `bmi`; `isPersonalComplete`, which gates the personal stage's
 * Continue; `effectiveBodyFat`, the body fat entered or else one estimated from
 * BMI; and the silhouette's shape, with a JSON signature of it.
 *
 * `toCmFromFeetInches` and `toKg` are app/units.js's converters, passed down
 * from App. `silhouetteViewHeight` and `silhouetteFloorInset` place the figure
 * vertically in the silhouette's view box.
 */
export default function useBodyModel({
  personal,
  heightUnit,
  weightUnit,
  toCmFromFeetInches,
  toKg,
  silhouetteViewHeight,
  silhouetteFloorInset
}) {
  // ---- Height, weight and BMI -----------------------------------------------
  // The field for the unit in use wins and the other is the fallback, so a
  // profile holding a height in only one of the two still resolves.
  // personalToProfile in app/profileMapping.js makes the same pick, and the two
  // must agree.
  const resolvedHeightCm = useMemo(() => {
    const fromCmInput = toFiniteNumber(personal.heightCm);
    const fromImperialInput = toFiniteNumber(
      toCmFromFeetInches(personal.heightFeet, personal.heightInches)
    );
    const picked =
      heightUnit === "ft" ? (fromImperialInput ?? fromCmInput) : (fromCmInput ?? fromImperialInput);
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

  // ---- Whether the personal step is complete --------------------------------
  // The five fields HomePersonalStage's hint asks for.
  const ageValue = useMemo(() => toFiniteNumber(personal.age), [personal.age]);
  const hasValidName = Boolean(personal.name?.trim());
  const hasValidAge = ageValue !== null && ageValue >= 10 && ageValue <= 99;
  const isPersonalComplete =
    hasValidName &&
    hasValidAge &&
    resolvedHeightCm !== null &&
    resolvedWeightKg !== null &&
    Boolean(personal.sex);

  // ---- Body fat as entered --------------------------------------------------
  // Blank, null and absent all read as not entered and fall through to the BMI
  // estimate below. An entered "0" is a measurement, and clamps to the floor.
  const explicitBodyFat = useMemo(() => {
    const value = toFiniteNumber(personal.bodyFat);
    return value === null ? null : clamp(value, 3, 60);
  }, [personal.bodyFat]);

  // ---- Lifestyle scores from the Advanced fields ----------------------------
  // Each 0 to 1, with a middling default for an unanswered field.
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

  // Indexed by the number of days chosen, up to seven. None chosen scores above
  // one day.
  const trainingDaysScore = useMemo(() => {
    const total = Array.isArray(personal.trainingDays) ? personal.trainingDays.length : 0;
    const map = [0.35, 0.26, 0.38, 0.52, 0.66, 0.78, 0.88, 0.95];
    const capped = clamp(total, 0, 7);
    return map[capped];
  }, [personal.trainingDays]);

  // ---- Body fat the model uses ----------------------------------------------
  const estimatedBodyFat = useMemo(() => {
    if (bmi === null) return null;
    const estimate = 1.35 * bmi - 13.5;
    return roundTo(clamp(estimate, 3, 60), 1);
  }, [bmi]);

  const effectiveBodyFat = explicitBodyFat ?? estimatedBodyFat;

  // ---- Silhouette shape -----------------------------------------------------
  // The model geometry.js builds the figure from: positions and half-widths in
  // view-box units, fat channels, and the fill colour.
  const silhouetteShape = useMemo(() => {
    // ---- Fat and muscularity scores -----------------------------------------
    // The scores run 0 to 1 and the biases shift them. Body fat leads where it
    // is known, entered or estimated, with BMI behind it.
    const bmiMassScore = bmi !== null ? clamp((bmi - 18.5) / (45 - 18.5), 0, 1) : 0.45;
    const bodyFatMassScore =
      effectiveBodyFat !== null ? clamp((effectiveBodyFat - 8) / (50 - 8), 0, 1) : null;
    const baseFatScore = clamp(
      (bodyFatMassScore !== null ? bodyFatMassScore : bmiMassScore) * 0.74 + bmiMassScore * 0.26,
      0,
      1
    );
    const trainingConsistency = clamp(trainingDaysScore * 0.52 + activityScore * 0.48, 0, 1);
    const conditioningScore = clamp(cardioScore * 0.58 + sleepScore * 0.42, 0, 1);
    const profileMuscleBias = clamp(
      (trainingConsistency - 0.5) * 0.44 +
        (experienceScore - 0.5) * 0.22 +
        (nutritionScore - 0.5) * 0.16,
      -0.34,
      0.36
    );
    const profileFatBias = clamp(
      (conditioningScore - 0.5) * 0.32 + (trainingConsistency - 0.5) * 0.14,
      -0.22,
      0.22
    );
    // 0 without an age. The guard states that rather than causing it:
    // `(null - 40) / 45` clamps to 0 as well.
    const ageAdjustment = ageValue !== null ? clamp((ageValue - 40) / 45, 0, 0.22) : 0;
    const fatScore = clamp(baseFatScore - profileFatBias + ageAdjustment * 0.32, 0, 1);
    const obesityBias = clamp((bmiMassScore - 0.38) / 0.62, 0, 1);
    const adiposityPressure = clamp(fatScore * 0.68 + obesityBias * 0.32, 0, 1);
    const baseMuscularityScore = clamp(bmiMassScore * 0.4 + (1 - baseFatScore) * 0.6, 0, 1);
    const muscularityScore = clamp(
      baseMuscularityScore + profileMuscleBias - ageAdjustment * 0.24 - adiposityPressure * 0.18,
      0,
      1
    );

    // ---- Proportions by sex -------------------------------------------------
    // Landmark heights up from the floor, the head's length, and the breadths
    // and reach, each as a fraction of stature. Any answer but "male" or
    // "female" gets the average of the two.
    const heightNorm = resolvedHeightCm
      ? clamp((resolvedHeightCm - 150) / (205 - 150), 0, 1)
      : 0.48;
    const sexLabel = String(personal.sex || "")
      .trim()
      .toLowerCase();
    const anthropometry =
      sexLabel === "male"
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
    const medicalRegionProfile =
      sexLabel === "male"
        ? MEDICAL_REGION_PROFILES.male
        : sexLabel === "female"
          ? MEDICAL_REGION_PROFILES.female
          : MEDICAL_REGION_PROFILES.neutral;

    // ---- Vertical placement in the view box ---------------------------------
    // y is measured down from the top. A taller visitor stands lower and spans
    // more of the box.
    const legBias = (heightNorm - 0.5) * 18;
    const floorY = silhouetteViewHeight - silhouetteFloorInset;
    const ankleY = floorY + legBias;
    const statureSpan = clamp(silhouetteViewHeight * 0.865 + (heightNorm - 0.5) * 34, 356, 392);
    const headHeight = clamp(
      statureSpan * anthropometry.headHeight * (1 + fatScore * 0.04),
      34,
      56
    );
    const headRadius = clamp(headHeight / 2, 16, 28);
    const headTopY = ankleY - statureSpan;
    const headCenterY = headTopY + headRadius;

    const yFromHeightRatio = (heightRatioFromFloor) => {
      const progressFromTop = (1 - heightRatioFromFloor) / (1 - anthropometry.ankleHeight);
      return headTopY + statureSpan * clamp(progressFromTop, 0, 1);
    };

    const shoulderYRaw = yFromHeightRatio(anthropometry.acromionHeight);
    const waistYRaw = yFromHeightRatio(anthropometry.waistHeight);
    const groinTargetY = yFromHeightRatio(anthropometry.crotchHeight);
    const kneeTargetY = yFromHeightRatio(anthropometry.kneeHeight);
    const chestYRaw = shoulderYRaw + (waistYRaw - shoulderYRaw) * 0.34;
    const thighYRaw = groinTargetY + (kneeTargetY - groinTargetY) * 0.52;
    // Hip and calf are solved back from the groin and knee targets, inverting
    // how buildDerivedMetrics in templateOutline.js derives groin and knee from
    // them, so an unclamped figure puts both at their anthropometric heights.
    const hipYRaw = (groinTargetY - 0.13 * thighYRaw) / 0.87;
    const calfYRaw = (kneeTargetY - 0.62 * thighYRaw) / 0.38;

    const shoulderY = clamp(shoulderYRaw, 84, 132);
    const chestY = clamp(chestYRaw, shoulderY + 18, shoulderY + 82);
    const waistY = clamp(waistYRaw, chestY + 28, chestY + 122);
    const hipY = clamp(hipYRaw, waistY + 20, waistY + 82);
    const thighY = clamp(thighYRaw, hipY + 30, hipY + 96);
    const calfY = clamp(calfYRaw, thighY + 26, ankleY - 20);

    // ---- Half-widths --------------------------------------------------------
    const shoulderBreadth = statureSpan * anthropometry.shoulderBreadth;
    const chestBreadth = statureSpan * anthropometry.chestBreadth;
    const waistBreadth = statureSpan * anthropometry.waistBreadth;
    const hipBreadth = statureSpan * anthropometry.hipBreadth;
    const thighBreadth = statureSpan * anthropometry.thighBreadth;
    const calfBreadth = statureSpan * anthropometry.calfBreadth;
    const armBreadth = statureSpan * anthropometry.armBreadth;
    const trunkFatWeight = clamp(0.74 + medicalRegionProfile.trunkFatShare * 0.66, 0.92, 1.24);
    const hipFatWeight = clamp(0.54 + medicalRegionProfile.hipFatShare * 1.46, 0.72, 1.08);
    const thighFatWeight = clamp(0.5 + medicalRegionProfile.thighFatShare * 1.5, 0.68, 1.08);
    const armFatWeight = clamp(0.54 + medicalRegionProfile.armFatShare * 1.72, 0.62, 1.04);
    const calfFatWeight = clamp(0.42 + medicalRegionProfile.calfFatShare * 1.95, 0.5, 0.92);
    const upperTrunkAdiposity = clamp(
      fatScore * 0.62 * trunkFatWeight + adiposityPressure * 0.48,
      0,
      1.42
    );
    const appendicularAdiposity = clamp(fatScore * 0.54 + adiposityPressure * 0.42, 0, 1.36);
    const lowerLegAdiposity = clamp(
      appendicularAdiposity * 0.58 + fatScore * 0.22 + adiposityPressure * 0.2,
      0,
      1.5
    );

    const shoulderHalf = clamp(
      shoulderBreadth *
        (0.5 +
          muscularityScore * 0.08 +
          upperTrunkAdiposity * 0.09 -
          (1 - muscularityScore) * 0.01),
      30,
      72
    );
    const chestHalfRaw = clamp(
      chestBreadth *
        (0.5 + muscularityScore * 0.06 + upperTrunkAdiposity * 0.2 + adiposityPressure * 0.1),
      22,
      62
    );
    const waistHalfRaw = clamp(
      waistBreadth *
        (0.5 + fatScore * 0.28 * trunkFatWeight + adiposityPressure * 0.2 * trunkFatWeight),
      11,
      52
    );
    const hipHalfRaw = clamp(
      hipBreadth * (0.5 + fatScore * 0.16 * hipFatWeight + adiposityPressure * 0.12 * hipFatWeight),
      18,
      56
    );
    const thighHalf = clamp(
      thighBreadth *
        (0.5 +
          muscularityScore * 0.06 +
          fatScore * 0.17 * thighFatWeight +
          adiposityPressure * 0.14 * thighFatWeight),
      13,
      46
    );
    const calfHalf = clamp(
      calfBreadth *
        (0.5 +
          muscularityScore * 0.06 +
          fatScore * 0.18 * calfFatWeight +
          adiposityPressure * 0.16 * calfFatWeight +
          lowerLegAdiposity * 0.14),
      10,
      36
    );
    const armWidth = clamp(
      armBreadth *
        (0.4 +
          muscularityScore * 0.11 +
          appendicularAdiposity * 0.24 * armFatWeight +
          adiposityPressure * 0.14 * armFatWeight),
      8,
      24
    );
    // Pulls the waist-to-hip ratio toward the one expected for this sex and
    // adiposity: the waist moves most, the hip and chest a little.
    const expectedWhr =
      medicalRegionProfile.whrLean +
      (medicalRegionProfile.whrHighAdiposity - medicalRegionProfile.whrLean) * adiposityPressure;
    const rawWhr = waistHalfRaw / Math.max(hipHalfRaw, 1);
    const whrDelta = clamp(expectedWhr - rawWhr, -0.22, 0.26);
    const waistHalf = clamp(waistHalfRaw * (1 + whrDelta * 0.38), 11, 52);
    const hipHalf = clamp(hipHalfRaw * (1 - whrDelta * 0.2), 18, 56);
    const chestHalf = clamp(chestHalfRaw * (1 + whrDelta * 0.06), 22, 62);
    const armHeight = clamp(statureSpan * anthropometry.armReach, 146, 194);
    const armSpanRatio = anthropometry.armSpanRatio;

    // ---- Colour and soft-tissue channels ------------------------------------
    // The fill is an HSL hue in degrees with saturation and lightness in
    // percent. Nothing downstream reads `strokeLightness` or the three glow
    // values; they only add to the shape's signature.
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
      1.45
    );
    const sideFat = clamp(
      fatScore * 0.82 + (torsoSoftTissueRatio - 0.72) * 1.02 + adiposityPressure * 0.22,
      0,
      1
    );
    const shoulderFat = clamp(
      fatScore * 0.5 + (shoulderHalf / Math.max(chestHalf, 1)) * 0.2 + adiposityPressure * 0.1,
      0,
      1
    );
    const chestFat = clamp(upperTrunkAdiposity * 0.78 + adiposityPressure * 0.14, 0, 1);
    const armFat = clamp(
      appendicularAdiposity * armFatWeight * 0.92 + adiposityPressure * 0.1,
      0,
      1
    );
    const calfFat = clamp(lowerLegAdiposity * calfFatWeight * 1.08 + adiposityPressure * 0.1, 0, 1);

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
      chestFat,
      armFat,
      calfFat,
      lowerLegAdiposity,
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

  // ---- Render signature -----------------------------------------------------
  // HomeVisualizerStage keys the silhouette on it, so the silhouette remounts
  // when the shape changes by value.
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
