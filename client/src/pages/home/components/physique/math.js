/**
 * Numeric helpers shared by the physique silhouette's geometry modules:
 * clamping, mirroring across the centre line, absent-safe coercion and
 * interpolation between width bands.
 */

/**
 * `value` bounded to [min, max]. A NaN stays NaN, which is why the geometry
 * reads its inputs through toFiniteNumber before clamping them.
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * `x` reflected across the vertical line at `centerX`. geometry.js and
 * outlineGeometry.js build each left-side point from its right-side twin with
 * it.
 */
export const mirrorX = (x, centerX) => centerX - (x - centerX);

/**
 * A number, or `fallback` when the value is absent or not numeric. The geometry
 * modules read the model's fields and their own options through it.
 *
 * Guards before it coerces, because `Number(null)` and `Number("")` are both 0
 * and both finite -- so testing afterwards turns a missing measurement into a
 * real one. Testing for all three absent forms first is what makes an omitted
 * key, an explicit null and an empty string give the same answer. Same shape as
 * `toNumberOrNull` in the server's rowValues.js.
 *
 * A measured zero is still a measurement and is deliberately kept: `sideFat: 0`
 * means no adiposity, not "unspecified". That is why this tests for absence
 * rather than falsiness.
 */
export const toFiniteNumber = (value, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * The half-width at height `yValue`, interpolated linearly between the two
 * `bands` (`{ y, w }`) either side of it and held at the first or last band's
 * width beyond them. Assumes the bands ascend in y; with none it is 0.
 * geometry.js's `widthAt` is this, over the body's width bands.
 */
export const interpolateBandWidth = (bands, yValue) => {
  if (!Array.isArray(bands) || !bands.length) return 0;
  if (yValue <= bands[0].y) return bands[0].w;

  for (let index = 0; index < bands.length - 1; index += 1) {
    const current = bands[index];
    const next = bands[index + 1];
    if (yValue > next.y) continue;
    const range = Math.max(1, next.y - current.y);
    const progress = (yValue - current.y) / range;
    return current.w + (next.w - current.w) * progress;
  }

  return bands[bands.length - 1].w;
};
