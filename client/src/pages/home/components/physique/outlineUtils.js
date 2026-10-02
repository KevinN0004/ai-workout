/**
 * Point thinning and closed-path smoothing for the physique outline, shared by
 * outlineGeometry.js (the outline built from geometry.js's anchors) and
 * templateOutline.js (the outline morphed from the SVG template).
 */
import { clamp, toFiniteNumber } from "./math";

const appendPointIfDistinct = (collection, point) => {
  if (!point) return;
  const previous = collection[collection.length - 1];
  if (previous && previous.x === point.x && previous.y === point.y) return;
  collection.push(point);
};

/**
 * Thins an open run of points, keeping its first and last. An interior point
 * survives when it is at least `minSpacing` from the last point kept and either
 * stands `minDeviation` off the line from that point to the next one or bends
 * the run by `minTurn` (one minus the cosine of the angle); after `maxStride`
 * points dropped in a row, the next is kept regardless. Each option is clamped
 * to a working range. A run of two points or fewer comes back as it is.
 */
export const selectImportantSegmentPoints = (points, options = {}) => {
  if (!Array.isArray(points) || points.length <= 2) return Array.isArray(points) ? points : [];
  const minSpacing = clamp(toFiniteNumber(options.minSpacing, 2.4), 1.2, 6);
  const minDeviation = clamp(toFiniteNumber(options.minDeviation, 0.3), 0.08, 1.6);
  const minTurn = clamp(toFiniteNumber(options.minTurn, 0.03), 0.005, 0.35);
  const maxStride = Math.max(1, Math.round(toFiniteNumber(options.maxStride, 2)));

  const selected = [points[0]];
  let stride = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = selected[selected.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const prevDx = current.x - prev.x;
    const prevDy = current.y - prev.y;
    const nextDx = next.x - current.x;
    const nextDy = next.y - current.y;
    const bridgeDx = next.x - prev.x;
    const bridgeDy = next.y - prev.y;
    const prevLen = Math.hypot(prevDx, prevDy);
    const nextLen = Math.hypot(nextDx, nextDy);
    const bridgeLen = Math.max(1e-6, Math.hypot(bridgeDx, bridgeDy));
    const deviation = Math.abs(prevDx * bridgeDy - prevDy * bridgeDx) / bridgeLen;
    const dot = (prevDx * nextDx + prevDy * nextDy) / Math.max(1e-6, prevLen * nextLen);
    const turn = 1 - clamp(dot, -1, 1);
    const shouldKeep =
      (prevLen >= minSpacing && (deviation >= minDeviation || turn >= minTurn)) ||
      stride >= maxStride;
    if (shouldKeep) {
      appendPointIfDistinct(selected, current);
      stride = 0;
    } else {
      stride += 1;
    }
  }
  appendPointIfDistinct(selected, points[points.length - 1]);
  return selected;
};

/**
 * The same thinning as selectImportantSegmentPoints, for the right half of
 * outlineGeometry.js's outline, except that a point whose id is one of the
 * landmarks `criticalPattern` names always survives, wherever it falls. A run
 * of four points or fewer comes back as it is.
 */
export const simplifyPerimeterByImportance = (points, options = {}) => {
  if (!Array.isArray(points) || points.length <= 4) return Array.isArray(points) ? points : [];

  // ---- Options, clamped -----------------------------------------------------
  const minSpacing = clamp(toFiniteNumber(options.minSpacing, 2.1), 1.2, 6);
  const minDeviation = clamp(toFiniteNumber(options.minDeviation, 0.34), 0.12, 1.8);
  const minTurn = clamp(toFiniteNumber(options.minTurn, 0.04), 0.01, 0.4);
  const maxStride = Math.max(1, Math.round(toFiniteNumber(options.maxStride, 3)));

  // ---- Landmarks that always survive ----------------------------------------
  const criticalPattern =
    /^(head-top|jaw-r|neck-curve-upper-r|neck-curve-mid-r|neck-curve-lower-r|trap-curve-r|trap-shoulder-r|shoulder-cap-r|shoulder-crest-r|shoulder-top-flow-r|shoulder-bridge-r|shoulder-arm-top-r|thumb-tip-r|index-tip-r|middle-tip-r|ring-tip-r|pinky-tip-r|shoulder-arm-bottom-r|shoulder-lower-r|shoulder-rear-r|armpit-rear-r|armpit-apex-r|armpit-front-r|lat-upper-side-r|pectoral-side-r|upper-chest-side-r|chest-side-r|serratus-side-r|waist-pinch-side-r|waist-side-r|oblique-side-r|hip-crest-r|hip-leg-blend-r|glute-upper-side-r|quad-outer-high-r|toe-r|foot-arch-r|instep-r|heel-r|ankle-joint-left-r|inner-calf-upper-r|inner-knee-soft-r|inner-thigh-root-r|pelvis-inner-bridge-r|pelvis-base-center)$/;

  const isCritical = (point, index, total) =>
    index === 0 ||
    index === total - 1 ||
    (typeof point?.id === "string" && criticalPattern.test(point.id));

  // ---- Walk the run ---------------------------------------------------------
  const reduced = [points[0]];
  let stride = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    if (isCritical(current, index, points.length)) {
      appendPointIfDistinct(reduced, current);
      stride = 0;
      continue;
    }

    const prev = reduced[reduced.length - 1];
    const next = points[index + 1];
    const prevDx = current.x - prev.x;
    const prevDy = current.y - prev.y;
    const nextDx = next.x - current.x;
    const nextDy = next.y - current.y;
    const bridgeDx = next.x - prev.x;
    const bridgeDy = next.y - prev.y;
    const prevLen = Math.hypot(prevDx, prevDy);
    const nextLen = Math.hypot(nextDx, nextDy);
    const bridgeLen = Math.max(1e-6, Math.hypot(bridgeDx, bridgeDy));
    const deviation = Math.abs(prevDx * bridgeDy - prevDy * bridgeDx) / bridgeLen;
    const dot = (prevDx * nextDx + prevDy * nextDy) / Math.max(1e-6, prevLen * nextLen);
    const turn = 1 - clamp(dot, -1, 1);
    const shouldKeep =
      (prevLen >= minSpacing && (deviation >= minDeviation || turn >= minTurn)) ||
      stride >= maxStride;

    if (shouldKeep) {
      appendPointIfDistinct(reduced, current);
      stride = 0;
    } else {
      stride += 1;
    }
  }
  appendPointIfDistinct(reduced, points[points.length - 1]);
  return reduced;
};

