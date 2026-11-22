/**
 * The dashboard's Home view, a link back to the dashboard summary. Reached only
 * at /dashboard/home: neither the drawer nor the bottom nav lists it. Rendered
 * by DashboardPage, which loads it lazily.
 */
// @ts-check
import "./DashboardHomeView.css";

/** @typedef {import("../DashboardPage.jsx").DashboardPageProps} DashboardPageProps */
/** @typedef {import("../DashboardPage.jsx").DashboardMetrics} DashboardMetrics */
/** @typedef {import("../DashboardPage.jsx").DashboardProgression} DashboardProgression */

/**
 * "Back to dashboard" goes to /dashboard, the summary. The view renders only
 * for a signed-in visitor, and App would send one on "/" back to /dashboard
 * anyway, so the landing page is not a destination it can offer.
 * @param {Pick<DashboardPageProps, "go">} props
 */
export default function DashboardHomeView({ go }) {
  return (
    <section className="panel dashboard-home-view">
      <p className="muted">Return to your dashboard summary.</p>
      <button type="button" className="back-btn" onClick={() => go("/dashboard")}>
        Back to dashboard
      </button>
    </section>
  );
}
