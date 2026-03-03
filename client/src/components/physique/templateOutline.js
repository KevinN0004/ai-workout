import templateSvgRaw from "./assets/template-outline.svg?raw";
import { clamp, toFiniteNumber } from "./math";
import { buildSmoothClosedPath, selectImportantSegmentPoints } from "./outlineUtils";

const round3 = (value) => Math.round(value * 1000) / 1000;

const smoothstep = (edge0, edge1, value) => {
  if (value <= edge0) return 0;
  if (value >= edge1) return 1;
  const t = (value - edge0) / Math.max(1e-6, edge1 - edge0);
  return t * t * (3 - (2 * t));
};

const bellCurve = (value, center, spread) => {
  const normalized = Math.abs(value - center) / Math.max(1, spread);
  if (normalized >= 1) return 0;
  const t = 1 - normalized;
  return t * t * (3 - (2 * t));
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
    return current.s + ((next.s - current.s) * progress);
  }
  return bands[bands.length - 1].s;
};

const pointsToPath = (points) => {
  if (!Array.isArray(points) || points.length < 3) return "";
  const [first, ...rest] = points;
  const commands = [`M ${round3(first.x)} ${round3(first.y)}`];
  rest.forEach((point) => {
    commands.push(`L ${round3(point.x)} ${round3(point.y)}`);
  });
  commands.push("Z");
  return commands.join(" ");
};

