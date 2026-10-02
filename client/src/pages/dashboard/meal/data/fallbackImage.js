/**
 * The picture a meal shows when it has no photo or its photo fails to load
 * (meal/utils.js). An inline SVG, so it needs no request of its own.
 */
export const FALLBACK_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0f0f0f"/><stop offset="100%" stop-color="#2b2b2b"/></linearGradient></defs><rect width="800" height="520" fill="url(#g)"/><text x="400" y="255" text-anchor="middle" fill="#f2f2f2" font-size="44" font-family="Arial, sans-serif">Meal Prep</text></svg>'
)}`;
