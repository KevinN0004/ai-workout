export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const mirrorX = (x, centerX) => centerX - (x - centerX);

export const toFiniteNumber = (value, fallback) => {
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