/**
 * An SVG path through every point and back to the first, one cubic Bézier per
 * segment. Each handle follows the line between the point's two neighbours,
 * scaled by `smoothness`, shortened at sharp corners (to no less than
 * `minCornerFactor` of its length) and capped at `maxHandleRatio` of the
 * segment's length.
 *
 * The points `hardPointPattern` names keep a corner: their own handles have no
 * length, and a segment touching one has its handles capped at a small
 * fraction of its length. One or two points give a closed path with no
 * curves, and none gives "".
 */
export const buildSmoothClosedPath = (points, options = {}) => {
  // ---- Degenerate inputs ----------------------------------------------------
  if (!Array.isArray(points) || !points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} Z`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} Z`;
  }

  // ---- Options and corner helpers -------------------------------------------
  const smoothness = clamp(toFiniteNumber(options.smoothness, 0.86), 0.3, 1.3);
  const maxHandleRatio = clamp(toFiniteNumber(options.maxHandleRatio, 0.44), 0.18, 0.62);
  const minCornerFactor = clamp(toFiniteNumber(options.minCornerFactor, 0.24), 0.08, 0.62);
  const hardPointPattern =
    /^(head-top|pelvis-base-center|pelvis-inner-bridge-[rl]|trap-shoulder-[rl]|shoulder-bridge-[rl])$/;
  const epsilon = 1e-6;
  const isHardPoint = (point) => typeof point?.id === "string" && hardPointPattern.test(point.id);
  const clampHandle = (anchorX, anchorY, handleX, handleY, maxLength) => {
    const dx = handleX - anchorX;
    const dy = handleY - anchorY;
    const length = Math.hypot(dx, dy);
    if (length <= maxLength || length <= epsilon) {
      return { x: handleX, y: handleY };
    }
    const scale = maxLength / length;
    return { x: anchorX + dx * scale, y: anchorY + dy * scale };
  };
  const cornerFactor = (ax, ay, bx, by) => {
    const lenA = Math.hypot(ax, ay);
    const lenB = Math.hypot(bx, by);
    if (lenA <= epsilon || lenB <= epsilon) return 1;
    const dot = clamp((ax * bx + ay * by) / (lenA * lenB), -1, 1);
    const angle = Math.acos(dot);
    return clamp(1 - angle / Math.PI, minCornerFactor, 1);
  };

  // ---- One cubic per segment, wrapping round to the start -------------------
  const total = points.length;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < total; index += 1) {
    const prev = points[(index - 1 + total) % total];
    const current = points[index];
    const next = points[(index + 1) % total];
    const after = points[(index + 2) % total];
    const segmentLength = Math.max(epsilon, Math.hypot(next.x - current.x, next.y - current.y));
    const currentHard = isHardPoint(current);
    const nextHard = isHardPoint(next);
    const currentCorner = cornerFactor(
      current.x - prev.x,
      current.y - prev.y,
      next.x - current.x,
      next.y - current.y
    );
    const nextCorner = cornerFactor(
      next.x - current.x,
      next.y - current.y,
      after.x - next.x,
      after.y - next.y
    );
    const currentScale = currentHard ? 0 : (smoothness * currentCorner) / 6;
    const nextScale = nextHard ? 0 : (smoothness * nextCorner) / 6;
    const c1RawX = current.x + (next.x - prev.x) * currentScale;
    const c1RawY = current.y + (next.y - prev.y) * currentScale;
    const c2RawX = next.x - (after.x - current.x) * nextScale;
    const c2RawY = next.y - (after.y - current.y) * nextScale;
    const maxHandleLength =
      currentHard || nextHard ? segmentLength * 0.04 : segmentLength * maxHandleRatio;
    const c1 = clampHandle(current.x, current.y, c1RawX, c1RawY, maxHandleLength);
    const c2 = clampHandle(next.x, next.y, c2RawX, c2RawY, maxHandleLength);

    path += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${next.x} ${next.y}`;
  }
  path += " Z";
  return path;
};
