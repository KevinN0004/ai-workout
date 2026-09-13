/**
 * The CORS origin allowlist.
 *
 * Extracted from index.js so the policy can be exercised directly rather than
 * only by booting the app and issuing a request. It is the control that decides
 * which sites may make authenticated cross-origin calls, so it is worth being
 * readable on its own.
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
      // Same-origin and non-browser callers send no Origin header.
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
