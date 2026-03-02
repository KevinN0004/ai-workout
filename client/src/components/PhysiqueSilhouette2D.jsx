import { useMemo } from "react";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mirrorX = (x, centerX) => centerX - (x - centerX);
const toFiniteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const interpolateBandWidth = (bands, yValue) => {
  if (!Array.isArray(bands) || !bands.length) return 0;
  if (yValue <= bands[0].y) return bands[0].w;

  for (let index = 0; index < bands.length - 1; index += 1) {
    const current = bands[index];
    const next = bands[index + 1];
    if (yValue > next.y) continue;
    const range = Math.max(1, next.y - current.y);
    const progress = (yValue - current.y) / range;
    return current.w + ((next.w - current.w) * progress);
  }

  return bands[bands.length - 1].w;
};

const CENTER_X = 140;
const VIEWBOX_WIDTH = 280;
const VIEWBOX_HEIGHT = 430;
const FINGER_CONFIGS = [
  { id: "thumb", profile: 0.76, yOffsetScale: -0.22, jointCurve: -0.2, xSplayScale: -0.22 },
  { id: "index", profile: 0.96, yOffsetScale: -0.1, jointCurve: -0.08, xSplayScale: -0.08 },
  { id: "middle", profile: 1.1, yOffsetScale: 0, jointCurve: 0, xSplayScale: 0.04 },
  { id: "ring", profile: 1.0, yOffsetScale: 0.1, jointCurve: 0.08, xSplayScale: 0.16 },
  { id: "pinky", profile: 0.86, yOffsetScale: 0.2, jointCurve: 0.16, xSplayScale: 0.28 }
];

