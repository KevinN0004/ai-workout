/**
 * The CORS origin allowlist: the control that decides which sites may make
 * credentialed cross-origin calls to the API. The server's own origin passes
 * (outside production, only when it is loopback). index.cors.test.js exercises
 * it through the running app, and corsPolicy.test.js the rest.
 */

const isLoopbackOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
};

// The origin this request was addressed to: its scheme (X-Forwarded-Proto only
// behind the one proxy index.js trusts in production) and its raw Host header.
// A browser cannot set Host, so a page on another site cannot make its Origin
// equal this, short of rebinding its own name to our address, which
// createCorsPolicy answers. With no Host there is no own origin to match.
const requestOrigin = (req) => {
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : null;
};

/**
 * Builds the policy from an explicit list of allowed origins.
 *
 * With credentials enabled, reflecting an arbitrary Origin would let any site
 * issue authenticated cross-origin calls, so an unset allowlist must fail
 * closed. The server's own origin passes: the page it serves is same-origin,
 * yet a browser sends Origin on its writes, and Chromium on the bundle's
 * crossorigin script and stylesheet loads.
 *
 * `development` (index.js passes false in production) changes two rules. For an
 * unset list it lets loopback origins through, which keeps `npm run dev` working
 * with no configuration. And it counts the own origin only when that is itself
 * loopback: a developer's server answers any Host, so a page that rebinds its
 * own name to 127.0.0.1 (DNS rebinding) would send a Host and an Origin that
 * agree. In production the host routes by Host (Render does), so a request
 * naming another host never reaches the service, and any own origin passes.
 *
 * Returns `corsOptionsDelegate`, which cors calls per request so the check can
 * see the request's own origin, and `isEmpty`, so the caller can report an
 * unset list without reaching back into the Set.
 */
export const createCorsPolicy = (allowedOrigins = [], { development = true } = {}) => {
  const allowedCorsOrigins = new Set(allowedOrigins);

  const isTrustedOwnOrigin = (ownOrigin) => !development || isLoopbackOrigin(ownOrigin);

  const isAllowedCorsOrigin = (origin, ownOrigin) => {
    if (origin === ownOrigin && isTrustedOwnOrigin(ownOrigin)) return true;
    if (allowedCorsOrigins.has(origin)) return true;
    return development && allowedCorsOrigins.size === 0 && isLoopbackOrigin(origin);
  };

  const corsOptionsDelegate = (req, callback) => {
    callback(null, {
      origin(origin, done) {
        // No Origin header: a non-browser caller, or a same-origin navigation or
        // plain GET.
        if (!origin) return done(null, true);
        if (isAllowedCorsOrigin(origin, requestOrigin(req))) return done(null, true);
        // Tag as 4xx so a blocked origin is a client error, not a captured 5xx.
        const corsError = new Error("Origin not allowed by CORS.");
        corsError.status = 403;
        return done(corsError);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"]
    });
  };

  return { corsOptionsDelegate, isEmpty: allowedCorsOrigins.size === 0 };
};
