import {
  clamp,
  mirrorX,
  toFiniteNumber,
  interpolateBandWidth
} from "./math";
import { buildSymmetricOutline } from "./outlineGeometry";
import { appendDefaultGuides } from "./guideLayout";
import { buildPhysiquePalette } from "./palette";
import { buildTemplateOutline } from "./templateOutline";

export const VIEWBOX_WIDTH = 430;
const CENTER_X = VIEWBOX_WIDTH / 2;
export const VIEWBOX_HEIGHT = 430;
const FINGER_CONFIGS = [
  { id: "thumb", profile: 0.76, yOffsetScale: -0.22, jointCurve: -0.2, xSplayScale: -0.22 },
  { id: "index", profile: 0.96, yOffsetScale: -0.1, jointCurve: -0.08, xSplayScale: -0.08 },
  { id: "middle", profile: 1.1, yOffsetScale: 0, jointCurve: 0, xSplayScale: 0.04 },
  { id: "ring", profile: 1.0, yOffsetScale: 0.1, jointCurve: 0.08, xSplayScale: 0.16 },
  { id: "pinky", profile: 0.86, yOffsetScale: 0.2, jointCurve: 0.16, xSplayScale: 0.28 }
];
export const SILHOUETTE_GEOMETRY_REV = "outer-envelope-r20";
let devHotReloadTick = 0;
if (import.meta.hot) {
  devHotReloadTick = (import.meta.hot.data?.silhouetteHotReloadTick || 0) + 1;
  import.meta.hot.data.silhouetteHotReloadTick = devHotReloadTick;
}
export const DEV_HOT_RELOAD_TOKEN = import.meta.env.DEV
  ? `${SILHOUETTE_GEOMETRY_REV}-hmr-${devHotReloadTick}`
  : SILHOUETTE_GEOMETRY_REV;
const MEDICAL_RATIOS = {
  // CDC Series 11 No. 35: biacromial/stature index avg (men 22.5, women 21.7)
  biacromialToStature: (22.5 + 21.7) / 200,
  // NCHS Vital Health Stat 3(50): upper arm length and upper leg length means (adults 20+)
  upperArmToStature: ((39.6 / 175.1) + (36.2 / 161.2)) / 2,
  upperLegToStature: ((41.0 / 175.1) + (36.8 / 161.2)) / 2,
  // MASH (PMCID: PMC10967733): average forearm and shank ratios
  forearmToStature: 0.152,
  shankToStature: 0.219,
  // CDC Series 11 No. 35: cormic index avg (men 51.8, women 52.4)
  sittingToStature: (51.8 + 52.4) / 200
};


