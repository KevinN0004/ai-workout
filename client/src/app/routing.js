import { DASHBOARD_ROUTE_VIEW_MAP } from "./constants";

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
