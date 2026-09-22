import path from "path";
import { fileURLToPath } from "url";

/**
 * Serves the built client from the API process, on one origin.
 *
 * This is not a convenience. The client cannot reach a cross-origin API at
 * all, for two independent reasons:
 *
 *   - Every request it makes is a relative path. There are 16 `/api/...`
 *     literals in `client/src` and no base-URL constant, so a bundle served
 *     from a different host sends `/api/auth/me` to that host. CORS is never
 *     consulted, because the URL never points at the API.
 *   - Both cookies are `SameSite=Lax`, so even with an absolute URL the
 *     session would not be attached to a cross-site fetch. Relaxing that to
 *     `SameSite=None` is the direction browsers are removing.
 *
 * The `/api` proxy that makes development work lives in `client/vite.config.js`
 * and covers the dev server and `vite preview` only. Nothing proxies in
 * production. So same origin is a constraint, not a preference, and this is
 * where it is satisfied.
 */

const DEFAULT_CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));

export const resolveClientDistPath = (override = "") =>
  override ? path.resolve(override) : DEFAULT_CLIENT_DIST;

/**
 * Registers static serving and the single-page fallback.
 *
 * Returns true when the build was found and mounted, false when it was not --
 * `npm run dev:server` runs without ever building the client, and refusing to
 * start would make the ordinary development path fail. The caller logs the
 * difference so a production process that is missing its bundle is visible in
 * the logs rather than only in a 404.
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
  app.use(express.static(distPath, { index: false }));

  // GET/HEAD only -- app.get covers both -- so a POST to an unknown path still
  // falls through to the 404 rather than being handed an HTML page.
  app.get("*", (req, res, next) => {
    // An unmatched /api path is a missing endpoint, not a client route.
    // Without this guard every typo'd API call would answer 200 with the SPA
    // shell, and a fetch would fail on JSON parsing rather than on the status.
    if (req.path === "/api" || req.path.startsWith("/api/")) return next();
    res.sendFile(indexPath);
  });

  logger?.info?.({ event: "client_bundle_mounted", path: distPath }, "Serving the client bundle.");
  return true;
};
