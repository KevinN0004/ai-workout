import "./PlansView.css";

export default function PlansView({
  weekDays,
  latestPlanByWeekday,
  openPlannerFromProfile
}) {
  return (
    <section className="panel dashboard-card span-2">
      <h2>Plan hub</h2>
      <div className="plan-rows">
        <section className="plan-row">
          <div className="plan-row-header">
            <div>
              <h3>Workout week</h3>
              <p className="muted">Build your weekly training block.</p>
            </div>
            <button type="button" className="ghost" onClick={openPlannerFromProfile}>
              Update plan
            </button>
          </div>
          <div className="plan-row-grid">
            {weekDays.map(({ label, key }) => (
              <div key={key} className="hub-card">
                <h4>{label}</h4>
                {latestPlanByWeekday[key]?.length ? (
                  <ul className="hub-list">
                    {latestPlanByWeekday[key].slice(0, 4).map((line) => (
                      <li key={`${key}-${line}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Generate a weekly plan to populate this day.</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="plan-row">
          <div className="plan-row-header">
            <div>
              <h3>Meals week</h3>
              <p className="muted">Plan meals that align with your goals.</p>
            </div>
            <button type="button" className="ghost">
              Coming soon
            </button>
          </div>
          <div className="plan-row-grid">
            {weekDays.map(({ label, key }) => (
              <div key={key} className="hub-card">
                <h4>{label}</h4>
                <p className="muted">Meals: breakfast, lunch, dinner.</p>
                <p className="muted">Calories: TBD</p>
                <p className="muted">Prep note: TBD</p>
              </div>
            ))}
          </div>
        </section>

        <section className="plan-row">
          <div className="plan-row-header">
            <div>
              <h3>Tips week</h3>
              <p className="muted">Guidance to keep the week on track.</p>
            </div>
            <button type="button" className="ghost">
              Coming soon
            </button>
          </div>
          <div className="plan-row-grid plan-row-grid-split">
            <div className="hub-card">
              <h4>Daily tips</h4>
              <p className="muted">Short cues that match your workload.</p>
            </div>
            <div className="hub-card">
              <h4>Weekly tips</h4>
              <p className="muted">Big picture adjustments for the week.</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
