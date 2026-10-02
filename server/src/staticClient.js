/**
 * Serves the built client from the API process, so the page and /api share one
 * origin. index.js mounts it after the API routes and before the error handler.
 * Same origin is a constraint here, not a convenience: see registerClientStatic.
 */
import path from "path";
import { fileURLToPath } from "url";

const DEFAULT_CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));

/**
 * The directory the client bundle is served from: `override` resolved against
 * the working directory when it is set (index.js passes CLIENT_DIST_PATH),
 * otherwise the repository's client/dist.
 */
export const resolveClientDistPath = (override = "") =>
  override ? path.resolve(override) : DEFAULT_CLIENT_DIST;

/**
 * Cache policy for one built file.
 *
 * Vite writes content-addressed filenames into `assets/`, so those can be
 * cached indefinitely -- the name changes whenever the bytes do. Everything
 * else, the shell above all, must revalidate: a cached shell pointing at a
 * hashed bundle that no longer exists is a blank page that only a hard refresh
 * clears.
 *
 * Matched on `assets` as a path SEGMENT, via path.sep, so it behaves the same
 * on a Windows dev box and in the Linux image. A plain `includes("assets")`
 * would also match a project checked out under, say, `D:\assets\ai-workout`.
 */
const cacheControlFor = (filePath) => {
  const segments = String(filePath).split(path.sep);
  return segments.includes("assets") ? "public, max-age=31536000, immutable" : "no-cache";
};

/**
 * Registers static serving and the single-page fallback.
 *
 * This is not a convenience. The client cannot reach a cross-origin API at
 * all, for two independent reasons:
 *
 *   - Every request it makes is a relative path: each `/api/...` in `client/src`
 *     is a bare literal with no base URL in front of it, so a bundle served from
 *     a different host sends `/api/auth/me` to that host. CORS is never
 *     consulted, because the URL never points at the API.
 *   - Both cookies are `SameSite=Lax`, so even with an absolute URL the
 *     session would not be attached to a cross-site fetch. Relaxing that to
 *     `SameSite=None` is the direction browsers are removing.
 *
 * The `/api` proxy that makes development work lives in `client/vite.config.js`
 * and covers the dev server and `vite preview` only. Nothing proxies in
 * production. So same origin is a constraint, not a preference, and this is
 * where it is satisfied.
 *
 * Returns true when the build was found and mounted, false when it was not --
 * `npm run dev:server` runs without ever building the client, and refusing to
 * start would make the ordinary development path fail. It logs which, through
 * the `logger` it is given, so a production process that is missing its bundle
 * is visible in the logs rather than only in a 404.
 *
 * `express`, `existsSync` and `distPath` are injected so this is testable
 * without a build on disk.
 */
export const registerClientStatic = (
  app,
  { express, existsSync, distPath, logger = null, onMissing = null } = {}
) => {
  const indexPath = path.join(distPath, "index.html");

  if (!existsSync(indexPath)) {
    if (onMissing) onMissing(indexPath);
    logger?.warn?.(
      { event: "client_bundle_missing", path: indexPath },
      "Client bundle not found; serving the API only."
    );
    return false;
  }

  // `index: false` because the fallback below owns index.html. Left on, the
  // static layer would answer "/" itself and the two would diverge the moment
  // the fallback gained any behaviour.
  //
  // `setHeaders` rather than the `maxAge`/`immutable` options, because those
  // apply to every file equally and these files do not want the same policy.
  // It runs before send sets Cache-Control, and send only sets its own
  // `if (!res.getHeader("Cache-Control"))`, so what is set here wins.
  app.use(
    express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        res.setHeader("Cache-Control", cacheControlFor(filePath));
      }
    })
  );

  // GET/HEAD only -- app.get covers both -- so a POST to an unknown path still
  // falls through to the 404 rather than being handed an HTML page.
  //
  // "/{*splat}", not "*": Express 5's path-to-regexp refuses a bare "*" at
  // registration, and the braces make the wildcard optional so "/" matches too.
  app.get("/{*splat}", (req, res, next) => {
    // An unmatched /api path is a missing endpoint, not a client route.
    // Without this guard every typo'd API call would answer 200 with the SPA
    // shell, and a fetch would fail on JSON parsing rather than on the status.
    if (req.path === "/api" || req.path.startsWith("/api/")) return next();
    // Explicit, not inherited: this path does not go through express.static,
    // so the policy above never reaches it. Without this the shell is served
    // with sendFile's default and a visitor can hold a cached page pointing at
    // a bundle the next deploy has already replaced.
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexPath);
  });

  logger?.info?.({ event: "client_bundle_mounted", path: distPath }, "Serving the client bundle.");
  return true;
};