export default function PhysiqueSilhouette2D({ shape }) {
  const { anchors, guides, outlineMarkers, outlinePath, palette } = useMemo(() => {
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
    const calfHalf = clamp(toFiniteNumber(model.calfHalf, fallback.calfHalf), 10, 34);
    const armWidth = clamp(toFiniteNumber(model.armWidth, fallback.armWidth), 8, 24);
    const armHeight = clamp(toFiniteNumber(model.armHeight, fallback.armHeight), 146, 194);
    const headRadius = clamp(toFiniteNumber(model.headRadius, fallback.headRadius), 15, 28);
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
    const headTopY = headCenterY - headRadius;
    const chinY = headCenterY + headRadius;
    const neckBaseY = chinY + headRadius * 0.22;

    const shoulderY = clamp(toFiniteNumber(model.shoulderY, fallback.shoulderY), neckBaseY + 4, 138);
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
    const kneeY = thighY + ((calfY - thighY) * 0.38);
    const groinY = hipY + ((thighY - hipY) * 0.13);
    const pelvisY = hipY + ((thighY - hipY) * 0.24);

    const neckHalf = clamp(headRadius * 0.34 + shoulderHalf * 0.06, 8.2, shoulderHalf * 0.44);
    const headArcAngles = [-70, -50, -30, -10, 10, 30, 50];
    const rightHeadArc = headArcAngles.map((angle) => {
      const radians = (angle * Math.PI) / 180;
      return {
        x: CENTER_X + (headRadius * Math.cos(radians)),
        y: headCenterY + (headRadius * Math.sin(radians))
      };
    });
    const jawRight = rightHeadArc[rightHeadArc.length - 1];
    const neckCurveUpperX = CENTER_X + clamp(neckHalf * 1.04, neckHalf + 0.3, headRadius * 0.94);
    const neckCurveUpperY = neckBaseY - clamp(headRadius * 0.08, 1, 2.8);
    const neckCurveMidX = CENTER_X + clamp(neckHalf * 0.98, neckHalf - 0.8, neckHalf + 2.2);
    const neckCurveMidY = neckBaseY + clamp((shoulderY - neckBaseY) * 0.34, 2.8, 11.2);
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
    const shoulderX = CENTER_X + widthAt(shoulderY) + shoulderStarSpread + shoulderSoftPad;
    trapCurveX = CENTER_X + neckHalf + ((shoulderX - (CENTER_X + neckHalf)) * 0.46);
    const trapLift = clamp((armWidth * 0.34) + (shoulderHalf * 0.02), 2, 7.2);
    trapCurveY = shoulderY - (trapLift * (1 - shoulderFat * 0.28));
    trapShoulderX = trapCurveX + ((shoulderX - trapCurveX) * 0.46);
    trapShoulderY = trapCurveY +
      ((shoulderY - trapCurveY) * 0.42) -
      clamp(armWidth * 0.08, 0.5, 1.8) +
      (shoulderFat * 1.2);
    shoulderCapX = shoulderX + clamp((armWidth * 0.46) + (shoulderFat * 3.2), 3, 12.2);
    shoulderCapY = shoulderY - clamp(armWidth * (0.34 - shoulderFat * 0.12), 0.8, 5.2);
    shoulderRearX = shoulderX + clamp((armWidth * 0.16) + (shoulderFat * 2.2), 1.4, 6.2);
    shoulderRearY = shoulderY + clamp((armWidth * 0.32) + (shoulderLowerSoft * 0.68), 2.2, 8.2);
    shoulderLowerX = shoulderX + clamp((armWidth * 0.24) + (shoulderFat * 2.8), 1.8, 8.4);
    shoulderLowerY = shoulderY + clamp((armWidth * 0.56) + shoulderLowerSoft, 3.4, 11.8);
    shoulderArmTopX = shoulderX + clamp((armWidth * 0.18) + (shoulderFat * 1.1), 1.2, 4.4);
    shoulderArmTopY = shoulderY - (shoulderJointOffset * 0.72);
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

    const upperArmLen = clamp(
      34 + ((armHeight - 146) * 0.36) + (shoulderHalf * 0.06),
      34,
      64
    );
    const forearmLen = clamp(
      24 + ((armHeight - 146) * 0.28) + (armWidth * 0.3),
      22,
      42
    );
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
    const handEdgePadding = clamp(8 + palmReach + fingerTipReach + maxTipExtension, 34, 68);

    const rawWristX = shoulderX + upperArmLen + forearmLen;
    const wristX = Math.min(rawWristX, VIEWBOX_WIDTH - handEdgePadding);
    const armReachRatio = upperArmLen / Math.max(upperArmLen + forearmLen, 1);
    const elbowX = shoulderX + ((wristX - shoulderX) * armReachRatio);
    const armDownTilt = clamp(0.8 + (armWidth * 0.18), 1.2, 5.8);
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
    const pushAnchor = (id, x, y, kind = "minor") => {
      anchors.push({ id, x, y, kind });
    };
    const pushMirrorAnchor = (id, x, y, kind = "minor") => {
      pushAnchor(`${id}-r`, x, y, kind);
      pushAnchor(`${id}-l`, mirrorX(x, CENTER_X), y, kind);
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
      orientation = "vertical"
    ) => {
      const safeOffset = Math.max(1.8, offset);
      pushMirrorAnchor(`${id}-center`, x, y, centerKind);
      if (orientation === "horizontal") {
        pushMirrorAnchor(`${id}-left`, x - safeOffset, y, "minor");
        pushMirrorAnchor(`${id}-right`, x + safeOffset, y, "minor");
        return;
      }
      pushMirrorAnchor(`${id}-top`, x, y - safeOffset, "minor");
      pushMirrorAnchor(`${id}-bottom`, x, y + safeOffset, "minor");
    };
    const pushMirrorLimbCenter = (id, startX, startY, endX, endY, kind = "minor") => {
      pushMirrorAnchor(id, (startX + endX) / 2, (startY + endY) / 2, kind);
    };
    const pushMirrorLimbCurvatureAnchors = (
      id,
      startX,
      startY,
      endX,
      endY,
      startThickness,
      endThickness,
      kind = "minor",
      options = {}
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
        : [0.1, 0.2, 0.34, 0.5, 0.66, 0.8, 0.9];
      const bulgeAt = clamp(toFiniteNumber(options.bulgeAt, 0.5), 0.12, 0.88);
      const bulgeWidth = clamp(toFiniteNumber(options.bulgeWidth, 0.34), 0.2, 0.72);
      const bulgeStrength = clamp(toFiniteNumber(options.bulgeStrength, 0.2), 0, 0.55);
      const jointPinch = clamp(toFiniteNumber(options.jointPinch, 0.12), 0, 0.35);
      const contourSweep = clamp(toFiniteNumber(options.contourSweep, 0.5), -2.5, 2.5);
      const offsetScale = clamp(toFiniteNumber(options.offsetScale, 1), 0.65, 1.45);
      const taperPower = clamp(toFiniteNumber(options.taperPower, 1), 0.72, 1.45);
      const bulgePower = clamp(toFiniteNumber(options.bulgePower, 1.1), 0.8, 1.8);
      const edgeEase = clamp(toFiniteNumber(options.edgeEase, 1.14), 0.7, 2);

      samples.forEach((t, index) => {
        const safeT = clamp(toFiniteNumber(t, 0.5), 0.06, 0.94);
        const thicknessT = Math.pow(safeT, taperPower);
        const bulgeProgress = Math.max(0, 1 - (Math.abs(safeT - bulgeAt) / bulgeWidth));
        const bulgeCurve = Math.pow(bulgeProgress, bulgePower);
        const edgeProgress = Math.pow(Math.max(0, 1 - (Math.abs(safeT - 0.5) / 0.5)), edgeEase);
        const centerX = startX + (dx * safeT);
        const centerY = startY + (dy * safeT);
        const thickness = startThickness + ((endThickness - startThickness) * thicknessT);
        const sculpt = (1 + (bulgeCurve * bulgeStrength)) - ((1 - edgeProgress) * jointPinch);
        const offset = Math.max(1.8, thickness * sculpt * offsetScale);
        const alongBias = Math.sin((safeT - 0.5) * Math.PI) * contourSweep * (0.44 + (edgeProgress * 0.56));

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

        pushMirrorAnchor(`${id}-${index + 1}-top`, top.x, top.y, kind);
        pushMirrorAnchor(`${id}-${index + 1}-bottom`, bottom.x, bottom.y, kind);
      });
    };

    pushAnchor("head-top", CENTER_X, headTopY, "major");
    pushAnchor("head-center", CENTER_X, headCenterY, "minor");
    pushMirrorAnchor("temple", CENTER_X + (headRadius * 0.7), headCenterY - (headRadius * 0.16), "minor");
    rightHeadArc.forEach((point, index) => {
      pushMirrorAnchor(`head-arc-${index + 1}`, point.x, point.y, "minor");
    });
    pushAnchor("chin", CENTER_X, chinY, "major");
    pushMirrorAnchor("jaw", jawRight.x, jawRight.y, "minor");
    pushAnchor("neck-base", CENTER_X, neckBaseY, "major");
    pushMirrorAnchor("neck-side", CENTER_X + neckHalf, neckBaseY - (headRadius * 0.06), "minor");
    pushMirrorAnchor("neck-curve-upper", neckCurveUpperX, neckCurveUpperY, "minor");
    pushMirrorAnchor("neck-curve-mid", neckCurveMidX, neckCurveMidY, "minor");
    pushMirrorAnchor("trap-curve", trapCurveX, trapCurveY, "minor");
    pushMirrorAnchor("trap-shoulder", trapShoulderX, trapShoulderY, "minor");
    pushMirrorAnchor("shoulder-cap", shoulderCapX, shoulderCapY, "minor");
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
    pushMirrorAnchor("upper-arm-mid", upperArmMidX, upperArmMidY, "minor");
    pushMirrorJointTriplet(
      "elbow-joint",
      elbowX,
      elbowY,
      clamp(armWidth * 0.34, 2.2, 6.4),
      "major"
    );
    pushMirrorAnchor("forearm-mid", forearmMidX, forearmMidY, "minor");
    pushMirrorJointTriplet(
      "wrist-joint",
      wristX,
      wristY,
      clamp(armWidth * 0.24, 1.8, 4.6),
      "major"
    );
    pushMirrorAnchor("palm", palmX, wristY, "minor");
    pushMirrorAnchor("underarm", underarmX, underarmY, "minor");
    pushMirrorLimbCenter("upper-arm-center", shoulderX, shoulderY, elbowX, elbowY, "minor");
    pushMirrorLimbCenter("forearm-center", elbowX, elbowY, wristX, wristY, "minor");
    pushMirrorLimbCurvatureAnchors(
      "upper-arm-curve",
      shoulderX,
      shoulderY,
      elbowX,
      elbowY,
      clamp(3.8 + (armWidth * 0.26), 5, 10),
      clamp(3 + (armWidth * 0.2), 4.2, 8),
      "minor",
      {
        samples: [0.03, 0.08, 0.14, 0.21, 0.29, 0.38, 0.48, 0.58, 0.67, 0.76, 0.85, 0.93],
        bulgeAt: 0.36,
        bulgeWidth: 0.34,
        bulgeStrength: 0.32,
        jointPinch: 0.06,
        contourSweep: 0.58,
        offsetScale: 1.1,
        taperPower: 0.92,
        bulgePower: 1.04,
        edgeEase: 1.08
      }
    );
    pushMirrorLimbCurvatureAnchors(
      "forearm-curve",
      elbowX,
      elbowY,
      wristX,
      wristY,
      clamp(3 + (armWidth * 0.2), 4.2, 8),
      clamp(2.2 + (armWidth * 0.12), 3.4, 6.4),
      "minor",
      {
        samples: [0.06, 0.12, 0.2, 0.28, 0.37, 0.47, 0.57, 0.67, 0.77, 0.86, 0.93],
        bulgeAt: 0.46,
        bulgeWidth: 0.33,
        bulgeStrength: 0.24,
        jointPinch: 0.14,
        contourSweep: 0.52,
        offsetScale: 1.08,
        taperPower: 1.07,
        bulgePower: 1.14,
        edgeEase: 1.16
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
      pushMirrorAnchor(`${finger.id}-base`, baseX, fingerBaseYValue, "minor");
      pushMirrorAnchor(`${finger.id}-joint`, jointX, jointY, finger.id === "index" || finger.id === "middle" ? "major" : "minor");
      pushMirrorAnchor(`${finger.id}-tip`, tipX, tipY, "major");
    });

    const handTipX = handTipXValues.length ? Math.max(...handTipXValues) : palmX;
    const handCenterY = wristY + (fingerSpread * 0.16);
    pushMirrorAnchor("hand-tip", handTipX, handCenterY, "major");

    const upperChestY = shoulderY + ((chestY - shoulderY) * 0.44);
    const lowerChestY = chestY + ((waistY - chestY) * 0.36);
    const ribUpperY = chestY + ((waistY - chestY) * 0.18);
    const ribMidY = chestY + ((waistY - chestY) * 0.52);
    const upperWaistY = chestY + ((waistY - chestY) * 0.7);
    const lowerWaistY = waistY + ((hipY - waistY) * 0.34);
    const flankUpperY = waistY + ((hipY - waistY) * 0.18);
    const flankLowerY = waistY + ((hipY - waistY) * 0.52);
    const navelY = waistY + ((hipY - waistY) * 0.2);
    const hipCrestY = hipY - clamp((hipY - waistY) * 0.26, 6, 16);
    const hipDipY = hipY + clamp((thighY - hipY) * 0.16, 4, 12);
    const quadUpperY = hipY + ((kneeY - hipY) * 0.24);
    const hipOuterY = hipY + ((quadUpperY - hipY) * 0.44);
    const quadOuterHighY = hipY + ((quadUpperY - hipY) * 0.7);
    const quadMidY = hipY + ((kneeY - hipY) * 0.48);
    const quadLowerY = hipY + ((kneeY - hipY) * 0.72);

    const upperChestX = CENTER_X + (widthAt(upperChestY) * (0.98 + sideFat * 0.06)) + (upperTorsoBulge * 0.8);
    const lowerChestX = CENTER_X + widthAt(lowerChestY) + (upperTorsoBulge * 1.06);
    const ribUpperX = CENTER_X + (widthAt(ribUpperY) * (1.01 + sideFat * 0.05)) + (midTorsoBulge * 0.72);
    const ribMidX = CENTER_X + (widthAt(ribMidY) * (1.02 + sideFat * 0.06)) + (midTorsoBulge * 0.92);
    const upperWaistX = CENTER_X + (widthAt(upperWaistY) * (0.99 + sideFat * 0.07)) + (midTorsoBulge * 0.88);
    const lowerWaistX = CENTER_X + (widthAt(lowerWaistY) * (1.02 + sideFat * 0.08)) + (lowerTorsoBulge * 0.8);
    const flankUpperX = CENTER_X + widthAt(flankUpperY) + (legStanceSpread * 0.06) + (lowerTorsoBulge * 0.84);
    const flankLowerX = CENTER_X + widthAt(flankLowerY) + (legStanceSpread * 0.1) + (lowerTorsoBulge * 0.94);
    const hipCrestX = CENTER_X + widthAt(hipCrestY) + (legStanceSpread * 0.05) + (lowerTorsoBulge * 0.72);
    const hipDipX = CENTER_X + widthAt(hipDipY) + (legStanceSpread * 0.08) + (lowerTorsoBulge * 0.86);
    const hipOuterX = CENTER_X + widthAt(hipOuterY) + (legStanceSpread * 0.13) + (lowerTorsoBulge * 0.94);
    const quadOuterHighX = CENTER_X + widthAt(quadOuterHighY) + (legStanceSpread * 0.18) + (lowerTorsoBulge * 0.32);
    const quadOuterUpperX = CENTER_X + widthAt(quadUpperY) + (legStanceSpread * 0.15);
    const quadOuterMidX = CENTER_X + widthAt(quadMidY) + (legStanceSpread * 0.19);
    const quadOuterLowerX = CENTER_X + widthAt(quadLowerY) + (legStanceSpread * 0.22);

    pushAnchor("chest-center", CENTER_X, chestY, "major");
    pushAnchor("waist-center", CENTER_X, waistY, "major");
    pushAnchor("pelvis-center", CENTER_X, pelvisY, "major");
    pushAnchor("groin-center", CENTER_X, groinY, "minor");
    pushAnchor("sternum-upper", CENTER_X, upperChestY, "minor");
    pushAnchor("sternum-lower", CENTER_X, lowerChestY, "minor");
    pushAnchor("rib-upper-center", CENTER_X, ribUpperY, "minor");
    pushAnchor("rib-mid-center", CENTER_X, ribMidY, "minor");
    pushAnchor("flank-upper-center", CENTER_X, flankUpperY, "minor");
    pushAnchor("flank-lower-center", CENTER_X, flankLowerY, "minor");
    pushAnchor("navel", CENTER_X, navelY, "minor");
    pushAnchor("quad-center-upper", CENTER_X, quadUpperY, "minor");
    pushAnchor("quad-center-mid", CENTER_X, quadMidY, "minor");
    pushAnchor("quad-center-lower", CENTER_X, quadLowerY, "minor");

    pushMirrorAnchor("upper-chest-side", upperChestX, upperChestY, "minor");
    pushMirrorAnchor("chest-side", chestX, chestY, "minor");
    pushMirrorAnchor("lower-chest-side", lowerChestX, lowerChestY, "minor");
    pushMirrorAnchor("rib-upper-side", ribUpperX, ribUpperY, "minor");
    pushMirrorAnchor("rib-mid-side", ribMidX, ribMidY, "minor");
    pushMirrorAnchor("upper-waist-side", upperWaistX, upperWaistY, "minor");
    pushMirrorAnchor("waist-side", waistX, waistY, "minor");
    pushMirrorAnchor("lower-waist-side", lowerWaistX, lowerWaistY, "minor");
    pushMirrorAnchor("flank-upper-side", flankUpperX, flankUpperY, "minor");
    pushMirrorAnchor("flank-lower-side", flankLowerX, flankLowerY, "minor");
    pushMirrorAnchor("hip-crest", hipCrestX, hipCrestY, "minor");
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
    pushMirrorAnchor("calf", calfX, calfY, "minor");
    pushMirrorJointTriplet(
      "ankle-joint",
      ankleX,
      ankleY,
      clamp(ankleHalf * 0.36, 1.8, 5.2),
      "major",
      "horizontal"
    );
    pushMirrorAnchor("heel", heelX, soleY - 1, "minor");
    pushMirrorAnchor("foot-ball", footBallX, soleY, "minor");
    pushMirrorAnchor("foot-arch", footArchX, footArchY, "minor");
    pushMirrorAnchor("toe", toeX, footY, "major");
    pushMirrorLimbCenter("thigh-center", hipX, hipY, kneeX, kneeY, "minor");
    pushMirrorLimbCenter("calf-center", kneeX, kneeY, ankleX, ankleY, "minor");
    pushMirrorLimbCurvatureAnchors(
      "thigh-curve",
      hipX,
      hipY,
      kneeX,
      kneeY,
      clamp(5 + (thighHalf * 0.16), 7, 14),
      clamp(4 + (kneeHalf * 0.12), 6, 11),
      "minor",
      {
        samples: [0.05, 0.11, 0.18, 0.26, 0.34, 0.43, 0.52, 0.61, 0.7, 0.79, 0.87, 0.94],
        bulgeAt: 0.3,
        bulgeWidth: 0.35,
        bulgeStrength: 0.32,
        jointPinch: 0.09,
        contourSweep: 0.98,
        offsetScale: 1.2,
        taperPower: 0.88,
        bulgePower: 1.03,
        edgeEase: 1.02
      }
    );
    pushMirrorLimbCurvatureAnchors(
      "calf-curve",
      kneeX,
      kneeY,
      ankleX,
      ankleY,
      clamp(4 + (calfHalf * 0.14), 5.4, 10),
      clamp(3 + (ankleHalf * 0.18), 4.8, 8),
      "minor",
      {
        samples: [0.06, 0.13, 0.21, 0.3, 0.39, 0.49, 0.59, 0.68, 0.77, 0.85, 0.92],
        bulgeAt: 0.56,
        bulgeWidth: 0.29,
        bulgeStrength: 0.38,
        jointPinch: 0.14,
        contourSweep: 0.82,
        offsetScale: 1.22,
        taperPower: 1.1,
        bulgePower: 1.22,
        edgeEase: 1.2
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

    pushMirrorAnchor("inner-quad-upper", CENTER_X + innerQuadUpperHalf, quadUpperY, "minor");
    pushMirrorAnchor("inner-quad-mid", CENTER_X + innerQuadMidHalf, quadMidY, "minor");
    pushMirrorAnchor("inner-quad-lower", CENTER_X + innerQuadLowerHalf, quadLowerY, "minor");
    pushMirrorAnchor("inner-thigh", CENTER_X + innerThighHalf, thighY, "minor");
    pushMirrorAnchor("inner-knee", CENTER_X + innerKneeHalf, kneeY, "minor");
    pushMirrorAnchor("inner-calf", CENTER_X + innerCalfHalf, calfY, "minor");
    pushMirrorAnchor("inner-ankle", CENTER_X + innerAnkleHalf, innerAnkleY, "minor");
    pushMirrorAnchor(
      "inner-groin",
      CENTER_X + (groinHalf * 0.96),
      groinY - clamp((thighY - hipY) * 0.03, 0.8, 2.6),
      "minor"
    );

    const anchorLookup = new Map(anchors.map((point) => [point.id, point]));
    const toPoint = (point) => (point ? { x: point.x, y: point.y } : null);
    const getAnchorPoint = (id) => toPoint(anchorLookup.get(id));
    const appendPoint = (collection, point) => {
      if (!point) return;
      const previous = collection[collection.length - 1];
      if (previous && previous.x === point.x && previous.y === point.y) return;
      collection.push(point);
    };
    const chooseYUpper = (top, bottom) => {
      if (top && bottom) return top.y <= bottom.y ? top : bottom;
      return top || bottom || null;
    };
    const chooseYLower = (top, bottom) => {
      if (top && bottom) return top.y >= bottom.y ? top : bottom;
      return top || bottom || null;
    };
    const chooseXOuter = (top, bottom) => {
      if (top && bottom) return top.x >= bottom.x ? top : bottom;
      return top || bottom || null;
    };
    const chooseXInner = (top, bottom) => {
      if (top && bottom) return top.x <= bottom.x ? top : bottom;
      return top || bottom || null;
    };
    const extractCurvePoints = (prefix, side, chooser) => {
      const matcher = new RegExp(`^${prefix}-(\\d+)-(top|bottom)-${side}$`);
      const pairs = new Map();
      anchors.forEach((point) => {
        const match = point.id.match(matcher);
        if (!match) return;
        const index = Number(match[1]);
        const pair = pairs.get(index) || { top: null, bottom: null };
        pair[match[2]] = point;
        pairs.set(index, pair);
      });

      return [...pairs.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([, pair]) => toPoint(chooser(pair.top, pair.bottom) || pair.top || pair.bottom))
        .filter(Boolean);
    };

    const upperArmTop = extractCurvePoints("upper-arm-curve", "r", chooseYUpper);
    const upperArmBottom = extractCurvePoints("upper-arm-curve", "r", chooseYLower);
    const forearmTop = extractCurvePoints("forearm-curve", "r", chooseYUpper);
    const forearmBottom = extractCurvePoints("forearm-curve", "r", chooseYLower);
    const thighOuter = extractCurvePoints("thigh-curve", "r", chooseXOuter);
    const thighInner = extractCurvePoints("thigh-curve", "r", chooseXInner);
    const calfOuter = extractCurvePoints("calf-curve", "r", chooseXOuter);
    const calfInner = extractCurvePoints("calf-curve", "r", chooseXInner);
    const fingerTips = FINGER_CONFIGS
      .map((finger) => getAnchorPoint(`${finger.id}-tip-r`))
      .filter(Boolean)
      .sort((left, right) => left.y - right.y);

    const rightPerimeter = [];
    appendPoint(rightPerimeter, { x: CENTER_X, y: headTopY });
    rightHeadArc.forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("jaw-r"));
    appendPoint(rightPerimeter, getAnchorPoint("neck-curve-upper-r"));
    appendPoint(rightPerimeter, getAnchorPoint("neck-curve-mid-r"));
    appendPoint(rightPerimeter, getAnchorPoint("trap-curve-r"));
    appendPoint(rightPerimeter, getAnchorPoint("trap-shoulder-r"));
    appendPoint(rightPerimeter, getAnchorPoint("shoulder-cap-r"));
    appendPoint(rightPerimeter, getAnchorPoint("shoulder-arm-top-r"));
    appendPoint(rightPerimeter, getAnchorPoint("shoulder-joint-top-r"));
    upperArmTop.forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("elbow-joint-top-r"));
    forearmTop.forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("wrist-joint-top-r"));
    fingerTips.forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("wrist-joint-bottom-r"));
    forearmBottom.slice().reverse().forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("elbow-joint-bottom-r"));
    upperArmBottom.slice().reverse().forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("shoulder-joint-bottom-r"));
    appendPoint(rightPerimeter, getAnchorPoint("shoulder-arm-bottom-r"));
    appendPoint(rightPerimeter, getAnchorPoint("shoulder-lower-r"));
    appendPoint(rightPerimeter, getAnchorPoint("shoulder-rear-r"));
    appendPoint(rightPerimeter, getAnchorPoint("underarm-r"));
    appendPoint(rightPerimeter, getAnchorPoint("upper-chest-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("chest-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("rib-upper-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("lower-chest-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("rib-mid-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("upper-waist-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("waist-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("flank-upper-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("lower-waist-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("flank-lower-side-r"));
    appendPoint(rightPerimeter, getAnchorPoint("hip-crest-r"));
    appendPoint(rightPerimeter, getAnchorPoint("hip-joint-right-r"));
    appendPoint(rightPerimeter, getAnchorPoint("hip-outer-r"));
    appendPoint(rightPerimeter, getAnchorPoint("hip-dip-r"));
    appendPoint(rightPerimeter, getAnchorPoint("quad-outer-high-r"));
    appendPoint(rightPerimeter, getAnchorPoint("quad-outer-upper-r"));
    thighOuter.forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("knee-joint-right-r"));
    calfOuter.forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("ankle-joint-right-r"));
    appendPoint(rightPerimeter, getAnchorPoint("toe-r"));
    appendPoint(rightPerimeter, getAnchorPoint("foot-ball-r"));
    appendPoint(rightPerimeter, getAnchorPoint("heel-r"));
    appendPoint(rightPerimeter, getAnchorPoint("ankle-joint-left-r"));
    appendPoint(rightPerimeter, getAnchorPoint("inner-ankle-r"));
    calfInner.slice().reverse().forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("inner-calf-r"));
    appendPoint(rightPerimeter, getAnchorPoint("knee-joint-left-r"));
    appendPoint(rightPerimeter, getAnchorPoint("inner-knee-r"));
    thighInner.slice().reverse().forEach((point) => appendPoint(rightPerimeter, point));
    appendPoint(rightPerimeter, getAnchorPoint("hip-joint-left-r"));
    appendPoint(rightPerimeter, getAnchorPoint("inner-quad-upper-r"));
    appendPoint(rightPerimeter, getAnchorPoint("inner-groin-r"));
    appendPoint(rightPerimeter, { x: CENTER_X, y: groinY });
    const leftPerimeter = rightPerimeter
      .slice(1, -1)
      .map((point) => ({ x: mirrorX(point.x, CENTER_X), y: point.y }))
      .reverse();
    const outlinePoints = [...rightPerimeter, ...leftPerimeter];
    let outlinePath = "";
    if (outlinePoints.length >= 3) {
      outlinePath = `M ${outlinePoints[0].x} ${outlinePoints[0].y}`;
      for (let index = 1; index < outlinePoints.length - 1; index += 1) {
        const current = outlinePoints[index];
        const next = outlinePoints[index + 1];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        outlinePath += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
      }
      const penultimate = outlinePoints[outlinePoints.length - 2];
      const last = outlinePoints[outlinePoints.length - 1];
      outlinePath += ` Q ${penultimate.x} ${penultimate.y} ${last.x} ${last.y} Z`;
    }

    const outlineMarkers = [];
    const outlineMarkerKeys = new Set();
    const pushOutlineMarker = (x, y) => {
      const key = `${Math.round(x * 10)}:${Math.round(y * 10)}`;
      if (outlineMarkerKeys.has(key)) return;
      outlineMarkerKeys.add(key);
      outlineMarkers.push({ id: `outline-${outlineMarkers.length + 1}`, x, y });
    };
    if (outlinePoints.length >= 2) {
      for (let index = 0; index < outlinePoints.length; index += 1) {
        const current = outlinePoints[index];
        const next = outlinePoints[(index + 1) % outlinePoints.length];
        pushOutlineMarker(current.x, current.y);
        pushOutlineMarker((current.x + next.x) / 2, (current.y + next.y) / 2);
      }
    }

    pushGuide("spine-1", CENTER_X, neckBaseY, CENTER_X, chestY, "bone");
    pushGuide("spine-2", CENTER_X, chestY, CENTER_X, waistY, "bone");
    pushGuide("spine-3", CENTER_X, waistY, CENTER_X, pelvisY, "bone");
    pushGuide("spine-4", CENTER_X, pelvisY, CENTER_X, groinY, "bone");
    pushMirrorGuide("clavicle", CENTER_X, neckBaseY + 1, shoulderX, shoulderY, "bone");
    pushMirrorGuide("upper-arm", shoulderX, shoulderY, elbowX, elbowY, "bone");
    pushMirrorGuide("forearm", elbowX, elbowY, wristX, wristY, "bone");
    pushMirrorGuide("hand-core", wristX, wristY, palmX, wristY, "bone");
    pushMirrorGuide("hand-ray", palmX, wristY, handTipX, handCenterY, "bone");
    pushMirrorGuide("pelvis", CENTER_X, pelvisY, hipX, hipY, "bone");
    pushMirrorGuide("femur", hipX, hipY, kneeX, kneeY, "bone");
    pushMirrorGuide("tibia", kneeX, kneeY, ankleX, ankleY, "bone");
    pushMirrorGuide("foot-long", ankleX, ankleY, toeX, footY, "bone");
    pushMirrorGuide("foot-heel", ankleX, ankleY, heelX, soleY - 1, "bone");

    pushMirrorGuide("chest-band", chestX, chestY, waistX, waistY, "muscle");
    pushMirrorGuide("oblique", chestX, chestY, hipX, hipY, "muscle");
    pushMirrorGuide("lat", underarmX, underarmY, waistX, waistY, "muscle");
    pushMirrorGuide(
      "trap-upper",
      CENTER_X + (neckHalf * 0.66),
      neckBaseY + clamp(headRadius * 0.08, 0.8, 2.8),
      trapCurveX,
      trapCurveY,
      "muscle"
    );
    pushMirrorGuide("trap-lower", trapCurveX, trapCurveY, shoulderCapX, shoulderCapY, "muscle");
    pushMirrorGuide("deltoid-cap", shoulderCapX, shoulderCapY, shoulderLowerX, shoulderLowerY, "muscle");
    pushMirrorGuide("deltoid", shoulderX, shoulderY, underarmX, underarmY, "muscle");
    pushMirrorGuide("upper-arm-mid", shoulderX, shoulderY, upperArmMidX, upperArmMidY, "muscle");
    pushMirrorGuide("upper-arm-end", upperArmMidX, upperArmMidY, elbowX, elbowY, "muscle");
    pushMirrorGuide("forearm-mid", elbowX, elbowY, forearmMidX, forearmMidY, "muscle");
    pushMirrorGuide("forearm-end", forearmMidX, forearmMidY, wristX, wristY, "muscle");
    pushMirrorGuide("quad-top", hipX, hipY, thighX, thighY, "muscle");
    pushMirrorGuide("quad-low", thighX, thighY, kneeX, kneeY, "muscle");
    pushMirrorGuide("calf-top", kneeX, kneeY, calfX, calfY, "muscle");
    pushMirrorGuide("calf-low", calfX, calfY, ankleX, ankleY, "muscle");

    const fillHue = clamp(toFiniteNumber(model.fillHue, fallback.fillHue), 0, 360);
    const fillSaturation = clamp(toFiniteNumber(model.fillSaturation, fallback.fillSaturation), 10, 100);
    const fillLightness = clamp(toFiniteNumber(model.fillLightness, fallback.fillLightness), 10, 90);
    const palette = {
      major: `hsla(${fillHue}, ${Math.max(18, fillSaturation - 6)}%, ${Math.min(94, fillLightness + 42)}%, 0.98)`,
      minor: `hsla(${fillHue}, ${Math.max(16, fillSaturation - 14)}%, ${Math.min(90, fillLightness + 34)}%, 0.9)`,
      glow: `hsla(${fillHue}, ${Math.min(100, fillSaturation + 8)}%, ${Math.min(94, fillLightness + 40)}%, 0.3)`,
      bone: "hsla(204, 88%, 76%, 0.95)",
      muscle: "hsla(9, 84%, 68%, 0.92)",
      boneGlow: "hsla(204, 88%, 76%, 0.26)",
      muscleGlow: "hsla(9, 84%, 68%, 0.24)",
      outline: `hsla(${fillHue}, ${Math.max(22, fillSaturation - 8)}%, ${Math.min(94, fillLightness + 38)}%, 0.96)`,
      outlineGlow: `hsla(${fillHue}, ${Math.min(100, fillSaturation + 4)}%, ${Math.min(94, fillLightness + 30)}%, 0.26)`
    };

    return { anchors, guides, outlineMarkers, outlinePath, palette };
  }, [shape]);

  const anchorStyle = {
    "--anchor-major": palette.major,
    "--anchor-minor": palette.minor,
    "--anchor-glow": palette.glow,
    "--guide-bone": palette.bone,
    "--guide-muscle": palette.muscle,
    "--guide-bone-glow": palette.boneGlow,
    "--guide-muscle-glow": palette.muscleGlow,
    "--outline-stroke": palette.outline,
    "--outline-glow": palette.outlineGlow
  };

  return (
    <svg
      className="physique-2d-svg"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      role="presentation"
      aria-hidden="true"
      style={anchorStyle}
    >
      <path className="physique-outline-line" d={outlinePath} />
      <g className="physique-guide-layer">
        {guides.map((segment) => (
          <line
            key={segment.id}
            className={`physique-guide ${segment.kind}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
          />
        ))}
      </g>
      <g className="physique-point-layer physique-outline-anchor-layer">
        {outlineMarkers.map((point) => (
          <circle
            key={point.id}
            className="physique-point outline"
            cx={point.x}
            cy={point.y}
            r={0.62}
          />
        ))}
      </g>
      <g className="physique-point-layer physique-anchor-layer">
        {anchors.map((point) => (
          <circle
            key={point.id}
            className={`physique-point ${point.kind}`}
            cx={point.x}
            cy={point.y}
            r={point.kind === "major" ? 1.6 : 0.95}
          />
        ))}
      </g>
    </svg>
  );
}
