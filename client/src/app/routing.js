/**
 * Maps a URL path to the dashboard view it names. App uses it to pick the view
 * on load and on every route change.
 */
import { DASHBOARD_ROUTE_VIEW_MAP } from "./constants";

/**
 * "/dashboard" (with or without a trailing slash) is the summary, and
 * "/dashboard/<slug>/..." is the view DASHBOARD_ROUTE_VIEW_MAP gives the slug.
 * Null for any path outside /dashboard, and for a slug the map does not know,
 * except a slug naming a member every object inherits: the map is a plain
 * object, so /dashboard/constructor resolves to that member rather than null.
 */
export const resolveDashViewFromPath = (path) => {
  if (path === "/dashboard" || path === "/dashboard/") {
    return "summary";
  }
  if (!path.startsWith("/dashboard/")) {
    return null;
  }
  const slug = path.slice("/dashboard/".length).split("/")[0];
  return DASHBOARD_ROUTE_VIEW_MAP[slug] || null;
};
