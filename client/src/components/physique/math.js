export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const mirrorX = (x, centerX) => centerX - (x - centerX);

// Guards before it coerces, because `Number(null)` and `Number("")` are both 0
// and both finite -- so testing afterwards turns a missing measurement into a
// real one. `undefined` already returned the fallback, so an omitted key and an
// explicit null used to give opposite answers for the same missing data. Same
// shape as `toNumberOrNull` in the server's rowValues.js.
//
// A measured zero is still a measurement and is deliberately kept: `sideFat: 0`
// means no adiposity, not "unspecified". That is why this tests for absence
// rather than falsiness.
export const toFiniteNumber = (value, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

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
