/**
 * The silhouette outline morphed from a fixed SVG template: the template's body
 * polygon, scaled into the view box and widened or narrowed band by band to
 * match the model. geometry.js prefers it to the anchor outline whenever it
 * builds.
 */
import templateSvgRaw from "./assets/template-outline.svg?raw";
import { clamp, toFiniteNumber } from "./math";
import { buildSmoothClosedPath, selectImportantSegmentPoints } from "./outlineUtils";

const smoothstep = (edge0, edge1, value) => {
  if (value <= edge0) return 0;
  if (value >= edge1) return 1;
  const t = (value - edge0) / Math.max(1e-6, edge1 - edge0);
  return t * t * (3 - 2 * t);
};

const bellCurve = (value, center, spread) => {
  const normalized = Math.abs(value - center) / Math.max(1, spread);
  if (normalized >= 1) return 0;
  const t = 1 - normalized;
  return t * t * (3 - 2 * t);
};

const interpolateScale = (bands, yValue) => {
  if (!Array.isArray(bands) || !bands.length) return 1;
  if (yValue <= bands[0].y) return bands[0].s;
  for (let index = 0; index < bands.length - 1; index += 1) {
    const current = bands[index];
    const next = bands[index + 1];
    if (yValue > next.y) continue;
    const range = Math.max(1e-6, next.y - current.y);
    const progress = (yValue - current.y) / range;
    return current.s + (next.s - current.s) * progress;
  }
  return bands[bands.length - 1].s;
};

// Chaikin corner cutting: each pass replaces every edge with two points `ratio`
// of the way in from either end, doubling the count, and a pass that would take
// it past `maxPoints` is skipped.
const smoothClosedContour = (points, options = {}) => {
  if (!Array.isArray(points) || points.length < 3) return Array.isArray(points) ? points : [];
  const iterations = Math.max(0, Math.min(2, Math.round(toFiniteNumber(options.iterations, 1))));
  const ratio = clamp(toFiniteNumber(options.ratio, 0.22), 0.12, 0.38);
  const maxPoints = Math.max(24, Math.round(toFiniteNumber(options.maxPoints, 360)));

  let current = points.map((point, index) => ({
    id: point.id || `smooth-${index + 1}`,
    x: point.x,
    y: point.y
  }));

  for (let pass = 0; pass < iterations; pass += 1) {
    if (current.length * 2 > maxPoints) break;
    const next = [];
    for (let index = 0; index < current.length; index += 1) {
      const point = current[index];
      const following = current[(index + 1) % current.length];
      next.push({
        id: `${point.id}-q${pass + 1}`,
        x: point.x * (1 - ratio) + following.x * ratio,
        y: point.y * (1 - ratio) + following.y * ratio
      });
      next.push({
        id: `${point.id}-r${pass + 1}`,
        x: point.x * ratio + following.x * (1 - ratio),
        y: point.y * ratio + following.y * (1 - ratio)
      });
    }
    current = next;
  }

  return current;
};

const buildCurvedPath = (points) => {
  // Too few points to curve through, so there is no path to draw, and
  // buildTemplateOutline returns null in its place.
  if (!Array.isArray(points) || points.length < 3) return "";
  const reduced = selectImportantSegmentPoints(points, {
    minSpacing: 2.2,
    minDeviation: 0.24,
    minTurn: 0.024,
    maxStride: 3
  });
  const controlPoints = reduced.length >= 3 ? reduced : points;
  const smoothedPoints = smoothClosedContour(controlPoints, {
    iterations: 1,
    ratio: 0.22,
    maxPoints: 320
  });
  return buildSmoothClosedPath(smoothedPoints, {
    smoothness: 1.02,
    maxHandleRatio: 0.5,
    minCornerFactor: 0.24
  });
};

// Relaxes the points at the hand end of each arm toward the midpoint of their
// neighbours, more in y than in x, fading in around `handStart` and out past
// `armSpan` beyond it. Points outside the arm's height band are untouched.
const softenDistalArmTips = (points, options = {}) => {
  if (!Array.isArray(points) || points.length < 3) return Array.isArray(points) ? points : [];

  const centerX = toFiniteNumber(options.centerX, 0);
  const armZoneTop = toFiniteNumber(options.armZoneTop, 0);
  const armZoneBottom = toFiniteNumber(options.armZoneBottom, 0);
  const handStart = toFiniteNumber(options.handStart, 0);
  const armSpan = clamp(toFiniteNumber(options.armSpan, 28), 14, 64);

  return points.map((point, index, allPoints) => {
    const absDx = Math.abs(point.x - centerX);
    const inArmBand = point.y >= armZoneTop - 2 && point.y <= armZoneBottom + 2;
    const distalBlend = clamp(
      smoothstep(handStart - 12, handStart + 6, absDx) *
        (1 - smoothstep(handStart + armSpan, handStart + armSpan + 20, absDx)) *
        1.4,
      0,
      1
    );
    if (!inArmBand || distalBlend <= 0) return point;

    const previous = allPoints[(index - 1 + allPoints.length) % allPoints.length];
    const next = allPoints[(index + 1) % allPoints.length];
    const averageX = (previous.x + next.x) / 2;
    const averageY = (previous.y + next.y) / 2;

    return {
      ...point,
      x: point.x + (averageX - point.x) * distalBlend * 0.52,
      y: point.y + (averageY - point.y) * distalBlend * 0.66
    };
  });
};

