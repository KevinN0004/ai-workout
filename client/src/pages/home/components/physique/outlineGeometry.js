/**
 * The silhouette outline built from geometry.js's anchors: the right half
 * traced, thinned and mirrored into one closed path. geometry.js falls back to
 * it when templateOutline.js builds no path.
 */
import { mirrorX } from "./math";
import {
  selectImportantSegmentPoints,
  simplifyPerimeterByImportance,
  buildSmoothClosedPath
} from "./outlineUtils";

/**
 * Traces the right half from the head top down the top of the arm, round the
 * fingertips and back along its underside, down the torso and outer leg, round
 * the foot and up the inner leg to the crotch; thins that with
 * simplifyPerimeterByImportance; and mirrors it across `centerX` for the left
 * half. Only the right-side (`-r`) anchors are read, and an anchor that is
 * missing is skipped.
 *
 * Returns the closed run of points, its smoothed path, and `outlineMarkers` for
 * the debug overlay: every point and every segment's midpoint, with any two
 * that round to the same tenth of a unit kept once.
 */
export const buildSymmetricOutline = ({
  anchors,
  rightHeadArc,
  fingerConfigs,
  centerX,
  headTopY,
  shoulderArmTopX,
  quadOuterUpperX,
  pelvisBaseCenterY
}) => {
  // ---- Anchor lookup and pickers --------------------------------------------
  const anchorLookup = new Map(anchors.map((point) => [point.id, point]));
  const toPoint = (point) => (point ? { id: point.id, x: point.x, y: point.y } : null);
  const getAnchorPoint = (id) => toPoint(anchorLookup.get(id));
  const appendPoint = (collection, point) => {
    if (!point) return;
    const previous = collection[collection.length - 1];
    if (previous && previous.x === point.x && previous.y === point.y) return;
    collection.push(point);
  };
  // Each picks one point of a trapezoid sample's top-and-bottom pair.
  // pushMirrorLimbTrapezoidAnchors in geometry.js always pushes both, so the
  // one-sided fallbacks are insurance for an uneven anchor set rather than a
  // path geometry.js takes.
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

  // ---- Limb edges from the trapezoid samples, thinned -----------------------
  const upperArmTop = selectImportantSegmentPoints(
    extractCurvePoints("upper-arm-trapezoid", "r", chooseYUpper),
    { minSpacing: 2.4, minDeviation: 0.32, minTurn: 0.03, maxStride: 2 }
  );
  const upperArmBottom = selectImportantSegmentPoints(
    extractCurvePoints("upper-arm-trapezoid", "r", chooseYLower),
    { minSpacing: 2.4, minDeviation: 0.32, minTurn: 0.03, maxStride: 2 }
  );
  const forearmTop = selectImportantSegmentPoints(
    extractCurvePoints("forearm-trapezoid", "r", chooseYUpper),
    { minSpacing: 2.2, minDeviation: 0.28, minTurn: 0.028, maxStride: 2 }
  );
  const forearmBottom = selectImportantSegmentPoints(
    extractCurvePoints("forearm-trapezoid", "r", chooseYLower),
    { minSpacing: 2.2, minDeviation: 0.28, minTurn: 0.028, maxStride: 2 }
  );
  const thighOuter = selectImportantSegmentPoints(
    extractCurvePoints("thigh-trapezoid", "r", chooseXOuter),
    { minSpacing: 2.8, minDeviation: 0.38, minTurn: 0.04, maxStride: 2 }
  );
  const thighInner = selectImportantSegmentPoints(
    extractCurvePoints("thigh-trapezoid", "r", chooseXInner),
    { minSpacing: 2.8, minDeviation: 0.36, minTurn: 0.038, maxStride: 2 }
  );
  const calfOuter = selectImportantSegmentPoints(
    extractCurvePoints("calf-trapezoid", "r", chooseXOuter),
    { minSpacing: 2.6, minDeviation: 0.34, minTurn: 0.036, maxStride: 2 }
  );
  const calfInner = selectImportantSegmentPoints(
    extractCurvePoints("calf-trapezoid", "r", chooseXInner),
    { minSpacing: 2.6, minDeviation: 0.34, minTurn: 0.036, maxStride: 2 }
  );
  const upperArmTopOutlineRaw = upperArmTop.filter((point) => point.x >= shoulderArmTopX + 0.25);
  const upperArmTopOutline =
    upperArmTopOutlineRaw.length >= 2 ? upperArmTopOutlineRaw : upperArmTop;
  const thighOuterOutline = thighOuter.filter(
    (point, index) => index === 0 || point.x >= quadOuterUpperX - 0.45
  );
  const fingerTips = fingerConfigs
    .map((finger) => getAnchorPoint(`${finger.id}-tip-r`))
    .filter(Boolean)
    .sort((left, right) => left.y - right.y);

  // ---- The right half, head top to crotch -----------------------------------
  const rightPerimeter = [];
  appendPoint(rightPerimeter, { id: "head-top", x: centerX, y: headTopY });
  rightHeadArc.forEach((point, index) =>
    appendPoint(rightPerimeter, { id: `head-arc-${index + 1}-r`, ...point })
  );
  appendPoint(rightPerimeter, getAnchorPoint("jaw-r"));
  appendPoint(rightPerimeter, getAnchorPoint("neck-curve-upper-r"));
  appendPoint(rightPerimeter, getAnchorPoint("neck-curve-mid-r"));
  appendPoint(rightPerimeter, getAnchorPoint("neck-curve-lower-r"));
  appendPoint(rightPerimeter, getAnchorPoint("trap-curve-r"));
  appendPoint(rightPerimeter, getAnchorPoint("trap-shoulder-r"));
  appendPoint(rightPerimeter, getAnchorPoint("shoulder-cap-r"));
  appendPoint(rightPerimeter, getAnchorPoint("shoulder-bridge-r"));
  appendPoint(rightPerimeter, getAnchorPoint("shoulder-crest-r"));
  appendPoint(rightPerimeter, getAnchorPoint("shoulder-top-flow-r"));
  appendPoint(rightPerimeter, getAnchorPoint("shoulder-arm-top-r"));
  upperArmTopOutline.forEach((point) => appendPoint(rightPerimeter, point));
  forearmTop.forEach((point) => appendPoint(rightPerimeter, point));
  fingerTips.forEach((point) => appendPoint(rightPerimeter, point));
  forearmBottom
    .slice()
    .reverse()
    .forEach((point) => appendPoint(rightPerimeter, point));
  upperArmBottom
    .slice()
    .reverse()
    .forEach((point) => appendPoint(rightPerimeter, point));
  appendPoint(rightPerimeter, getAnchorPoint("shoulder-arm-bottom-r"));
  appendPoint(rightPerimeter, getAnchorPoint("shoulder-lower-r"));
  appendPoint(rightPerimeter, getAnchorPoint("shoulder-rear-r"));
  appendPoint(rightPerimeter, getAnchorPoint("armpit-rear-r"));
  appendPoint(rightPerimeter, getAnchorPoint("armpit-apex-r"));
  appendPoint(rightPerimeter, getAnchorPoint("armpit-front-r"));
  appendPoint(rightPerimeter, getAnchorPoint("lat-upper-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("pectoral-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("upper-chest-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("chest-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("serratus-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("rib-upper-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("lower-chest-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("lat-mid-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("rib-mid-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("lat-lower-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("upper-waist-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("waist-pinch-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("waist-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("oblique-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("flank-upper-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("flank-mid-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("lower-waist-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("flank-lower-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("iliac-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("hip-flow-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("hip-crest-r"));
  appendPoint(rightPerimeter, getAnchorPoint("hip-leg-blend-r"));
  appendPoint(rightPerimeter, getAnchorPoint("glute-upper-side-r"));
  appendPoint(rightPerimeter, getAnchorPoint("hip-outer-r"));
  appendPoint(rightPerimeter, getAnchorPoint("hip-dip-r"));
  appendPoint(rightPerimeter, getAnchorPoint("quad-outer-high-r"));
  appendPoint(rightPerimeter, getAnchorPoint("quad-outer-upper-r"));
  thighOuterOutline.forEach((point) => appendPoint(rightPerimeter, point));
  calfOuter.forEach((point) => appendPoint(rightPerimeter, point));
  appendPoint(rightPerimeter, getAnchorPoint("toe-r"));
  appendPoint(rightPerimeter, getAnchorPoint("foot-ball-r"));
  appendPoint(rightPerimeter, getAnchorPoint("heel-r"));
  appendPoint(rightPerimeter, getAnchorPoint("foot-arch-r"));
  appendPoint(rightPerimeter, getAnchorPoint("instep-r"));
  appendPoint(rightPerimeter, getAnchorPoint("ankle-joint-left-r"));
  appendPoint(rightPerimeter, getAnchorPoint("inner-ankle-r"));
  appendPoint(rightPerimeter, getAnchorPoint("inner-calf-upper-r"));
  calfInner
    .slice()
    .reverse()
    .forEach((point) => appendPoint(rightPerimeter, point));
  appendPoint(rightPerimeter, getAnchorPoint("inner-calf-r"));
  appendPoint(rightPerimeter, getAnchorPoint("inner-knee-soft-r"));
  appendPoint(rightPerimeter, getAnchorPoint("inner-knee-r"));
  thighInner
    .slice()
    .reverse()
    .forEach((point) => appendPoint(rightPerimeter, point));
  appendPoint(rightPerimeter, getAnchorPoint("inner-quad-upper-r"));
  appendPoint(rightPerimeter, getAnchorPoint("inner-thigh-root-r"));
  appendPoint(rightPerimeter, getAnchorPoint("pelvis-inner-bridge-r"));
  appendPoint(rightPerimeter, { id: "pelvis-base-center", x: centerX, y: pelvisBaseCenterY });

  // ---- Thin, mirror and close -----------------------------------------------
  // The first and last points, the head top and the crotch, sit on the centre
  // line, so the mirrored half leaves them out rather than doubling them.
  const refinedRightPerimeter = simplifyPerimeterByImportance(rightPerimeter, {
    minSpacing: 2.1,
    minDeviation: 0.34,
    minTurn: 0.04,
    maxStride: 3
  });
  const leftPerimeter = refinedRightPerimeter
    .slice(1, -1)
    .map((point) => ({
      id: typeof point.id === "string" ? point.id.replace(/-r$/, "-l") : undefined,
      x: mirrorX(point.x, centerX),
      y: point.y
    }))
    .reverse();
  const outlinePoints = [...refinedRightPerimeter, ...leftPerimeter];
  const outlinePath = buildSmoothClosedPath(outlinePoints, {
    smoothness: 0.86,
    maxHandleRatio: 0.44,
    minCornerFactor: 0.24
  });

  // ---- Debug markers --------------------------------------------------------
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

  return {
    outlinePoints,
    outlinePath,
    outlineMarkers
  };
};
