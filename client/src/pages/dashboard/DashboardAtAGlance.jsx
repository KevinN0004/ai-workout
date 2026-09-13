export default function DashboardAtAGlance({
  nextWorkout,
  caloriesGap,
  avgCalories,
  calorieGoal,
  weatherLoading,
  weatherRecommendation,
  weatherError,
  weatherLastUpdatedAt,
  airQualityLoading,
  airSummary,
  airQualityError,
  airQualityLastUpdatedAt,
  formatRelativeUpdatedAt,
  onAddWorkout,
  onOpenMeal,
  onOpenTips
}) {
  return (
    <section className="panel dashboard-at-a-glance">
      <div className="dashboard-at-a-glance-head">
        <h2>Today at a glance</h2>
        <p className="muted">Quick status and shortcuts for your day.</p>
      </div>
      <div className="dashboard-at-a-glance-grid equal-card-grid">
        <article className="dashboard-glance-card card-shell">
          <div className="card-section-head">
            <h3>{nextWorkout ? `${nextWorkout.context} workout` : "Workout status"}</h3>
          </div>
          <div className="card-section-body">
            {nextWorkout ? (
              <>
                <p className="dashboard-glance-value">
                  {nextWorkout.date || "Date pending"} - {nextWorkout.focus || "General"}
                </p>
                <p className="muted">{nextWorkout.duration || "--"} min planned</p>
              </>
            ) : (
              <p className="muted">No workout logged yet. Add one to get started.</p>
            )}
          </div>
        </article>
        <article className="dashboard-glance-card card-shell">
          <div className="card-section-head">
            <h3>Calories gap</h3>
          </div>
          <div className="card-section-body">
            <p className="dashboard-glance-value">
              {caloriesGap === 0
                ? "On target"
                : caloriesGap > 0
                  ? `${caloriesGap} under target`
                  : `${Math.abs(caloriesGap)} over target`}
            </p>
            <p className="muted">
              Avg {Math.round(avgCalories)} / goal {calorieGoal} kcal
            </p>
          </div>
        </article>
        <article className="dashboard-glance-card card-shell">
          <div className="card-section-head">
            <h3>Weather</h3>
          </div>
          <div className="card-section-body">
            <p className="dashboard-glance-value">
              {weatherLoading
                ? weatherRecommendation
                  ? "Refreshing..."
                  : "Checking..."
                : weatherRecommendation?.workoutType === "outdoor"
                  ? "Outdoor friendly"
                  : weatherRecommendation?.workoutType === "indoor"
                    ? "Indoor suggested"
                    : // A failed lookup and a lookup that has not happened both read
                      // as "Unavailable". This used to be written as
                      // `weatherError ? "Unavailable" : "Unavailable"`, which looks
                      // like it tells them apart and cannot. The note below does
                      // carry the error text, so the difference is not lost --
                      // giving this line its own wording is a copy decision nobody
                      // has made.
                      "Unavailable"}
            </p>
            <p className="muted">
              {weatherRecommendation?.summary || weatherError || "No weather update yet."}
            </p>
            <p className="muted dashboard-glance-updated">
              {formatRelativeUpdatedAt(weatherLastUpdatedAt)}
            </p>
          </div>
        </article>
        <article className="dashboard-glance-card card-shell">
          <div className="card-section-head">
            <h3>Air quality</h3>
          </div>
          <div className="card-section-body">
            <p className="dashboard-glance-value">
              {airQualityLoading
                ? airSummary
                  ? "Refreshing..."
                  : "Checking..."
                : // Same as the weather card above: the error and the no-reading
                  // case share this wording, and the note below is what
                  // distinguishes them.
                  airSummary?.level || "Unavailable"}
            </p>
            <p className="muted">
              {airSummary?.guidance || airQualityError || "No air quality guidance available."}
            </p>
            <p className="muted dashboard-glance-updated">
              {formatRelativeUpdatedAt(airQualityLastUpdatedAt)}
            </p>
          </div>
        </article>
      </div>
      <div className="dashboard-glance-actions">
        <button type="button" className="ghost" onClick={onAddWorkout}>
          Add workout
        </button>
        <button type="button" className="ghost" onClick={onOpenMeal}>
          Log meal
        </button>
        <button type="button" className="ghost" onClick={onOpenTips}>
          Open guides
        </button>
      </div>
    </section>
  );
}
