import "./DashboardHomeView.css";

export default function DashboardHomeView({ go }) {
  return (
    <section className="panel dashboard-home-view">
      <p className="muted">Return to the main home planner.</p>
      <button type="button" className="ghost" onClick={() => go("/")}>
        Back to home
      </button>
    </section>
  );
}
