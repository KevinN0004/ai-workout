/**
 * Maps a URL path to the dashboard view it names. App uses it to pick the view
 * on load and on every route change.
 */
import { DASHBOARD_ROUTE_VIEW_MAP } from "./constants";

/**
 * "/dashboard" (with or without a trailing slash) is the summary, and
 * "/dashboard/<slug>/..." is the view DASHBOARD_ROUTE_VIEW_MAP gives the slug.
 * Null for any path outside /dashboard, and for a slug that is not one of the
 * map's own keys, so /dashboard/constructor is null rather than the member
 * every object inherits.
 */
export const resolveDashViewFromPath = (path) => {
  if (path === "/dashboard" || path === "/dashboard/") {
    return "summary";
  }
  if (!path.startsWith("/dashboard/")) {
    return null;
  }
  const slug = path.slice("/dashboard/".length).split("/")[0];
  return Object.hasOwn(DASHBOARD_ROUTE_VIEW_MAP, slug) ? DASHBOARD_ROUTE_VIEW_MAP[slug] : null;
};