const buildCurvedPath = (points) => {
  if (!Array.isArray(points) || points.length < 3) return pointsToPath(points);
  const reduced = selectImportantSegmentPoints(points, {
    minSpacing: 2,
    minDeviation: 0.2,
    minTurn: 0.02,
    maxStride: 2
  });
  const controlPoints = reduced.length >= 3 ? reduced : points;
  return buildSmoothClosedPath(controlPoints, {
    smoothness: 0.9,
    maxHandleRatio: 0.42,
    minCornerFactor: 0.18
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

const fitPointsInsideViewbox = (points, { viewboxWidth, paddingX = 8, centerX }) => {
  if (!Array.isArray(points) || points.length < 3) return points;

  const safePaddingX = clamp(paddingX, 4, Math.max(4, (viewboxWidth * 0.12)));
  const minAllowedX = safePaddingX;
  const maxAllowedX = viewboxWidth - safePaddingX;
  const availableWidth = Math.max(1, maxAllowedX - minAllowedX);

  let adjusted = points.map((point) => ({ ...point }));
  let bounds = getPointBounds(adjusted);

  if (bounds.width > availableWidth) {
    const scaleX = availableWidth / Math.max(1e-6, bounds.width);
    adjusted = adjusted.map((point) => ({
      ...point,
      x: centerX + ((point.x - centerX) * scaleX)
    }));
    bounds = getPointBounds(adjusted);
  }

  let shiftX = 0;
  if (bounds.minX < minAllowedX) {
    shiftX = minAllowedX - bounds.minX;
  }
  if ((bounds.maxX + shiftX) > maxAllowedX) {
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

const parseTemplate = () => {
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

const TEMPLATE = parseTemplate();

const buildTemplateSizing = (model, fallback, viewboxWidth, viewboxHeight) => {
  const shoulderScale = toFiniteNumber(model?.shoulderHalf, fallback.shoulderHalf) / fallback.shoulderHalf;
  const chestScale = toFiniteNumber(model?.chestHalf, fallback.chestHalf) / fallback.chestHalf;
  const waistScale = toFiniteNumber(model?.waistHalf, fallback.waistHalf) / fallback.waistHalf;
  const hipScale = toFiniteNumber(model?.hipHalf, fallback.hipHalf) / fallback.hipHalf;
  const thighScale = toFiniteNumber(model?.thighHalf, fallback.thighHalf) / fallback.thighHalf;
  const armSpanScale = toFiniteNumber(model?.armSpanRatio, 1);
  const widthScale = clamp(
    (shoulderScale * 0.28) +
      (chestScale * 0.17) +
      (waistScale * 0.13) +
      (hipScale * 0.16) +
      (thighScale * 0.1) +
      (armSpanScale * 0.16),
    0.76,
    1.3
  );

  const modelStature = toFiniteNumber(model?.ankleY, fallback.ankleY) -
    (toFiniteNumber(model?.headCenterY, fallback.headCenterY) - toFiniteNumber(model?.headRadius, fallback.headRadius));
  const fallbackStature = fallback.ankleY - (fallback.headCenterY - fallback.headRadius);
  const heightScale = clamp(modelStature / Math.max(1, fallbackStature), 0.9, 1.14);

  const baseTargetWidth = viewboxWidth * 0.95;
  const baseTargetHeight = viewboxHeight * 0.98;
  const targetWidth = clamp(baseTargetWidth * widthScale, viewboxWidth * 0.76, viewboxWidth * 0.998);
  const targetHeight = clamp(baseTargetHeight * heightScale, viewboxHeight * 0.86, viewboxHeight * 0.998);

  return { targetWidth, targetHeight };
};

const buildDerivedMetrics = (shape, fallback, viewboxHeight) => {
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

  const shoulderY = clamp(toFiniteNumber(shape?.shoulderY, fallback.shoulderY), 40, viewboxHeight - 70);
  const chestY = clamp(toFiniteNumber(shape?.chestY, fallback.chestY), shoulderY + 8, viewboxHeight - 60);
  const waistY = clamp(toFiniteNumber(shape?.waistY, fallback.waistY), chestY + 8, viewboxHeight - 50);
  const hipY = clamp(toFiniteNumber(shape?.hipY, fallback.hipY), waistY + 5, viewboxHeight - 42);
  const thighY = clamp(toFiniteNumber(shape?.thighY, fallback.thighY), hipY + 8, viewboxHeight - 32);
  const calfY = clamp(toFiniteNumber(shape?.calfY, fallback.calfY), thighY + 8, viewboxHeight - 18);
  const ankleY = clamp(toFiniteNumber(shape?.ankleY, fallback.ankleY), calfY + 8, viewboxHeight - 2);
  const headCenterY = clamp(toFiniteNumber(shape?.headCenterY, fallback.headCenterY), 20, shoulderY - 20);

  const headTopY = headCenterY - headRadius;
  const chinY = headCenterY + headRadius;
  const neckBaseY = chinY + (headRadius * 0.28);
  const groinY = hipY + ((thighY - hipY) * 0.13);
  const kneeY = thighY + ((calfY - thighY) * 0.38);
  const groinHalf = clamp(hipHalf * 0.18, 5, 14);
  const kneeHalf = clamp((thighHalf * 0.64) + (calfHalf * 0.24), 8, Math.max(10, thighHalf * 0.98));
  const ankleHalf = clamp(calfHalf * 0.46, 5, 22);
  const neckHalf = clamp((headRadius * 0.34) + (shoulderHalf * 0.048), 6, shoulderHalf * 0.42);

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
    neckBaseY,
    groinY,
    kneeY,
    groinHalf,
    kneeHalf,
    ankleHalf,
    neckHalf
  };
};

const buildScaleBands = (metrics, fallbackMetrics) => {
  const withScale = (y, value, fallbackValue, min = 0.78, max = 1.24) => ({
    y,
    s: clamp(value / Math.max(1, fallbackValue), min, max)
  });

  const bands = [
    withScale(metrics.headTopY, metrics.headRadius * 0.96, fallbackMetrics.headRadius * 0.96, 0.86, 1.18),
    withScale(metrics.headCenterY, metrics.headRadius, fallbackMetrics.headRadius, 0.86, 1.18),
    withScale(metrics.neckBaseY, metrics.neckHalf, fallbackMetrics.neckHalf, 0.84, 1.22),
    withScale(metrics.shoulderY, metrics.shoulderHalf, fallbackMetrics.shoulderHalf, 0.78, 1.24),
    withScale(metrics.chestY, metrics.chestHalf, fallbackMetrics.chestHalf, 0.78, 1.24),
    withScale(metrics.waistY, metrics.waistHalf, fallbackMetrics.waistHalf, 0.76, 1.3),
    withScale(metrics.hipY, metrics.hipHalf, fallbackMetrics.hipHalf, 0.76, 1.3),
    withScale(metrics.groinY, metrics.groinHalf, fallbackMetrics.groinHalf, 0.76, 1.26),
    withScale(metrics.thighY, metrics.thighHalf, fallbackMetrics.thighHalf, 0.76, 1.26),
    withScale(metrics.kneeY, metrics.kneeHalf, fallbackMetrics.kneeHalf, 0.76, 1.26),
    withScale(metrics.calfY, metrics.calfHalf, fallbackMetrics.calfHalf, 0.76, 1.26),
    withScale(metrics.ankleY, metrics.ankleHalf, fallbackMetrics.ankleHalf, 0.78, 1.24)
  ];

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

export const buildTemplateOutline = ({ model, fallback, viewboxWidth, viewboxHeight }) => {
  if (!Array.isArray(TEMPLATE.points) || TEMPLATE.points.length < 3) return null;

  const metrics = buildDerivedMetrics(model, fallback, viewboxHeight);
  const fallbackMetrics = buildDerivedMetrics(fallback, fallback, viewboxHeight);
  const { targetWidth, targetHeight } = buildTemplateSizing(model, fallback, viewboxWidth, viewboxHeight);

  const uniformScale = Math.min(targetWidth / TEMPLATE.width, targetHeight / TEMPLATE.height);
  const usedWidth = TEMPLATE.width * uniformScale;
  const usedHeight = TEMPLATE.height * uniformScale;
  const insetX = (viewboxWidth - usedWidth) / 2;
  const insetY = viewboxHeight - usedHeight - 3;
  const centerX = viewboxWidth / 2;

  const bands = buildScaleBands(metrics, fallbackMetrics);
  const armReachScale = clamp(
    ((metrics.armHeight / fallbackMetrics.armHeight) * 0.64) + (metrics.armSpanRatio * 0.36),
    0.88,
    1.18
  );
  const armThicknessScale = clamp(metrics.armWidth / fallbackMetrics.armWidth, 0.84, 1.26);
  const sideFat = clamp(toFiniteNumber(model?.sideFat, 0), 0, 1);
  const shoulderFat = clamp(toFiniteNumber(model?.shoulderFat, 0), 0, 1);

  const armZoneTop = metrics.shoulderY - clamp(metrics.armWidth * 1.9, 12, 28);
  const armZoneBottom = metrics.shoulderY + clamp(metrics.armWidth * 2.5, 16, 36);
  const armStart = clamp(metrics.shoulderHalf + 18, 54, 128);
  const handBoostStart = armStart + clamp(metrics.armWidth * 2.8, 20, 50);

  const morphedPoints = TEMPLATE.points.map((point, index) => {
    const baseX = ((point.x - TEMPLATE.minX) * uniformScale) + insetX;
    const baseY = ((point.y - TEMPLATE.minY) * uniformScale) + insetY;
    const dx = baseX - centerX;
    const absDx = Math.abs(dx);

    let xScale = interpolateScale(bands, baseY);

    const shoulderInfluence = bellCurve(baseY, metrics.shoulderY, clamp(metrics.armWidth * 2.8, 16, 34));
    const torsoInfluence = bellCurve(baseY, metrics.waistY, clamp((metrics.hipY - metrics.chestY) * 0.7, 24, 66));
    xScale *= 1 + (shoulderFat * 0.1 * shoulderInfluence);
    xScale *= 1 + (sideFat * 0.11 * torsoInfluence);

    if (baseY >= armZoneTop && baseY <= armZoneBottom) {
      const topBlend = smoothstep(armZoneTop, metrics.shoulderY, baseY);
      const bottomBlend = 1 - smoothstep(metrics.shoulderY, armZoneBottom, baseY);
      const armYBlend = clamp(topBlend * bottomBlend * 1.75, 0, 1);
      const edgeBlend = smoothstep(armStart, armStart + 62, absDx);
      const handBlend = smoothstep(handBoostStart, handBoostStart + 42, absDx);
      xScale *= 1 + ((armReachScale - 1) * armYBlend * edgeBlend);
      xScale *= 1 + ((armThicknessScale - 1) * armYBlend * ((edgeBlend * 0.48) + (handBlend * 0.52)));
    }

    return {
      id: `template-${index + 1}`,
      x: centerX + (dx * xScale),
      y: baseY
    };
  });

  const fittedPoints = fitPointsInsideViewbox(morphedPoints, {
    viewboxWidth,
    paddingX: 12,
    centerX
  });

  const path = buildCurvedPath(fittedPoints);
  if (!path) return null;

  return {
    path,
    outlineMarkers: fittedPoints
  };
};
