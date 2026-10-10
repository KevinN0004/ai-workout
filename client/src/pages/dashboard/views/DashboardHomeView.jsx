/**
 * The dashboard's Home view, a link back to the landing page. Reached only at
 * /dashboard/home: neither the drawer nor the bottom nav lists it. Rendered by
 * DashboardPage, which loads it lazily.
 */
import "./DashboardHomeView.css";

/**
 * "Back to home" navigates to "/". App sends a signed-in visitor on "/" back to
 * /dashboard, and this view renders only when signed in, so the button lands
 * on the dashboard summary.
 */
export default function DashboardHomeView({ go }) {
  return (
    <section className="panel dashboard-home-view">
      <p className="muted">Return to the main home planner.</p>
      <button type="button" className="back-btn" onClick={() => go("/")}>
        Back to home
      </button>
    </section>
  );
}