export const buildPhysiqueSilhouetteGeometry = (shape = {}) => {
    const fallback = {
      shoulderHalf: 46,
      chestHalf: 38,
      waistHalf: 27,
      hipHalf: 34,
      thighHalf: 27,
      calfHalf: 20,
      armWidth: 14,
      armHeight: 170,
      headRadius: 20,
      shoulderY: 100,
      chestY: 142,
      waistY: 217,
      hipY: 262,
      thighY: 320,
      calfY: 374,
      ankleY: 414,
      headCenterY: 54,
      fillHue: 22,
      fillSaturation: 58,
      fillLightness: 50
    };
    const model = { ...fallback, ...(shape || {}) };

    const shoulderHalf = clamp(toFiniteNumber(model.shoulderHalf, fallback.shoulderHalf), 30, 74);
    const chestHalf = clamp(
      toFiniteNumber(model.chestHalf, fallback.chestHalf),
      22,
      Math.max(24, shoulderHalf - 2)
    );
    const waistHalf = clamp(toFiniteNumber(model.waistHalf, fallback.waistHalf), 11, 52);
    const hipHalf = clamp(toFiniteNumber(model.hipHalf, fallback.hipHalf), 18, 56);
    const thighHalf = clamp(toFiniteNumber(model.thighHalf, fallback.thighHalf), 13, 46);
    const calfHalf = clamp(toFiniteNumber(model.calfHalf, fallback.calfHalf), 10, 36);
    const armWidth = clamp(toFiniteNumber(model.armWidth, fallback.armWidth), 8, 24);
    const armHeight = clamp(toFiniteNumber(model.armHeight, fallback.armHeight), 146, 194);
    const headRadius = clamp(toFiniteNumber(model.headRadius, fallback.headRadius), 15, 28);
    const headRadiusX = clamp(headRadius * 0.86, 13.4, 25.6);
    const headRadiusY = clamp(headRadius * 1.14, 17, 31.2);
    const derivedSideFat = clamp(
      (((chestHalf + waistHalf + hipHalf) / 3) - 24) / 24,
      0,
      1
    );
    const derivedShoulderFat = clamp(
      ((shoulderHalf - 34) / 34) * 0.6 + ((armWidth - 8) / 16) * 0.4,
      0,
      1
    );
    const sideFat = clamp(toFiniteNumber(model.sideFat, derivedSideFat), 0, 1);
    const shoulderFat = clamp(toFiniteNumber(model.shoulderFat, derivedShoulderFat), 0, 1);

    const headCenterY = clamp(toFiniteNumber(model.headCenterY, fallback.headCenterY), 40, 72);
    const headTopY = headCenterY - headRadiusY;
    const chinY = headCenterY + headRadiusY;
    const neckBaseY = chinY + headRadiusY * 0.28;

    const shoulderY = clamp(toFiniteNumber(model.shoulderY, fallback.shoulderY), neckBaseY + 9, 138);
    const chestY = clamp(toFiniteNumber(model.chestY, fallback.chestY), shoulderY + 18, shoulderY + 80);
    const waistY = clamp(toFiniteNumber(model.waistY, fallback.waistY), chestY + 28, chestY + 122);
    const hipY = clamp(toFiniteNumber(model.hipY, fallback.hipY), waistY + 20, waistY + 82);
    const thighY = clamp(toFiniteNumber(model.thighY, fallback.thighY), hipY + 30, hipY + 96);
    const calfY = clamp(toFiniteNumber(model.calfY, fallback.calfY), thighY + 26, thighY + 96);
    const ankleY = clamp(
      toFiniteNumber(model.ankleY, fallback.ankleY),
      calfY + 20,
      VIEWBOX_HEIGHT - 24
    );
    const statureSpan = Math.max(300, ankleY - headTopY);
    const kneeYFromMarkers = thighY + ((calfY - thighY) * 0.38);
    const thighShare = MEDICAL_RATIOS.upperLegToStature /
      (MEDICAL_RATIOS.upperLegToStature + MEDICAL_RATIOS.shankToStature);
    const kneeYFromSkeletalRatio = hipY + ((ankleY - hipY) * thighShare);
    const kneeY = clamp(
      (kneeYFromMarkers * 0.44) + (kneeYFromSkeletalRatio * 0.56),
      thighY + 8,
      calfY + 16
    );
    const sittingHeightY = headTopY + (statureSpan * MEDICAL_RATIOS.sittingToStature);
    const groinY = clamp(
      ((hipY + ((thighY - hipY) * 0.13)) * 0.68) + (sittingHeightY * 0.32),
      hipY + 2,
      thighY - 7
    );
    const pelvisY = hipY + ((thighY - hipY) * 0.24);

    const neckHalf = clamp(headRadiusX * 0.34 + shoulderHalf * 0.048, 7.6, shoulderHalf * 0.38);
    const headArcAngles = [-76, -62, -48, -34, -20, -6, 8, 22, 36, 50];
    const rightHeadArc = headArcAngles.map((angle) => {
      const radians = (angle * Math.PI) / 180;
      return {
        x: CENTER_X + (headRadiusX * Math.cos(radians)),
        y: headCenterY + (headRadiusY * Math.sin(radians))
      };
    });
    const jawRight = rightHeadArc[rightHeadArc.length - 1];
    const neckCurveUpperX = CENTER_X + clamp(neckHalf * 0.96, neckHalf - 0.4, headRadiusX * 0.9);
    const neckCurveUpperY = neckBaseY - clamp(headRadiusY * 0.04, 0.5, 1.4);
    const neckCurveMidX = CENTER_X + clamp(neckHalf * 1.06, neckHalf + 0.2, neckHalf + 3.4);
    const neckCurveMidY = neckBaseY + clamp((shoulderY - neckBaseY) * 0.42, 4.2, 14.4);
    const neckCurveLowerX = CENTER_X + clamp(neckHalf * 1.16, neckHalf + 0.8, neckHalf + 4.8);
    const neckCurveLowerY = neckBaseY + clamp((shoulderY - neckBaseY) * 0.68, 6.2, 20.4);
    let trapCurveX = CENTER_X + neckHalf;
    let trapCurveY = shoulderY;
    let trapShoulderX = CENTER_X + neckHalf;
    let trapShoulderY = shoulderY;
    let shoulderCapX = CENTER_X;
    let shoulderCapY = shoulderY;
    let shoulderRearX = CENTER_X;
    let shoulderRearY = shoulderY;
    let shoulderLowerX = CENTER_X;
    let shoulderLowerY = shoulderY;
    let shoulderArmTopX = CENTER_X;
    let shoulderArmTopY = shoulderY;
    let shoulderArmBottomX = CENTER_X;
    let shoulderArmBottomY = shoulderY;
    const groinHalf = clamp(hipHalf * 0.18, 5, 12);
    const kneeHalf = clamp((thighHalf * 0.64) + (calfHalf * 0.24), 10, Math.max(12, thighHalf * 0.96));
    const ankleHalf = clamp(calfHalf * 0.46, 6, 18);

    const widthBands = [
      { y: neckBaseY, w: neckHalf },
      { y: shoulderY, w: shoulderHalf },
      { y: chestY, w: chestHalf },
      { y: waistY, w: waistHalf },
      { y: hipY, w: hipHalf },
      { y: groinY, w: groinHalf },
      { y: thighY, w: thighHalf },
      { y: kneeY, w: kneeHalf },
      { y: calfY, w: calfHalf },
      { y: ankleY, w: ankleHalf }
    ];
    const widthAt = (y) => interpolateBandWidth(widthBands, y);
    const torsoSideBulge = clamp((sideFat * 8.8) + (shoulderFat * 1.2), 0, 13.2);
    const upperTorsoBulge = torsoSideBulge * 0.36;
    const midTorsoBulge = torsoSideBulge * 0.58;
    const lowerTorsoBulge = torsoSideBulge * 0.82;
    const shoulderSoftPad = clamp((shoulderFat * 4.4) + (sideFat * 1.35), 0.4, 7.6);
    const shoulderLowerSoft = clamp((shoulderFat * 2.8) + (sideFat * 0.9), 0, 4.6);

    const shoulderStarSpread = clamp(2.4 + (armWidth * 0.18), 2.4, 8.2);
    const shoulderJointOffset = clamp(armWidth * 0.46, 2.6, 8);
    const medicalShoulderHalf = statureSpan * MEDICAL_RATIOS.biacromialToStature * 0.5;
    const shoulderFrameDelta = clamp((medicalShoulderHalf - shoulderHalf) * 0.82, -6.6, 6.6);
    const shoulderX = CENTER_X + widthAt(shoulderY) + shoulderStarSpread + shoulderSoftPad + shoulderFrameDelta;
    trapCurveX = CENTER_X + neckHalf + ((shoulderX - (CENTER_X + neckHalf)) * 0.42);
    const trapLift = clamp((armWidth * 0.22) + (shoulderHalf * 0.013), 1.4, 4.6);
    trapCurveY = shoulderY - (trapLift * (1 - shoulderFat * 0.18));
    trapShoulderX = trapCurveX + ((shoulderX - trapCurveX) * 0.5);
    trapShoulderY = trapCurveY +
      ((shoulderY - trapCurveY) * 0.34) -
      clamp(armWidth * 0.06, 0.3, 1.2) +
      (shoulderFat * 0.24);
    shoulderCapX = shoulderX + clamp((armWidth * 0.34) + (shoulderFat * 2.4), 2.2, 9.2);
    shoulderCapY = shoulderY - clamp(armWidth * (0.28 - shoulderFat * 0.09), 0.8, 4.2);
    shoulderRearX = shoulderX + clamp((armWidth * 0.16) + (shoulderFat * 2.2), 1.4, 6.2);
    shoulderRearY = shoulderY + clamp((armWidth * 0.32) + (shoulderLowerSoft * 0.68), 2.2, 8.2);
    shoulderLowerX = shoulderX + clamp((armWidth * 0.24) + (shoulderFat * 2.8), 1.8, 8.4);
    shoulderLowerY = shoulderY + clamp((armWidth * 0.56) + shoulderLowerSoft, 3.4, 11.8);
    shoulderArmTopX = shoulderX + clamp((armWidth * 0.3) + (shoulderFat * 1.2), 2.1, 5.8);
    shoulderArmTopY = shoulderY - (shoulderJointOffset * 0.74);
    const shoulderCrestX = shoulderCapX + ((shoulderArmTopX - shoulderCapX) * 0.34);
    const shoulderCrestY = Math.min(shoulderCapY, shoulderArmTopY) -
      clamp((armWidth * 0.12) + (shoulderFat * 0.46), 0.6, 2.1);
    const shoulderTopFlowX = shoulderArmTopX + ((shoulderCrestX - shoulderArmTopX) * 0.5);
    const shoulderTopFlowY = Math.min(shoulderCrestY, shoulderArmTopY) - clamp(armWidth * 0.08, 0.3, 1.6);
    const shoulderBridgeX = shoulderCapX - ((shoulderCapX - shoulderArmTopX) * 0.44);
    const shoulderBridgeY = shoulderCapY + ((shoulderArmTopY - shoulderCapY) * 0.56);
    shoulderArmBottomX = shoulderX + clamp((armWidth * 0.2) + (shoulderFat * 1.3), 1.4, 4.8);
    shoulderArmBottomY = shoulderY + (shoulderJointOffset * 0.76);
    const chestX = CENTER_X + widthAt(chestY) + upperTorsoBulge;
    const waistX = CENTER_X + widthAt(waistY) + midTorsoBulge;
    const legStanceSpread = clamp(5 + (hipHalf * 0.09) + (thighHalf * 0.07), 5, 14);
    const hipX = CENTER_X + widthAt(hipY) + (legStanceSpread * 0.04) + (lowerTorsoBulge * 0.2);
    const thighX = CENTER_X + widthAt(thighY) + (legStanceSpread * 0.12);
    const kneeX = CENTER_X + widthAt(kneeY) + (legStanceSpread * 0.18);
    const calfX = CENTER_X + widthAt(calfY) + (legStanceSpread * 0.26);
    const ankleX = CENTER_X + widthAt(ankleY) + (legStanceSpread * 0.32);

    const footOuterHalf = clamp(ankleHalf * 1.42 + 2.4, 10, 25);
    const footInnerHalf = clamp(ankleHalf * 0.84 + 1.4, 5.5, 15.5);
    const footY = ankleY + clamp(9 + calfHalf * 0.16, 10, 17);
    const soleY = footY + clamp(2.6 + ankleHalf * 0.16, 2.8, 6.2);
    const footArchY = soleY - clamp(1.6 + ankleHalf * 0.11, 1.6, 4.1);
    const toeX = ankleX + clamp(footOuterHalf * 0.88, 8, 20);
    const footBallX = ankleX + clamp(footOuterHalf * 0.38, 5, 14);
    const footArchX = ankleX - clamp(footInnerHalf * 0.28, 2, 7);
    const heelX = ankleX - clamp(ankleHalf * 0.6, 3.5, 9);
    const armSpanRatio = clamp(toFiniteNumber(model.armSpanRatio, 1), 0.98, 1.02);
    const handScale = clamp(0.92 + ((armWidth - 8) / 20) * 0.18, 0.9, 1.1);
    const wristThickness = clamp(armWidth * 0.52, 5.2, 11);
    const fingerSpread = clamp((wristThickness * 0.72 + 0.7) * handScale, 3.4, 7.8);
    const fingerFan = clamp(2.2 + (armWidth * 0.18), 2.2, 6.2);
    const palmReach = clamp((8.4 + armWidth * 0.52) * handScale, 8, 18);
    const fingerJointReach = clamp((5.8 + armWidth * 0.34) * handScale, 5.4, 12.4);
    const fingerTipReach = clamp((10 + armWidth * 0.48) * handScale, 9.6, 19.5);
    const fingerLengthBoost = clamp((6 + armWidth * 0.3) * handScale, 5.2, 12.8);
    const maxTipExtension = Math.max(
      ...FINGER_CONFIGS.map(
        (finger) =>
          (fingerLengthBoost * finger.profile * 1.02) + (fingerFan * finger.xSplayScale * 1.08)
      )
    );
    const shoulderFromCenter = Math.max(10, shoulderX - CENTER_X);
    const wristToTipEstimate = clamp(
      palmReach + fingerTipReach + (maxTipExtension * 0.24),
      16,
      44
    );
    const armReachBias = clamp((armHeight - 170) * 0.34, -10, 12);
    const targetHalfSpan = (statureSpan * armSpanRatio) * 0.5;
    const spanDrivenShoulderToWrist = targetHalfSpan - shoulderFromCenter - wristToTipEstimate;
    const medicalShoulderToWrist = statureSpan *
      (MEDICAL_RATIOS.upperArmToStature + MEDICAL_RATIOS.forearmToStature);
    const targetShoulderToWrist = clamp(
      (spanDrivenShoulderToWrist * 0.42) + (medicalShoulderToWrist * 0.58) + armReachBias,
      68,
      124
    );
    const upperArmShare = MEDICAL_RATIOS.upperArmToStature /
      (MEDICAL_RATIOS.upperArmToStature + MEDICAL_RATIOS.forearmToStature);
    const upperArmLen = clamp(
      (targetShoulderToWrist * upperArmShare) + (armWidth * 0.12),
      46,
      78
    );
    const forearmLen = clamp(
      targetShoulderToWrist - upperArmLen,
      30,
      56
    );
    const handEdgePadding = clamp(8 + palmReach + fingerTipReach + maxTipExtension, 40, 92);

    const rawWristX = shoulderX + upperArmLen + forearmLen;
    const wristX = Math.min(rawWristX, VIEWBOX_WIDTH - handEdgePadding);
    const armReachRatio = upperArmLen / Math.max(upperArmLen + forearmLen, 1);
    const elbowX = shoulderX + ((wristX - shoulderX) * armReachRatio);
    const armDownTilt = clamp(0.42 + (armWidth * 0.12), 0.6, 3.8);
    const elbowY = shoulderY + (armDownTilt * 0.38);
    const wristY = shoulderY + armDownTilt;
    const upperArmMidX = shoulderX + ((elbowX - shoulderX) * 0.5);
    const upperArmMidY = shoulderY + ((elbowY - shoulderY) * 0.5);
    const forearmMidX = elbowX + ((wristX - elbowX) * 0.5);
    const forearmMidY = elbowY + ((wristY - elbowY) * 0.5);
    const underarmY = shoulderY + clamp(10 + armWidth * 0.8, 12, 26);
    const underarmX = CENTER_X +
      widthAt(underarmY) +
      clamp(2 + armWidth * 0.14 + shoulderFat * 1.2, 2, 7.4);

    const palmX = wristX + palmReach;
    const fingerBaseY = wristY - (fingerSpread * 0.92);
    const fingerBaseX = palmX;
    const fingerJointBaseX = palmX + fingerJointReach;
    const fingerTipBaseX = palmX + fingerTipReach;
    const handTipXValues = [];

    const anchors = [];
    const guides = [];
    const pushAnchor = (id, x, y, kind = "minor", group = "surface") => {
      anchors.push({ id, x, y, kind, group });
    };
    const pushMirrorAnchor = (id, x, y, kind = "minor", group = "surface") => {
      pushAnchor(`${id}-r`, x, y, kind, group);
      pushAnchor(`${id}-l`, mirrorX(x, CENTER_X), y, kind, group);
    };
    const pushGuide = (id, x1, y1, x2, y2, kind = "muscle") => {
      guides.push({ id, x1, y1, x2, y2, kind });
    };
    const pushMirrorGuide = (id, x1, y1, x2, y2, kind = "muscle") => {
      pushGuide(`${id}-r`, x1, y1, x2, y2, kind);
      pushGuide(`${id}-l`, mirrorX(x1, CENTER_X), y1, mirrorX(x2, CENTER_X), y2, kind);
    };
    const pushMirrorJointTriplet = (
      id,
      x,
      y,
      offset,
      centerKind = "major",
      orientation = "vertical",
      group = "joint"
    ) => {
      const safeOffset = Math.max(1.8, offset);
      pushMirrorAnchor(`${id}-center`, x, y, centerKind, group);
      if (orientation === "horizontal") {
        pushMirrorAnchor(`${id}-left`, x - safeOffset, y, "minor", group);
        pushMirrorAnchor(`${id}-right`, x + safeOffset, y, "minor", group);
        return;
      }
      pushMirrorAnchor(`${id}-top`, x, y - safeOffset, "minor", group);
      pushMirrorAnchor(`${id}-bottom`, x, y + safeOffset, "minor", group);
    };
    const pushMirrorLimbCenter = (id, startX, startY, endX, endY, kind = "minor", group = "skeletal") => {
      pushMirrorAnchor(id, (startX + endX) / 2, (startY + endY) / 2, kind, group);
    };
    const pushMirrorJointCircle = (
      id,
      x,
      y,
      radius,
      kind = "minor",
      options = {},
      group = "joint"
    ) => {
      const safeRadius = Math.max(1.8, radius);
      const angles = Array.isArray(options.angles) && options.angles.length
        ? options.angles
        : [-82, -58, -34, -10, 14, 38, 62, 86];
      angles.forEach((angle, index) => {
        const radians = (angle * Math.PI) / 180;
        const pointX = x + (Math.cos(radians) * safeRadius);
        const pointY = y + (Math.sin(radians) * safeRadius);
        pushMirrorAnchor(`${id}-ring-${index + 1}`, pointX, pointY, kind, group);
      });
    };
    const pushMirrorLimbTrapezoidAnchors = (
      id,
      startX,
      startY,
      endX,
      endY,
      startHalfWidth,
      endHalfWidth,
      kind = "minor",
      options = {},
      group = "surface"
    ) => {
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.hypot(dx, dy);
      if (!length) return;

      const tangentX = dx / length;
      const tangentY = dy / length;
      const normalX = -tangentY;
      const normalY = tangentX;
      const samples = Array.isArray(options.samples) && options.samples.length
        ? options.samples
        : [0.06, 0.13, 0.2, 0.28, 0.37, 0.47, 0.57, 0.67, 0.77, 0.86, 0.94];
      const taperPower = clamp(toFiniteNumber(options.taperPower, 1), 0.7, 1.35);
      const centerBulge = clamp(toFiniteNumber(options.centerBulge, 0.06), -0.2, 0.28);
      const contourSweep = clamp(toFiniteNumber(options.contourSweep, 0), -2.8, 2.8);
      const startSquare = clamp(toFiniteNumber(options.startSquare, 0.12), 0, 0.52);
      const endSquare = clamp(toFiniteNumber(options.endSquare, 0.12), 0, 0.52);
      const offsetScale = clamp(toFiniteNumber(options.offsetScale, 1), 0.72, 1.36);

      samples.forEach((t, index) => {
        const safeT = clamp(toFiniteNumber(t, 0.5), 0.06, 0.94);
        const widthT = Math.pow(safeT, taperPower);
        const centerProfile = Math.sin(safeT * Math.PI);
        const centerX = startX + (dx * safeT);
        const centerY = startY + (dy * safeT);
        const halfWidth = startHalfWidth + ((endHalfWidth - startHalfWidth) * widthT);
        const trapezoidBulge = 1 + (centerProfile * centerBulge);
        const offset = Math.max(1.8, halfWidth * trapezoidBulge * offsetScale);
        const squareBias = (((1 - safeT) * startSquare) - (safeT * endSquare)) * length * 0.08;
        const alongBias = squareBias + (Math.sin((safeT - 0.5) * Math.PI) * contourSweep);

        const optionA = {
          x: centerX + (normalX * offset) + (tangentX * alongBias),
          y: centerY + (normalY * offset) + (tangentY * alongBias)
        };
        const optionB = {
          x: centerX - (normalX * offset) + (tangentX * alongBias),
          y: centerY - (normalY * offset) + (tangentY * alongBias)
        };
        const top = optionA.y <= optionB.y ? optionA : optionB;
        const bottom = optionA.y <= optionB.y ? optionB : optionA;

        pushMirrorAnchor(`${id}-${index + 1}-top`, top.x, top.y, kind, group);
        pushMirrorAnchor(`${id}-${index + 1}-bottom`, bottom.x, bottom.y, kind, group);
      });
    };

    pushAnchor("head-top", CENTER_X, headTopY, "major");
    pushAnchor("head-center", CENTER_X, headCenterY, "minor", "skeletal");
    pushMirrorAnchor("temple", CENTER_X + (headRadiusX * 0.7), headCenterY - (headRadiusY * 0.14), "minor");
    rightHeadArc.forEach((point, index) => {
      pushMirrorAnchor(`head-arc-${index + 1}`, point.x, point.y, "minor");
    });
    pushAnchor("chin", CENTER_X, chinY, "major");
    pushMirrorAnchor("jaw", jawRight.x, jawRight.y, "minor");
    pushAnchor("neck-base", CENTER_X, neckBaseY, "major", "skeletal");
    pushMirrorAnchor("neck-side", CENTER_X + neckHalf, neckBaseY + (headRadiusY * 0.04), "minor");
    pushMirrorAnchor("neck-curve-upper", neckCurveUpperX, neckCurveUpperY, "minor");
    pushMirrorAnchor("neck-curve-mid", neckCurveMidX, neckCurveMidY, "minor");
    pushMirrorAnchor("neck-curve-lower", neckCurveLowerX, neckCurveLowerY, "minor");
    pushMirrorAnchor("trap-curve", trapCurveX, trapCurveY, "minor");
    pushMirrorAnchor("trap-shoulder", trapShoulderX, trapShoulderY, "minor");
    pushMirrorAnchor("shoulder-cap", shoulderCapX, shoulderCapY, "minor");
    pushMirrorAnchor("shoulder-crest", shoulderCrestX, shoulderCrestY, "minor");
    pushMirrorAnchor("shoulder-top-flow", shoulderTopFlowX, shoulderTopFlowY, "minor");
    pushMirrorAnchor("shoulder-bridge", shoulderBridgeX, shoulderBridgeY, "minor");
    pushMirrorAnchor("shoulder-arm-top", shoulderArmTopX, shoulderArmTopY, "minor");
    pushMirrorAnchor("shoulder-rear", shoulderRearX, shoulderRearY, "minor");
    pushMirrorAnchor("shoulder-lower", shoulderLowerX, shoulderLowerY, "minor");
    pushMirrorAnchor("shoulder-arm-bottom", shoulderArmBottomX, shoulderArmBottomY, "minor");

    pushMirrorJointTriplet(
      "shoulder-joint",
      shoulderX,
      shoulderY,
      shoulderJointOffset,
      "major"
    );
    pushMirrorJointCircle(
      "shoulder-joint",
      shoulderX,
      shoulderY,
      clamp(shoulderJointOffset * 1.12, 3.1, 9.6),
      "minor"
    );
    pushMirrorAnchor("upper-arm-mid", upperArmMidX, upperArmMidY, "minor");
    pushMirrorJointTriplet(
      "elbow-joint",
      elbowX,
      elbowY,
      clamp(armWidth * 0.34, 2.2, 6.4),
      "major"
    );
    pushMirrorJointCircle(
      "elbow-joint",
      elbowX,
      elbowY,
      clamp(armWidth * 0.42, 2.8, 6.8),
      "minor",
      { angles: [-88, -60, -34, -10, 14, 40, 66, 92] }
    );
    pushMirrorAnchor("forearm-mid", forearmMidX, forearmMidY, "minor");
    pushMirrorJointTriplet(
      "wrist-joint",
      wristX,
      wristY,
      clamp(armWidth * 0.24, 1.8, 4.6),
      "major"
    );
    pushMirrorJointCircle(
      "wrist-joint",
      wristX,
      wristY,
      clamp(armWidth * 0.28, 2.1, 4.8),
      "minor",
      { angles: [-92, -64, -34, -8, 18, 46, 72, 98] }
    );
    pushMirrorAnchor("palm", palmX, wristY, "minor", "skeletal");
    pushMirrorAnchor("underarm", underarmX, underarmY, "minor");
    pushMirrorLimbCenter("upper-arm-center", shoulderX, shoulderY, elbowX, elbowY, "minor");
    pushMirrorLimbCenter("forearm-center", elbowX, elbowY, wristX, wristY, "minor");
    pushMirrorLimbTrapezoidAnchors(
      "upper-arm-trapezoid",
      shoulderX,
      shoulderY,
      elbowX,
      elbowY,
      clamp(3.8 + (armWidth * 0.26), 5, 10),
      clamp(3 + (armWidth * 0.2), 4.2, 8),
      "minor",
      {
        samples: [0.03, 0.08, 0.14, 0.22, 0.31, 0.41, 0.52, 0.63, 0.73, 0.82, 0.9],
        centerBulge: 0.07,
        contourSweep: 0.28,
        offsetScale: 1.08,
        taperPower: 0.94,
        startSquare: 0.03,
        endSquare: 0.1
      }
    );
    pushMirrorLimbTrapezoidAnchors(
      "forearm-trapezoid",
      elbowX,
      elbowY,
      wristX,
      wristY,
      clamp(3 + (armWidth * 0.2), 4.2, 8),
      clamp(2.2 + (armWidth * 0.12), 3.4, 6.4),
      "minor",
      {
        samples: [0.06, 0.13, 0.21, 0.3, 0.4, 0.5, 0.6, 0.69, 0.78, 0.86, 0.93],
        centerBulge: 0.05,
        contourSweep: 0.34,
        offsetScale: 1.05,
        taperPower: 1.08,
        startSquare: 0.14,
        endSquare: 0.2
      }
    );

    FINGER_CONFIGS.forEach((finger) => {
      const fingerBaseYValue = fingerBaseY + (fingerSpread * finger.yOffsetScale * 5.2);
      const splayX = fingerFan * finger.xSplayScale;
      const baseX = fingerBaseX + (splayX * 0.3);
      const jointX = clamp(
        fingerJointBaseX + (fingerLengthBoost * finger.profile * 0.38) + (splayX * 0.68),
        CENTER_X + 12,
        VIEWBOX_WIDTH - 8.6
      );
      const tipX = clamp(
        fingerTipBaseX + (fingerLengthBoost * finger.profile * 1.02) + (splayX * 1.08),
        CENTER_X + 14,
        VIEWBOX_WIDTH - 4.2
      );
      const jointY = fingerBaseYValue + (fingerSpread * finger.jointCurve * 0.82);
      const tipY = fingerBaseYValue + (fingerSpread * finger.jointCurve * 1.1);

      handTipXValues.push(tipX);
      pushMirrorAnchor(`${finger.id}-base`, baseX, fingerBaseYValue, "minor", "joint");
      pushMirrorAnchor(
        `${finger.id}-joint`,
        jointX,
        jointY,
        finger.id === "index" || finger.id === "middle" ? "major" : "minor",
        "joint"
      );
      pushMirrorAnchor(`${finger.id}-tip`, tipX, tipY, "major");
    });

    const handTipX = handTipXValues.length ? Math.max(...handTipXValues) : palmX;
    const handCenterY = wristY + (fingerSpread * 0.16);
    pushMirrorAnchor("hand-tip", handTipX, handCenterY, "major");

    const upperChestY = shoulderY + ((chestY - shoulderY) * 0.44);
    const lowerChestY = chestY + ((waistY - chestY) * 0.36);
    const ribUpperY = chestY + ((waistY - chestY) * 0.18);
    const ribMidY = chestY + ((waistY - chestY) * 0.52);
    const latUpperY = underarmY + ((chestY - underarmY) * 0.34);
    const latMidY = chestY + ((ribUpperY - chestY) * 0.56);
    const latLowerY = ribMidY + ((waistY - ribMidY) * 0.34);
    const pectoralOuterY = shoulderY + ((chestY - shoulderY) * 0.22);
    const serratusY = chestY + ((waistY - chestY) * 0.26);
    const upperWaistY = chestY + ((waistY - chestY) * 0.7);
    const waistPinchY = upperWaistY + ((waistY - upperWaistY) * 0.52);
    const lowerWaistY = waistY + ((hipY - waistY) * 0.34);
    const obliqueSideY = waistY + ((hipY - waistY) * 0.28);
    const flankUpperY = waistY + ((hipY - waistY) * 0.18);
    const flankMidY = flankUpperY + ((hipY - flankUpperY) * 0.34);
    const flankLowerY = waistY + ((hipY - waistY) * 0.52);
    const navelY = waistY + ((hipY - waistY) * 0.2);
    const hipCrestY = hipY - clamp((hipY - waistY) * 0.26, 6, 16);
    const iliacY = flankLowerY + ((hipCrestY - flankLowerY) * 0.62);
    const hipFlowY = iliacY + ((hipCrestY - iliacY) * 0.44);
    const hipDipY = hipY + clamp((thighY - hipY) * 0.16, 4, 12);
    const quadUpperY = hipY + ((kneeY - hipY) * 0.24);
    const gluteUpperY = hipY + ((quadUpperY - hipY) * 0.22);
    const hipOuterY = hipY + ((quadUpperY - hipY) * 0.44);
    const quadOuterHighY = hipY + ((quadUpperY - hipY) * 0.7);
    const quadMidY = hipY + ((kneeY - hipY) * 0.48);
    const quadLowerY = hipY + ((kneeY - hipY) * 0.72);

    const upperChestX = CENTER_X + (widthAt(upperChestY) * (0.98 + sideFat * 0.06)) + (upperTorsoBulge * 0.8);
    const lowerChestX = CENTER_X + widthAt(lowerChestY) + (upperTorsoBulge * 1.06);
    const ribUpperX = CENTER_X + (widthAt(ribUpperY) * (1.01 + sideFat * 0.05)) + (midTorsoBulge * 0.72);
    const ribMidX = CENTER_X + (widthAt(ribMidY) * (1.02 + sideFat * 0.06)) + (midTorsoBulge * 0.92);
    const latUpperX = CENTER_X +
      (widthAt(latUpperY) * (1 + sideFat * 0.04)) +
      (upperTorsoBulge * 0.9) +
      (shoulderSoftPad * 0.18);
    const pectoralOuterX = CENTER_X +
      (widthAt(pectoralOuterY) * (0.995 + sideFat * 0.04)) +
      (upperTorsoBulge * 0.94) +
      (shoulderSoftPad * 0.12);
    const serratusX = CENTER_X +
      (widthAt(serratusY) * (1.015 + sideFat * 0.05)) +
      (midTorsoBulge * 0.84);
    const armpitRearY = shoulderRearY + ((underarmY - shoulderRearY) * 0.48);
    const armpitRearX = shoulderRearX - clamp((armWidth * 0.12) + (shoulderFat * 0.7), 0.8, 2.6);
    const armpitApexY = underarmY + ((latUpperY - underarmY) * 0.2);
    const armpitApexInset = clamp(
      (underarmX - latUpperX) * (0.56 + (sideFat * 0.14)),
      1.1,
      4.2
    );
    const armpitApexMaxX = Math.max(latUpperX + 1.1, armpitRearX - 0.8);
    const armpitApexX = clamp(
      underarmX - armpitApexInset,
      latUpperX + 0.9,
      armpitApexMaxX
    );
    const armpitFrontY = underarmY + ((latUpperY - underarmY) * 0.54);
    const armpitFrontX = latUpperX + clamp((underarmX - latUpperX) * 0.22, 0.6, 1.8);
    const latMidX = CENTER_X +
      (widthAt(latMidY) * (1.01 + sideFat * 0.05)) +
      (midTorsoBulge * 0.76);
    const latLowerX = CENTER_X +
      (widthAt(latLowerY) * (1.01 + sideFat * 0.06)) +
      (midTorsoBulge * 0.66);
    const upperWaistX = CENTER_X + (widthAt(upperWaistY) * (0.99 + sideFat * 0.07)) + (midTorsoBulge * 0.88);
    const waistPinchX = CENTER_X +
      (widthAt(waistPinchY) * (0.95 + sideFat * 0.04)) +
      (midTorsoBulge * 0.58) -
      clamp(1.4 + ((1 - sideFat) * 1.6), 1.1, 3.8);
    const lowerWaistX = CENTER_X + (widthAt(lowerWaistY) * (1.02 + sideFat * 0.08)) + (lowerTorsoBulge * 0.8);
    const obliqueSideX = CENTER_X + widthAt(obliqueSideY) + (legStanceSpread * 0.07) + (lowerTorsoBulge * 0.86);
    const flankUpperX = CENTER_X + widthAt(flankUpperY) + (legStanceSpread * 0.06) + (lowerTorsoBulge * 0.84);
    const flankMidX = CENTER_X + widthAt(flankMidY) + (legStanceSpread * 0.08) + (lowerTorsoBulge * 0.89);
    const flankLowerX = CENTER_X + widthAt(flankLowerY) + (legStanceSpread * 0.1) + (lowerTorsoBulge * 0.94);
    const hipCrestX = CENTER_X + widthAt(hipCrestY) + (legStanceSpread * 0.05) + (lowerTorsoBulge * 0.72);
    const iliacX = CENTER_X + widthAt(iliacY) + (legStanceSpread * 0.07) + (lowerTorsoBulge * 0.88);
    const hipFlowX = CENTER_X + widthAt(hipFlowY) + (legStanceSpread * 0.06) + (lowerTorsoBulge * 0.82);
    const hipDipX = CENTER_X + widthAt(hipDipY) + (legStanceSpread * 0.08) + (lowerTorsoBulge * 0.86);
    const gluteUpperX = CENTER_X + widthAt(gluteUpperY) + (legStanceSpread * 0.11) + (lowerTorsoBulge * 0.9);
    const hipLegBlendY = hipY + ((quadUpperY - hipY) * 0.12);
    const hipLegBlendX = ((hipCrestX * 0.42) + (gluteUpperX * 0.58)) + clamp(legStanceSpread * 0.02, 0.1, 0.5);
    const hipOuterX = CENTER_X + widthAt(hipOuterY) + (legStanceSpread * 0.13) + (lowerTorsoBulge * 0.94);
    const quadOuterHighX = CENTER_X + widthAt(quadOuterHighY) + (legStanceSpread * 0.18) + (lowerTorsoBulge * 0.32);
    const quadOuterUpperX = CENTER_X + widthAt(quadUpperY) + (legStanceSpread * 0.15);
    const quadOuterMidX = CENTER_X + widthAt(quadMidY) + (legStanceSpread * 0.19);
    const quadOuterLowerX = CENTER_X + widthAt(quadLowerY) + (legStanceSpread * 0.22);

    pushAnchor("chest-center", CENTER_X, chestY, "major", "skeletal");
    pushAnchor("waist-center", CENTER_X, waistY, "major", "skeletal");
    pushAnchor("pelvis-center", CENTER_X, pelvisY, "major", "skeletal");
    pushAnchor("groin-center", CENTER_X, groinY, "minor", "skeletal");
    pushAnchor("sternum-upper", CENTER_X, upperChestY, "minor", "skeletal");
    pushAnchor("sternum-lower", CENTER_X, lowerChestY, "minor", "skeletal");
    pushAnchor("rib-upper-center", CENTER_X, ribUpperY, "minor", "skeletal");
    pushAnchor("rib-mid-center", CENTER_X, ribMidY, "minor", "skeletal");
    pushAnchor("pectoral-center", CENTER_X, pectoralOuterY, "minor", "skeletal");
    pushAnchor("serratus-center", CENTER_X, serratusY, "minor", "skeletal");
    pushAnchor("lat-upper-center", CENTER_X, latUpperY, "minor", "skeletal");
    pushAnchor("lat-mid-center", CENTER_X, latMidY, "minor", "skeletal");
    pushAnchor("lat-lower-center", CENTER_X, latLowerY, "minor", "skeletal");
    pushAnchor("flank-upper-center", CENTER_X, flankUpperY, "minor", "skeletal");
    pushAnchor("flank-mid-center", CENTER_X, flankMidY, "minor", "skeletal");
    pushAnchor("flank-lower-center", CENTER_X, flankLowerY, "minor", "skeletal");
    pushAnchor("waist-pinch-center", CENTER_X, waistPinchY, "minor", "skeletal");
    pushAnchor("oblique-center", CENTER_X, obliqueSideY, "minor", "skeletal");
    pushAnchor("iliac-center", CENTER_X, iliacY, "minor", "skeletal");
    pushAnchor("hip-flow-center", CENTER_X, hipFlowY, "minor", "skeletal");
    pushAnchor("glute-center", CENTER_X, gluteUpperY, "minor", "skeletal");
    pushAnchor("navel", CENTER_X, navelY, "minor");
    pushAnchor("quad-center-upper", CENTER_X, quadUpperY, "minor", "skeletal");
    pushAnchor("quad-center-mid", CENTER_X, quadMidY, "minor", "skeletal");
    pushAnchor("quad-center-lower", CENTER_X, quadLowerY, "minor", "skeletal");

    pushMirrorAnchor("upper-chest-side", upperChestX, upperChestY, "minor");
    pushMirrorAnchor("chest-side", chestX, chestY, "minor");
    pushMirrorAnchor("lower-chest-side", lowerChestX, lowerChestY, "minor");
    pushMirrorAnchor("pectoral-side", pectoralOuterX, pectoralOuterY, "minor");
    pushMirrorAnchor("serratus-side", serratusX, serratusY, "minor");
    pushMirrorAnchor("armpit-rear", armpitRearX, armpitRearY, "minor");
    pushMirrorAnchor("armpit-apex", armpitApexX, armpitApexY, "minor");
    pushMirrorAnchor("armpit-front", armpitFrontX, armpitFrontY, "minor");
    pushMirrorAnchor("lat-upper-side", latUpperX, latUpperY, "minor");
    pushMirrorAnchor("lat-mid-side", latMidX, latMidY, "minor");
    pushMirrorAnchor("lat-lower-side", latLowerX, latLowerY, "minor");
    pushMirrorAnchor("rib-upper-side", ribUpperX, ribUpperY, "minor");
    pushMirrorAnchor("rib-mid-side", ribMidX, ribMidY, "minor");
    pushMirrorAnchor("upper-waist-side", upperWaistX, upperWaistY, "minor");
    pushMirrorAnchor("waist-pinch-side", waistPinchX, waistPinchY, "minor");
    pushMirrorAnchor("waist-side", waistX, waistY, "minor");
    pushMirrorAnchor("lower-waist-side", lowerWaistX, lowerWaistY, "minor");
    pushMirrorAnchor("oblique-side", obliqueSideX, obliqueSideY, "minor");
    pushMirrorAnchor("flank-upper-side", flankUpperX, flankUpperY, "minor");
    pushMirrorAnchor("flank-mid-side", flankMidX, flankMidY, "minor");
    pushMirrorAnchor("flank-lower-side", flankLowerX, flankLowerY, "minor");
    pushMirrorAnchor("iliac-side", iliacX, iliacY, "minor");
    pushMirrorAnchor("hip-flow-side", hipFlowX, hipFlowY, "minor");
    pushMirrorAnchor("hip-crest", hipCrestX, hipCrestY, "minor");
    pushMirrorAnchor("hip-leg-blend", hipLegBlendX, hipLegBlendY, "minor");
    pushMirrorAnchor("glute-upper-side", gluteUpperX, gluteUpperY, "minor");
    pushMirrorAnchor("hip-dip", hipDipX, hipDipY, "minor");
    pushMirrorAnchor("hip-outer", hipOuterX, hipOuterY, "minor");
    pushMirrorAnchor("quad-outer-high", quadOuterHighX, quadOuterHighY, "minor");
    pushMirrorJointTriplet(
      "hip-joint",
      hipX,
      hipY,
      clamp((hipHalf + thighHalf) * 0.07, 2.8, 8.4),
      "major",
      "horizontal"
    );
    pushMirrorJointCircle(
      "hip-joint",
      hipX,
      hipY,
      clamp(((hipHalf + thighHalf) * 0.08), 3.2, 9.4),
      "minor",
      { angles: [-96, -68, -40, -14, 12, 38, 64, 90] }
    );
    pushMirrorAnchor("quad-outer-upper", quadOuterUpperX, quadUpperY, "minor");
    pushMirrorAnchor("quad-outer-mid", quadOuterMidX, quadMidY, "minor");
    pushMirrorAnchor("quad-outer-lower", quadOuterLowerX, quadLowerY, "minor");
    pushMirrorAnchor("thigh", thighX, thighY, "major");
    pushMirrorJointTriplet(
      "knee-joint",
      kneeX,
      kneeY,
      clamp(kneeHalf * 0.24, 2.4, 7),
      "major",
      "horizontal"
    );
    pushMirrorJointCircle(
      "knee-joint",
      kneeX,
      kneeY,
      clamp(kneeHalf * 0.26, 2.8, 7.2),
      "minor",
      { angles: [-100, -72, -44, -18, 8, 34, 60, 86] }
    );
    pushMirrorAnchor("calf", calfX, calfY, "minor");
    pushMirrorJointTriplet(
      "ankle-joint",
      ankleX,
      ankleY,
      clamp(ankleHalf * 0.36, 1.8, 5.2),
      "major",
      "horizontal"
    );
    pushMirrorJointCircle(
      "ankle-joint",
      ankleX,
      ankleY,
      clamp(ankleHalf * 0.42, 2.2, 5.8),
      "minor",
      { angles: [-106, -76, -48, -22, 2, 28, 56, 82] }
    );
    pushMirrorAnchor("heel", heelX, soleY - 1, "minor");
    pushMirrorAnchor("foot-ball", footBallX, soleY, "minor");
    pushMirrorAnchor("foot-arch", footArchX, footArchY, "minor");
    pushMirrorAnchor("toe", toeX, footY, "major");
    pushMirrorLimbCenter("thigh-center", hipX, hipY, kneeX, kneeY, "minor");
    pushMirrorLimbCenter("calf-center", kneeX, kneeY, ankleX, ankleY, "minor");
    pushMirrorLimbTrapezoidAnchors(
      "thigh-trapezoid",
      hipX,
      hipY,
      kneeX,
      kneeY,
      clamp(5 + (thighHalf * 0.16), 7, 14),
      clamp(4 + (kneeHalf * 0.12), 6, 11),
      "minor",
      {
        samples: [0.05, 0.11, 0.18, 0.26, 0.35, 0.45, 0.55, 0.65, 0.74, 0.82, 0.9, 0.95],
        centerBulge: 0.08,
        contourSweep: 0.86,
        offsetScale: 1.2,
        taperPower: 0.9,
        startSquare: 0.18,
        endSquare: 0.14
      }
    );
    pushMirrorLimbTrapezoidAnchors(
      "calf-trapezoid",
      kneeX,
      kneeY,
      ankleX,
      ankleY,
      clamp(4 + (calfHalf * 0.14), 5.4, 10),
      clamp(3 + (ankleHalf * 0.18), 4.8, 8),
      "minor",
      {
        samples: [0.06, 0.13, 0.21, 0.3, 0.39, 0.49, 0.59, 0.68, 0.77, 0.85, 0.92],
        centerBulge: 0.1,
        contourSweep: 0.66,
        offsetScale: 1.2,
        taperPower: 1.08,
        startSquare: 0.12,
        endSquare: 0.18
      }
    );

    const innerThighHalf = clamp(thighHalf * 0.48, groinHalf + 1, thighHalf * 0.82);
    const innerKneeHalf = clamp(kneeHalf * 0.58, groinHalf + 1, kneeHalf * 0.9);
    const innerCalfHalf = clamp(calfHalf * 0.5, groinHalf + 0.8, calfHalf * 0.88);
    const innerAnkleHalf = clamp(ankleHalf * 0.67, groinHalf * 0.72, ankleHalf * 0.95);
    const innerAnkleY = ankleY + clamp(1.2 + ankleHalf * 0.1, 1, 3.2);
    const innerQuadUpperHalf = clamp(
      (innerThighHalf * 0.74) + (groinHalf * 0.26),
      groinHalf + 0.6,
      innerThighHalf * 0.98
    );
    const innerQuadMidHalf = clamp(
      (innerThighHalf * 0.46) + (innerKneeHalf * 0.54),
      groinHalf + 0.8,
      innerThighHalf
    );
    const innerQuadLowerHalf = clamp(
      (innerKneeHalf * 0.68) + (innerCalfHalf * 0.32),
      groinHalf + 0.8,
      innerKneeHalf * 0.98
    );
    const pelvisSideY = hipY + ((quadUpperY - hipY) * 0.14);
    const pelvisSideHalf = clamp(
      innerQuadUpperHalf * 1.16,
      groinHalf + 2.2,
      thighHalf * 0.66
    );
    const pelvisBaseInnerY = pelvisSideY + ((groinY - pelvisSideY) * 0.74);
    const pelvisBaseInnerHalf = clamp(
      (pelvisSideHalf * 0.56) + (groinHalf * 0.32),
      groinHalf + 0.8,
      pelvisSideHalf * 0.82
    );
    const innerThighRootY = groinY + ((quadUpperY - groinY) * 0.48);
    const innerThighRootHalf = clamp(
      (groinHalf * 0.58) + (innerQuadUpperHalf * 0.42),
      groinHalf + 0.4,
      innerQuadUpperHalf * 0.98
    );
    const pelvisInnerBridgeY = innerThighRootY + clamp((thighY - innerThighRootY) * 0.16, 1, 3.2);
    const pelvisInnerBridgeHalf = clamp(
      (innerThighRootHalf * 0.58) + (groinHalf * 0.42),
      groinHalf + 0.4,
      innerThighRootHalf * 0.82
    );
    const pelvisBaseCenterY = pelvisInnerBridgeY + clamp((thighY - pelvisInnerBridgeY) * 0.08, 0.6, 2.2);
    const innerKneeSoftY = kneeY + ((calfY - kneeY) * 0.2);
    const innerKneeSoftHalf = clamp(
      (innerKneeHalf * 0.76) + (innerCalfHalf * 0.24),
      groinHalf + 0.9,
      innerKneeHalf * 1.02
    );
    const innerCalfUpperY = kneeY + ((calfY - kneeY) * 0.36);
    const innerCalfUpperHalf = clamp(
      (innerKneeHalf * 0.56) + (innerCalfHalf * 0.44),
      groinHalf + 0.9,
      innerKneeHalf
    );
    const innerAnkleX = CENTER_X + innerAnkleHalf;
    const instepX = innerAnkleX + ((heelX - innerAnkleX) * 0.38);
    const instepY = soleY - clamp(1 + (ankleHalf * 0.08), 1, 3);

    pushMirrorAnchor("inner-quad-upper", CENTER_X + innerQuadUpperHalf, quadUpperY, "minor");
    pushMirrorAnchor("inner-quad-mid", CENTER_X + innerQuadMidHalf, quadMidY, "minor");
    pushMirrorAnchor("inner-quad-lower", CENTER_X + innerQuadLowerHalf, quadLowerY, "minor");
    pushMirrorAnchor("inner-thigh-root", CENTER_X + innerThighRootHalf, innerThighRootY, "minor");
    pushMirrorAnchor("inner-thigh", CENTER_X + innerThighHalf, thighY, "minor");
    pushMirrorAnchor("inner-knee", CENTER_X + innerKneeHalf, kneeY, "minor");
    pushMirrorAnchor("inner-knee-soft", CENTER_X + innerKneeSoftHalf, innerKneeSoftY, "minor");
    pushMirrorAnchor("inner-calf-upper", CENTER_X + innerCalfUpperHalf, innerCalfUpperY, "minor");
    pushMirrorAnchor("inner-calf", CENTER_X + innerCalfHalf, calfY, "minor");
    pushMirrorAnchor("inner-ankle", CENTER_X + innerAnkleHalf, innerAnkleY, "minor");
    pushMirrorAnchor("pelvis-side", CENTER_X + pelvisSideHalf, pelvisSideY, "minor");
    pushMirrorAnchor("pelvis-base-inner", CENTER_X + pelvisBaseInnerHalf, pelvisBaseInnerY, "minor");
    pushMirrorAnchor("pelvis-inner-bridge", CENTER_X + pelvisInnerBridgeHalf, pelvisInnerBridgeY, "minor");
    pushMirrorAnchor("instep", instepX, instepY, "minor");
    pushMirrorAnchor(
      "inner-groin",
      CENTER_X + (groinHalf * 0.96),
      groinY - clamp((thighY - hipY) * 0.03, 0.8, 2.6),
      "minor"
    );

    const { outlinePoints, outlinePath, outlineMarkers } = buildSymmetricOutline({
      anchors,
      rightHeadArc,
      fingerConfigs: FINGER_CONFIGS,
      centerX: CENTER_X,
      headTopY,
      shoulderArmTopX,
      quadOuterUpperX,
      pelvisBaseCenterY
    });

    appendDefaultGuides({
      pushGuide,
      pushMirrorGuide,
      centerX: CENTER_X,
      neckBaseY,
      chestY,
      waistY,
      pelvisY,
      groinY,
      neckHalf,
      headRadiusY,
      shoulderX,
      shoulderY,
      elbowX,
      elbowY,
      wristX,
      wristY,
      palmX,
      handTipX,
      handCenterY,
      hipX,
      hipY,
      kneeX,
      kneeY,
      ankleX,
      ankleY,
      toeX,
      footY,
      heelX,
      soleY,
      chestX,
      waistX,
      underarmX,
      underarmY,
      trapCurveX,
      trapCurveY,
      shoulderCapX,
      shoulderCapY,
      shoulderLowerX,
      shoulderLowerY,
      upperArmMidX,
      upperArmMidY,
      forearmMidX,
      forearmMidY,
      thighX,
      thighY,
      calfX,
      calfY
    });

    const templateOutline = buildTemplateOutline({
      model,
      fallback,
      viewboxWidth: VIEWBOX_WIDTH,
      viewboxHeight: VIEWBOX_HEIGHT
    });
    const palette = buildPhysiquePalette(model, fallback);

    return {
      anchors,
      guides,
      outlineMarkers: templateOutline?.outlineMarkers || outlineMarkers,
      outlinePath: templateOutline?.path || outlinePath,
      outlineTransform: templateOutline?.transform,
      palette
    };
};
