import { clamp } from "./math";

export const appendDefaultGuides = ({
  pushGuide,
  pushMirrorGuide,
  centerX,
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
}) => {
  pushGuide("spine-1", centerX, neckBaseY, centerX, chestY, "bone");
  pushGuide("spine-2", centerX, chestY, centerX, waistY, "bone");
  pushGuide("spine-3", centerX, waistY, centerX, pelvisY, "bone");
  pushGuide("spine-4", centerX, pelvisY, centerX, groinY, "bone");
  pushMirrorGuide("clavicle", centerX, neckBaseY + 1, shoulderX, shoulderY, "bone");
  pushMirrorGuide("upper-arm", shoulderX, shoulderY, elbowX, elbowY, "bone");
  pushMirrorGuide("forearm", elbowX, elbowY, wristX, wristY, "bone");
  pushMirrorGuide("hand-core", wristX, wristY, palmX, wristY, "bone");
  pushMirrorGuide("hand-ray", palmX, wristY, handTipX, handCenterY, "bone");
  pushMirrorGuide("pelvis", centerX, pelvisY, hipX, hipY, "bone");
  pushMirrorGuide("femur", hipX, hipY, kneeX, kneeY, "bone");
  pushMirrorGuide("tibia", kneeX, kneeY, ankleX, ankleY, "bone");
  pushMirrorGuide("foot-long", ankleX, ankleY, toeX, footY, "bone");
  pushMirrorGuide("foot-heel", ankleX, ankleY, heelX, soleY - 1, "bone");

  pushMirrorGuide("chest-band", chestX, chestY, waistX, waistY, "muscle");
  pushMirrorGuide("oblique", chestX, chestY, hipX, hipY, "muscle");
  pushMirrorGuide("lat", underarmX, underarmY, waistX, waistY, "muscle");
  pushMirrorGuide(
    "trap-upper",
    centerX + (neckHalf * 0.66),
    neckBaseY + clamp(headRadiusY * 0.08, 0.8, 2.8),
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
};