const getPointBounds = (points) => {
  if (!Array.isArray(points) || !points.length) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0
    };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  points.forEach((point) => {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  });

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};

// Squeezes the outline horizontally about `centerX` when it is wider than the
// view box less its padding, then shifts it sideways if it still overhangs an
// edge. The vertical extent is left alone.
const fitPointsInsideViewbox = (points, { viewboxWidth, paddingX = 8, centerX }) => {
  if (!Array.isArray(points) || points.length < 3) return points;

  const safePaddingX = clamp(paddingX, 4, Math.max(4, viewboxWidth * 0.12));
  const minAllowedX = safePaddingX;
  const maxAllowedX = viewboxWidth - safePaddingX;
  const availableWidth = Math.max(1, maxAllowedX - minAllowedX);

  let adjusted = points.map((point) => ({ ...point }));
  let bounds = getPointBounds(adjusted);

  if (bounds.width > availableWidth) {
    const scaleX = availableWidth / Math.max(1e-6, bounds.width);
    adjusted = adjusted.map((point) => ({
      ...point,
      x: centerX + (point.x - centerX) * scaleX
    }));
    bounds = getPointBounds(adjusted);
  }

  let shiftX = 0;
  if (bounds.minX < minAllowedX) {
    shiftX = minAllowedX - bounds.minX;
  }
  if (bounds.maxX + shiftX > maxAllowedX) {
    shiftX += maxAllowedX - (bounds.maxX + shiftX);
  }

  if (shiftX !== 0) {
    adjusted = adjusted.map((point) => ({ ...point, x: point.x + shiftX }));
  }

  return adjusted;
};

const parsePolygonPoints = (rawPoints) => {
  return String(rawPoints || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => {
      const [xValue, yValue] = token.split(",");
      const x = Number(xValue);
      const y = Number(yValue);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    })
    .filter(Boolean);
};

