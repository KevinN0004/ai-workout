/**
 * The CORS origin allowlist: the control that decides which sites may make
 * credentialed cross-origin calls to the API. Kept apart from index.js so it
 * reads on its own; index.cors.test.js exercises it through the running app.
 */

const isLoopbackOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
};

/**
 * Builds the policy from an explicit list of allowed origins.
 *
 * With credentials enabled, reflecting an arbitrary Origin would let any site
 * issue authenticated cross-origin calls, so an unset allowlist must fail
 * closed. The loopback fallback keeps `npm run dev` working without extra
 * configuration; any other deployment has to name its origins explicitly.
 *
 * `isEmpty` is returned so the caller can warn about an unset allowlist without
 * reaching back into the Set.
 */
export const createCorsPolicy = (allowedOrigins = []) => {
  const allowedCorsOrigins = new Set(allowedOrigins);

  const isAllowedCorsOrigin = (origin) => {
    if (allowedCorsOrigins.has(origin)) return true;
    return allowedCorsOrigins.size === 0 && isLoopbackOrigin(origin);
  };

  const corsOptions = {
    origin(origin, callback) {
      // No Origin header: a non-browser caller, or a same-origin navigation or
      // plain GET. A browser does send one on same-origin writes, and Chromium on
      // the bundle's crossorigin script and stylesheet loads, so a deployment that
      // serves its own page must list its own origin.
      if (!origin) return callback(null, true);
      if (isAllowedCorsOrigin(origin)) return callback(null, true);
      // Tag as 4xx so a blocked origin is a client error, not a captured 5xx.
      const corsError = new Error("Origin not allowed by CORS.");
      corsError.status = 403;
      return callback(corsError);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"]
  };

  return { corsOptions, isAllowedCorsOrigin, isEmpty: allowedCorsOrigins.size === 0 };
};