// The template's body polygon as points, with its bounds. Fewer than three
// points gives an empty template, which buildTemplateOutline treats as none.
const parseTemplate = () => {
  // ---- Find the body polygon ------------------------------------------------
  // The first polygon whose attributes ahead of `points` do not mark it as an
  // unfilled (`fill="none"`) wire.
  const polygonRegex = /<polygon\b([^>]*)\bpoints="([\s\S]*?)"[^>]*>/gi;
  let selectedPoints = "";
  let match = polygonRegex.exec(templateSvgRaw);
  while (match) {
    const attrs = String(match[1] || "");
    const isInteriorWire = /fill\s*=\s*["']none["']/i.test(attrs);
    if (!isInteriorWire) {
      selectedPoints = match[2];
      break;
    }
    match = polygonRegex.exec(templateSvgRaw);
  }

  // ---- Parse it and measure its bounds --------------------------------------
  const points = parsePolygonPoints(selectedPoints);
  if (points.length < 3) {
    return {
      points: [],
      minX: 0,
      minY: 0,
      maxX: 1,
      maxY: 1,
      width: 1,
      height: 1
    };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    points,
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
};

// Parsed once, when the module loads.
const TEMPLATE = parseTemplate();

const MEDICAL_REGION_CURVE_WEIGHTS = {
  // Segment weighting informed by anthropometric segment emphasis used in clinical gait/shape models:
  // trunk drives the dominant cross-sectional variance, pelvis-thigh secondary, distal limbs lower.
  neck: 0.3,
  chest: 0.42,
  shoulder: 0.4,
  trunk: 0.5,
  pelvis: 0.4,
  thigh: 0.34,
  calf: 0.34,
  upperArm: 0.36,
  forearm: 0.28
};

// The size the template is scaled to fit: a width from the model's half-widths
// relative to the fallback's, and a height from its stature relative to the
// fallback's, each kept to a share of the view box.
const buildTemplateSizing = (model, fallback, viewboxWidth, viewboxHeight) => {
  // ---- Width scale ----------------------------------------------------------
  // Each part reads the raw model value, not geometry.js's clamped local, so
  // what bounds it is the clamps below, on the combined scale and on the target
  // width.
  const shoulderScale =
    toFiniteNumber(model?.shoulderHalf, fallback.shoulderHalf) / fallback.shoulderHalf;
  const chestScale = toFiniteNumber(model?.chestHalf, fallback.chestHalf) / fallback.chestHalf;
  const waistScale = toFiniteNumber(model?.waistHalf, fallback.waistHalf) / fallback.waistHalf;
  const hipScale = toFiniteNumber(model?.hipHalf, fallback.hipHalf) / fallback.hipHalf;
  const thighScale = toFiniteNumber(model?.thighHalf, fallback.thighHalf) / fallback.thighHalf;
  const armWidthScale = toFiniteNumber(model?.armWidth, fallback.armWidth) / fallback.armWidth;
  const calfScale = toFiniteNumber(model?.calfHalf, fallback.calfHalf) / fallback.calfHalf;
  const armSpanScale = toFiniteNumber(model?.armSpanRatio, 1);
  const sideFat = clamp(toFiniteNumber(model?.sideFat, 0), 0, 1);
  const widthScale = clamp(
    (shoulderScale * 0.17 +
      chestScale * 0.15 +
      waistScale * 0.18 +
      hipScale * 0.18 +
      thighScale * 0.11 +
      armWidthScale * 0.11 +
      calfScale * 0.1) *
      (armSpanScale * 0.96 + 0.04) *
      (1 + sideFat * 0.1),
    0.78,
    1.28
  );

  // ---- Height scale ---------------------------------------------------------
  const modelStature =
    toFiniteNumber(model?.ankleY, fallback.ankleY) -
    (toFiniteNumber(model?.headCenterY, fallback.headCenterY) -
      toFiniteNumber(model?.headRadius, fallback.headRadius));
  const fallbackStature = fallback.ankleY - (fallback.headCenterY - fallback.headRadius);
  const heightScale = clamp(modelStature / Math.max(1, fallbackStature), 0.9, 1.14);

  // ---- Target size within the view box --------------------------------------
  const baseTargetWidth = viewboxWidth * 0.82;
  const baseTargetHeight = viewboxHeight * 0.98;
  const targetWidth = clamp(baseTargetWidth * widthScale, viewboxWidth * 0.68, viewboxWidth * 0.91);
  const targetHeight = clamp(
    baseTargetHeight * heightScale,
    viewboxHeight * 0.86,
    viewboxHeight * 0.998
  );

  return { targetWidth, targetHeight };
};

// `shape`'s half-widths and landmark heights, re-clamped to this module's own
// ranges (wider than geometry.js's for the half-widths), with the head, neck,
// groin and knee points derived from them. buildTemplateOutline runs it on the
// model and on the fallback, and morphs by how the two compare.
const buildDerivedMetrics = (shape, fallback, viewboxHeight) => {
  // ---- Half-widths ----------------------------------------------------------
  const shoulderHalf = clamp(toFiniteNumber(shape?.shoulderHalf, fallback.shoulderHalf), 20, 90);
  const chestHalf = clamp(toFiniteNumber(shape?.chestHalf, fallback.chestHalf), 12, 80);
  const waistHalf = clamp(toFiniteNumber(shape?.waistHalf, fallback.waistHalf), 8, 70);
  const hipHalf = clamp(toFiniteNumber(shape?.hipHalf, fallback.hipHalf), 10, 80);
  const thighHalf = clamp(toFiniteNumber(shape?.thighHalf, fallback.thighHalf), 8, 60);
  const calfHalf = clamp(toFiniteNumber(shape?.calfHalf, fallback.calfHalf), 7, 48);
  const armWidth = clamp(toFiniteNumber(shape?.armWidth, fallback.armWidth), 6, 30);
  const armHeight = clamp(toFiniteNumber(shape?.armHeight, fallback.armHeight), 120, 220);
  const armSpanRatio = clamp(toFiniteNumber(shape?.armSpanRatio, 1), 0.94, 1.08);
  const headRadius = clamp(toFiniteNumber(shape?.headRadius, fallback.headRadius), 12, 34);

  // ---- Landmark heights -----------------------------------------------------
  const shoulderY = clamp(
    toFiniteNumber(shape?.shoulderY, fallback.shoulderY),
    40,
    viewboxHeight - 70
  );
  const chestY = clamp(
    toFiniteNumber(shape?.chestY, fallback.chestY),
    shoulderY + 8,
    viewboxHeight - 60
  );
  const waistY = clamp(
    toFiniteNumber(shape?.waistY, fallback.waistY),
    chestY + 8,
    viewboxHeight - 50
  );
  const hipY = clamp(toFiniteNumber(shape?.hipY, fallback.hipY), waistY + 5, viewboxHeight - 42);
  const thighY = clamp(
    toFiniteNumber(shape?.thighY, fallback.thighY),
    hipY + 8,
    viewboxHeight - 32
  );
  const calfY = clamp(toFiniteNumber(shape?.calfY, fallback.calfY), thighY + 8, viewboxHeight - 18);
  const ankleY = clamp(
    toFiniteNumber(shape?.ankleY, fallback.ankleY),
    calfY + 8,
    viewboxHeight - 2
  );
  const headCenterY = clamp(
    toFiniteNumber(shape?.headCenterY, fallback.headCenterY),
    20,
    shoulderY - 20
  );

  // ---- Points derived from the heights --------------------------------------
  const headTopY = headCenterY - headRadius;
  const chinY = headCenterY + headRadius;
  const headUpperY = headCenterY - headRadius * 0.46;
  const headLowerY = headCenterY + headRadius * 0.58;
  const neckBaseY = chinY + headRadius * 0.28;
  const groinY = hipY + (thighY - hipY) * 0.13;
  const kneeY = thighY + (calfY - thighY) * 0.38;
  const groinHalf = clamp(hipHalf * 0.18, 5, 14);
  const kneeHalf = clamp(thighHalf * 0.64 + calfHalf * 0.24, 8, Math.max(10, thighHalf * 0.98));
  const ankleHalf = clamp(calfHalf * 0.46, 5, 22);
  const neckHalf = clamp(headRadius * 0.34 + shoulderHalf * 0.048, 6, shoulderHalf * 0.42);

  return {
    shoulderHalf,
    chestHalf,
    waistHalf,
    hipHalf,
    thighHalf,
    calfHalf,
    armWidth,
    armHeight,
    armSpanRatio,
    headRadius,
    shoulderY,
    chestY,
    waistY,
    hipY,
    thighY,
    calfY,
    ankleY,
    headCenterY,
    headTopY,
    headUpperY,
    headLowerY,
    chinY,
    neckBaseY,
    groinY,
    kneeY,
    groinHalf,
    kneeHalf,
    ankleHalf,
    neckHalf
  };
};

// The horizontal scale at each of the model's landmark heights: the model's
// size there over the fallback's, clamped per band, then sorted by height, with
// a band level with the one before it moved a hundredth of a unit lower.
// interpolateScale reads between them.
const buildScaleBands = (metrics, fallbackMetrics) => {
  // ---- One band per landmark ------------------------------------------------
  const withScale = (y, value, fallbackValue, min = 0.78, max = 1.24) => ({
    y,
    s: clamp(value / Math.max(1, fallbackValue), min, max)
  });

  const bands = [
    withScale(
      metrics.headTopY,
      metrics.headRadius * 0.78,
      fallbackMetrics.headRadius * 0.78,
      0.82,
      1.14
    ),
    withScale(
      metrics.headUpperY,
      metrics.headRadius * 0.9,
      fallbackMetrics.headRadius * 0.9,
      0.84,
      1.16
    ),
    withScale(
      metrics.headCenterY,
      metrics.headRadius * 0.95,
      fallbackMetrics.headRadius * 0.95,
      0.84,
      1.16
    ),
    withScale(
      metrics.headLowerY,
      metrics.headRadius * 0.88,
      fallbackMetrics.headRadius * 0.88,
      0.84,
      1.15
    ),
    withScale(
      metrics.chinY,
      metrics.headRadius * 0.8,
      fallbackMetrics.headRadius * 0.8,
      0.82,
      1.14
    ),
    withScale(metrics.neckBaseY, metrics.neckHalf, fallbackMetrics.neckHalf, 0.84, 1.22),
    withScale(metrics.shoulderY, metrics.shoulderHalf, fallbackMetrics.shoulderHalf, 0.78, 1.26),
    withScale(metrics.chestY, metrics.chestHalf, fallbackMetrics.chestHalf, 0.78, 1.32),
    withScale(metrics.waistY, metrics.waistHalf, fallbackMetrics.waistHalf, 0.76, 1.42),
    withScale(metrics.hipY, metrics.hipHalf, fallbackMetrics.hipHalf, 0.76, 1.4),
    withScale(metrics.groinY, metrics.groinHalf, fallbackMetrics.groinHalf, 0.76, 1.34),
    withScale(metrics.thighY, metrics.thighHalf, fallbackMetrics.thighHalf, 0.76, 1.34),
    withScale(metrics.kneeY, metrics.kneeHalf, fallbackMetrics.kneeHalf, 0.76, 1.32),
    withScale(metrics.calfY, metrics.calfHalf, fallbackMetrics.calfHalf, 0.76, 1.32),
    withScale(metrics.ankleY, metrics.ankleHalf, fallbackMetrics.ankleHalf, 0.78, 1.24)
  ];

  // ---- Sorted by height, ties moved apart -----------------------------------
  return bands
    .sort((left, right) => left.y - right.y)
    .map((band, index, allBands) => {
      if (index === 0) return band;
      const previous = allBands[index - 1];
      if (band.y <= previous.y) {
        return { ...band, y: previous.y + 0.01 };
      }
      return band;
    });
};

/**
 * The template outline fitted to `model`, which geometry.js passes raw, with
 * `fallback` as the reference figure. The template is scaled uniformly to
 * buildTemplateSizing's target, centred, and stood just above the view box's
 * bottom edge. Each point is then widened or narrowed about the centre line by
 * how the model's size at that height compares with the fallback's, then
 * reshaped region by region, head to arms, by the same comparison and by the
 * model's fat channels; in the arm band its upper and lower edges are also
 * pushed apart. Last, the outline is kept within the view box's width and the
 * hand ends are softened.
 *
 * Returns `{ path, outlineMarkers }`, the markers being every morphed point, or
 * null when the template has fewer than three points or no path results.
 */
export const buildTemplateOutline = ({ model, fallback, viewboxWidth, viewboxHeight }) => {
  if (!Array.isArray(TEMPLATE.points) || TEMPLATE.points.length < 3) return null;

  // ---- Metrics, target size and placement -----------------------------------
  const metrics = buildDerivedMetrics(model, fallback, viewboxHeight);
  const fallbackMetrics = buildDerivedMetrics(fallback, fallback, viewboxHeight);
  const { targetWidth, targetHeight } = buildTemplateSizing(
    model,
    fallback,
    viewboxWidth,
    viewboxHeight
  );

  const uniformScale = Math.min(targetWidth / TEMPLATE.width, targetHeight / TEMPLATE.height);
  const usedWidth = TEMPLATE.width * uniformScale;
  const usedHeight = TEMPLATE.height * uniformScale;
  const insetX = (viewboxWidth - usedWidth) / 2;
  const insetY = viewboxHeight - usedHeight - 3;
  const centerX = viewboxWidth / 2;

  // ---- How far the model is from the fallback, by region --------------------
  const bands = buildScaleBands(metrics, fallbackMetrics);
  const armReachScale = clamp(
    (metrics.armHeight / fallbackMetrics.armHeight) * 0.64 + metrics.armSpanRatio * 0.36,
    0.88,
    1.18
  );
  const shoulderInflation = clamp(
    metrics.shoulderHalf / Math.max(1, fallbackMetrics.shoulderHalf) - 1,
    0,
    0.58
  );
  const armThicknessScale = clamp(metrics.armWidth / fallbackMetrics.armWidth, 0.82, 1.4);
  const armInflation = clamp(metrics.armWidth / Math.max(1, fallbackMetrics.armWidth) - 1, 0, 0.85);
  const chestInflation = clamp(
    metrics.chestHalf / Math.max(1, fallbackMetrics.chestHalf) - 1,
    0,
    0.72
  );
  const waistInflation = clamp(
    metrics.waistHalf / Math.max(1, fallbackMetrics.waistHalf) - 1,
    0,
    0.88
  );
  const hipInflation = clamp(metrics.hipHalf / Math.max(1, fallbackMetrics.hipHalf) - 1, 0, 0.74);
  const thighInflation = clamp(
    metrics.thighHalf / Math.max(1, fallbackMetrics.thighHalf) - 1,
    0,
    0.74
  );
  const calfInflation = clamp(metrics.calfHalf / Math.max(1, fallbackMetrics.calfHalf) - 1, 0, 1);
  const neckInflation = clamp(
    metrics.neckHalf / Math.max(1, fallbackMetrics.neckHalf) - 1,
    0,
    0.64
  );
  const sideFat = clamp(toFiniteNumber(model?.sideFat, 0), 0, 1);
  const shoulderFat = clamp(toFiniteNumber(model?.shoulderFat, 0), 0, 1);
  const chestFat = clamp(toFiniteNumber(model?.chestFat, sideFat * 0.78), 0, 1);
  const armFat = clamp(toFiniteNumber(model?.armFat, sideFat * 0.58 + shoulderFat * 0.42), 0, 1);
  const calfFat = clamp(toFiniteNumber(model?.calfFat, sideFat * 0.46), 0, 1);
  const calfProfile = clamp(toFiniteNumber(model?.lowerLegAdiposity, calfFat), 0, 1.5);

  // ---- Zones the regional boosts act in -------------------------------------
  // Heights are in view-box y; `armStart`, `legInnerStart` and the like are
  // distances out from the centre line.
  const armZoneTop = metrics.shoulderY - clamp(metrics.armWidth * 2.8, 15, 36);
  const armZoneBottom = metrics.shoulderY + clamp(metrics.armWidth * 3.2, 20, 46);
  const armStart = clamp(metrics.shoulderHalf + 14, 48, 122);
  const handBoostStart = armStart + clamp(metrics.armWidth * 3.2, 22, 58);
  const torsoTop = metrics.chestY - clamp((metrics.waistY - metrics.chestY) * 0.34, 8, 26);
  const torsoBottom = metrics.thighY + clamp((metrics.thighY - metrics.hipY) * 0.22, 8, 24);
  const upperArmSplit = armStart + (handBoostStart - armStart) * 0.5;
  const legInnerStart = metrics.groinHalf * 1.04;
  const legMidStart = legInnerStart + clamp(metrics.thighHalf * 0.34, 4, 16);
  const legMidEnd = legMidStart + clamp((metrics.thighHalf + metrics.calfHalf) * 0.52, 12, 36);
  const calfSpreadStart = legInnerStart + clamp(metrics.calfHalf * 0.18, 1.8, 8.8);
  const calfSpreadPeakStart = legMidStart + clamp(metrics.calfHalf * 0.12, 1.2, 6.2);
  const calfSpreadEnd = legMidEnd + clamp(metrics.calfHalf * 0.96, 10, 30);
  const calfVerticalFadeStart = metrics.calfY + (metrics.ankleY - metrics.calfY) * 0.34;
  const calfPeakTop = metrics.kneeY + (metrics.calfY - metrics.kneeY) * 0.12;
  const calfPeakBottom = metrics.calfY + (metrics.ankleY - metrics.calfY) * 0.32;

  // ---- Morph each template point --------------------------------------------
  // Only the horizontal scale about the centre line changes, except in the arm
  // band, where `yOffset` also moves the arm's edges.
  const morphedPoints = TEMPLATE.points.map((point, index) => {
    // ---- Base position and the horizontal zones -----------------------------
    const baseX = (point.x - TEMPLATE.minX) * uniformScale + insetX;
    const baseY = (point.y - TEMPLATE.minY) * uniformScale + insetY;
    const dx = baseX - centerX;
    const absDx = Math.abs(dx);
    const torsoCoreBlend = 1 - smoothstep(armStart * 0.42, armStart * 0.82, absDx);
    const torsoSideBlend = clamp(
      smoothstep(legInnerStart * 0.62, armStart * 0.72, absDx) *
        (1 - smoothstep(armStart * 1.18, armStart * 1.52, absDx)) *
        1.8,
      0,
      1
    );
    const shoulderContourBlend = clamp(
      smoothstep(armStart * 0.72, armStart * 1.02, absDx) *
        (1 - smoothstep(armStart * 1.28, armStart * 1.68, absDx)) *
        1.7,
      0,
      1
    );

    // The banded scale at this height, which each region below multiplies.
    let xScale = interpolateScale(bands, baseY);
    let yOffset = 0;

    // ---- Head ---------------------------------------------------------------
    if (baseY >= metrics.headTopY - 1 && baseY <= metrics.neckBaseY + 1) {
      const topTaper = bellCurve(
        baseY,
        metrics.headTopY + metrics.headRadius * 0.18,
        Math.max(4, metrics.headRadius * 0.36)
      );
      const chinTaper = bellCurve(
        baseY,
        metrics.chinY - metrics.headRadius * 0.14,
        Math.max(4, metrics.headRadius * 0.34)
      );
      const midBulge = bellCurve(
        baseY,
        metrics.headCenterY,
        Math.max(4, metrics.headRadius * 0.44)
      );
      xScale *= 1 - (topTaper * 0.08 + chinTaper * 0.07);
      xScale *= 1 + midBulge * 0.04;
    }

    // ---- Neck ---------------------------------------------------------------
    const neckInfluence = bellCurve(
      baseY,
      metrics.neckBaseY - (metrics.neckBaseY - metrics.headCenterY) * 0.2,
      clamp((metrics.shoulderY - metrics.headCenterY) * 0.44, 10, 26)
    );
    const neckBlend = clamp(torsoCoreBlend * 0.74 + torsoSideBlend * 0.38, 0, 1);
    xScale *=
      1 +
      (neckInflation * MEDICAL_REGION_CURVE_WEIGHTS.neck + shoulderFat * 0.07) *
        neckInfluence *
        neckBlend;

    // ---- Shoulders and torso ------------------------------------------------
    const shoulderInfluence = bellCurve(
      baseY,
      metrics.shoulderY,
      clamp(metrics.armWidth * 2.8, 16, 34)
    );
    const torsoInfluence = bellCurve(
      baseY,
      metrics.waistY,
      clamp((metrics.hipY - metrics.chestY) * 0.7, 24, 66)
    );
    const shoulderBoost = clamp(
      shoulderFat * 0.16 +
        shoulderInflation * MEDICAL_REGION_CURVE_WEIGHTS.shoulder +
        chestFat * 0.08 +
        sideFat * 0.08,
      0,
      0.4
    );
    xScale *= 1 + shoulderBoost * shoulderInfluence * (0.46 + shoulderContourBlend);
    xScale *= 1 + sideFat * 0.18 * torsoInfluence;

    // ---- Chest --------------------------------------------------------------
    const chestInfluence = bellCurve(
      baseY,
      metrics.chestY,
      clamp((metrics.waistY - metrics.chestY) * 0.58, 16, 46)
    );
    const chestBlend = clamp(torsoCoreBlend * 0.36 + torsoSideBlend * 0.88, 0, 1);
    const chestBoost = clamp(
      chestInflation * MEDICAL_REGION_CURVE_WEIGHTS.chest + chestFat * 0.24 + sideFat * 0.12,
      0,
      0.52
    );
    xScale *= 1 + chestBoost * chestInfluence * chestBlend;

    // ---- Waist and lower torso ----------------------------------------------
    const torsoVertical = clamp(
      smoothstep(torsoTop, metrics.waistY, baseY) *
        (1 - smoothstep(metrics.hipY, torsoBottom, baseY)) *
        1.86,
      0,
      1
    );
    const torsoBlend = clamp(torsoCoreBlend * 0.28 + torsoSideBlend * 0.94, 0, 1);
    const torsoBoost = clamp(
      sideFat * 0.34 +
        waistInflation * 0.9 * MEDICAL_REGION_CURVE_WEIGHTS.trunk +
        hipInflation * 0.48,
      0,
      0.58
    );
    xScale *= 1 + torsoBoost * torsoVertical * torsoBlend;

    // ---- Hips ---------------------------------------------------------------
    const hipInfluence = bellCurve(
      baseY,
      metrics.hipY,
      clamp((metrics.thighY - metrics.waistY) * 0.72, 22, 62)
    );
    const hipBlend = clamp(torsoSideBlend * 0.92 + torsoCoreBlend * 0.24, 0, 1);
    xScale *=
      1 +
      (sideFat * 0.16 + hipInflation * MEDICAL_REGION_CURVE_WEIGHTS.pelvis) *
        hipInfluence *
        hipBlend;

    // ---- Legs ---------------------------------------------------------------
    const thighInfluence = bellCurve(
      baseY,
      metrics.thighY,
      clamp((metrics.kneeY - metrics.hipY) * 0.66, 18, 52)
    );
    const calfInfluence = bellCurve(
      baseY,
      metrics.calfY,
      clamp((metrics.ankleY - metrics.kneeY) * 0.72, 18, 46)
    );
    const legSpreadBlend = clamp(
      smoothstep(legInnerStart, legMidStart, absDx) *
        (1 - smoothstep(legMidEnd, legMidEnd + 18, absDx)) *
        1.7,
      0,
      1
    );
    const calfSpreadBlend = clamp(
      smoothstep(calfSpreadStart, calfSpreadPeakStart, absDx) *
        (1 - smoothstep(calfSpreadEnd, calfSpreadEnd + 22, absDx)) *
        2,
      0,
      1
    );
    const calfOuterBlend = smoothstep(calfSpreadPeakStart * 0.9, calfSpreadEnd * 0.9, absDx);
    const calfBulgeVertical = clamp(
      smoothstep(calfPeakTop, metrics.calfY, baseY) *
        (1 - smoothstep(calfPeakBottom, metrics.ankleY + 1, baseY)) *
        1.9,
      0,
      1
    );
    const ankleFade = 1 - smoothstep(calfVerticalFadeStart, metrics.ankleY + 2, baseY);
    const calfZoneInfluence = clamp(calfInfluence * ankleFade, 0, 1);
    xScale *=
      1 +
      (thighInflation * MEDICAL_REGION_CURVE_WEIGHTS.thigh + sideFat * 0.1) *
        thighInfluence *
        legSpreadBlend;
    const calfShapeBoost = clamp(
      calfInflation * MEDICAL_REGION_CURVE_WEIGHTS.calf +
        calfFat * 0.32 +
        calfProfile * 0.22 +
        sideFat * 0.05,
      0,
      0.82
    );
    xScale *=
      1 +
      calfShapeBoost *
        Math.max(calfZoneInfluence, calfBulgeVertical) *
        Math.max(calfSpreadBlend, legSpreadBlend * 0.5);
    xScale *= 1 + calfFat * 0.12 * calfBulgeVertical * calfOuterBlend;

    // ---- Arms ---------------------------------------------------------------
    if (baseY >= armZoneTop && baseY <= armZoneBottom) {
      const topBlend = smoothstep(armZoneTop, metrics.shoulderY, baseY);
      const bottomBlend = 1 - smoothstep(metrics.shoulderY, armZoneBottom, baseY);
      const shoulderBandInfluence = bellCurve(
        baseY,
        metrics.shoulderY,
        clamp(metrics.armWidth * 3.6, 18, 42)
      );
      const armYBlend = clamp(
        Math.max(topBlend * bottomBlend * 1.75, shoulderBandInfluence * 0.88),
        0,
        1
      );
      const edgeBlend = smoothstep(armStart * 0.78, armStart + 58, absDx);
      const handBlend = smoothstep(handBoostStart, handBoostStart + 42, absDx);
      const wristTransition = smoothstep(handBoostStart - 8, handBoostStart + 16, absDx);
      const handInfluence = handBlend * (1 - wristTransition * 0.72);
      const upperArmBlend = clamp(
        smoothstep(armStart * 0.9, upperArmSplit, absDx) *
          (1 - smoothstep(upperArmSplit, upperArmSplit + 22, absDx)) *
          1.95,
        0,
        1
      );
      const forearmBlend = clamp(
        smoothstep(upperArmSplit - 6, handBoostStart, absDx) *
          (1 - smoothstep(handBoostStart + 26, handBoostStart + 52, absDx)) *
          1.35,
        0,
        1
      );
      const armAdiposeBoost = 1 + armFat * 0.5 + shoulderFat * 0.18 + armInflation * 0.4;
      const armFatSpread = clamp(armFat * 0.32 + armInflation * 0.24 + shoulderFat * 0.08, 0, 0.44);
      xScale *= 1 + (armReachScale - 1) * armYBlend * edgeBlend;
      xScale *=
        1 +
        (armThicknessScale - 1) *
          armAdiposeBoost *
          armYBlend *
          (upperArmBlend * MEDICAL_REGION_CURVE_WEIGHTS.upperArm +
            forearmBlend * MEDICAL_REGION_CURVE_WEIGHTS.forearm +
            handInfluence * 0.2);
      xScale *=
        1 +
        armFatSpread *
          armYBlend *
          (upperArmBlend * 0.9 + forearmBlend * 0.72 + handInfluence * 0.16 + edgeBlend * 0.18);
      xScale *= 1 + chestFat * 0.08 * armYBlend * (1 - edgeBlend) * shoulderContourBlend;

      // Add convex contour on upper/lower arm edge so bicep/tricep/forearm read as rounded masses.
      const armHalfHeight = Math.max(1, (armZoneBottom - armZoneTop) / 2);
      const armCenterOffset = Math.abs(baseY - metrics.shoulderY);
      const armEdgeProfile = clamp(
        smoothstep(armHalfHeight * 0.2, armHalfHeight * 0.74, armCenterOffset) *
          (1 - smoothstep(armHalfHeight * 0.92, armHalfHeight * 1.14, armCenterOffset)) *
          2,
        0,
        1
      );
      const armZoneFade = clamp(
        smoothstep(armZoneTop, armZoneTop + 4, baseY) *
          (1 - smoothstep(armZoneBottom - 4, armZoneBottom, baseY)) *
          1.25,
        0,
        1
      );
      const bicepBlend = clamp(upperArmBlend * (0.98 + (1 - armFat) * 0.12), 0, 1.3);
      const tricepBlend = clamp(upperArmBlend * (0.88 + armFat * 0.26), 0, 1.3);
      const forearmContourBlend = clamp(forearmBlend * (0.92 + armInflation * 0.16), 0, 1.35);
      const armConvexity = clamp(
        0.18 + armInflation * 0.34 + armFat * 0.22 + (armThicknessScale - 1) * 0.32,
        0.12,
        0.78
      );
      const armContourAmplitude = clamp(metrics.armWidth * 0.26, 1.6, 6.4);
      const armContourOffset =
        armContourAmplitude *
        armConvexity *
        armEdgeProfile *
        edgeBlend *
        armZoneFade *
        (bicepBlend * 0.52 + tricepBlend * 0.32 + forearmContourBlend * 0.44);
      const armSideSign = baseY >= metrics.shoulderY ? 1 : -1;
      const lowerArmBias = armSideSign > 0 ? 1.08 : 0.94;
      const wristContourFade = 1 - wristTransition * 0.86;
      yOffset += armSideSign * armContourOffset * lowerArmBias * wristContourFade;
    }

    return {
      id: `template-${index + 1}`,
      x: centerX + dx * xScale,
      y: baseY + yOffset
    };
  });

  // ---- Fit, soften and draw -------------------------------------------------
  const fittedPoints = fitPointsInsideViewbox(morphedPoints, {
    viewboxWidth,
    paddingX: 12,
    centerX
  });
  const distalArmSmoothedPoints = softenDistalArmTips(fittedPoints, {
    centerX,
    armZoneTop,
    armZoneBottom,
    handStart: handBoostStart,
    armSpan: clamp(metrics.armWidth * 3.2, 16, 44)
  });

  const path = buildCurvedPath(distalArmSmoothedPoints);
  if (!path) return null;

  return {
    path,
    outlineMarkers: distalArmSmoothedPoints
  };
};
