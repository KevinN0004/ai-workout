import "./WorkoutsView.css";

const getLocalDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value) => {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const sortByDateDesc = (items) =>
  [...items].sort((a, b) => parseDateValue(b?.date) - parseDateValue(a?.date));

export default function WorkoutsView({
  workouts,
  calories,
  mealLogs,
  progressMetrics,
  setWorkoutForm,
  setWorkoutModalOpen,
  onOpenCalories,
  onOpenMeal
}) {
  const workoutLogs = sortByDateDesc(Array.isArray(workouts) ? workouts : []);
  const calorieLogs = sortByDateDesc(Array.isArray(calories) ? calories : []);
  const mealLogItems = sortByDateDesc(Array.isArray(mealLogs) ? mealLogs : []);
  const progressLogs = sortByDateDesc(Array.isArray(progressMetrics) ? progressMetrics : []);

  return (
    <section className="panel workouts-view">
      <div className="panel-header">
        <div>
          <h2>Logs</h2>
          <p className="muted">View all logged items across workouts, calories, meals, and metrics.</p>
        </div>
        <button
          type="button"
          className="cta"
          onClick={() => {
            setWorkoutForm((prev) => ({
              ...prev,
              date: getLocalDateKey()
            }));
            setWorkoutModalOpen(true);
          }}
        >
          Add workout
        </button>
      </div>

      <div className="logs-grid">
        <section className="log-section">
          <h3>Workout log</h3>
          <div className="log-list">
            {workoutLogs.map((item, index) => {
              const sessionMeta = [
                item.sets ? `${item.sets} sets` : "",
                item.reps ? `${item.reps} reps` : "",
                item.intensityRpe ? `RPE ${item.intensityRpe}` : ""
              ]
                .filter(Boolean)
                .join(" | ");
              return (
                <div
                  key={item.id || `workout-${item.date || "unknown"}-${index}`}
                  className="log-list-row workout-row"
                >
                  <div className="workout-row-copy">
                    <strong>{item.date || "--"}</strong>
                    <span className="muted">{item.focus ? ` - ${item.focus}` : ""}</span>
                    {!!item.exercises?.length && (
                      <p className="muted workout-detail">{item.exercises.join(", ")}</p>
                    )}
                    {!!sessionMeta && <p className="muted workout-detail">{sessionMeta}</p>}
                    {!!item.notes && <p className="muted workout-detail">{item.notes}</p>}
                  </div>
                  <span>{item.duration ?? "--"} min</span>
                </div>
              );
            })}
            {!workoutLogs.length && (
              <div className="log-empty-state">
                <p className="muted">No workouts logged yet.</p>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setWorkoutForm((prev) => ({
                      ...prev,
                      date: getLocalDateKey()
                    }));
                    setWorkoutModalOpen(true);
                  }}
                >
                  Add workout now
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="log-section">
          <h3>Calories log</h3>
          <div className="log-list">
            {calorieLogs.map((item, index) => (
              <div
                key={item.id || `calories-${item.date || "unknown"}-${index}`}
                className="log-list-row"
              >
                <div className="workout-row-copy">
                  <strong>{item.date || "--"}</strong>
                  <p className="muted workout-detail">{item.calories ?? "--"} kcal</p>
                </div>
              </div>
            ))}
            {!calorieLogs.length && (
              <div className="log-empty-state">
                <p className="muted">No calories logged yet.</p>
                <button type="button" className="ghost" onClick={onOpenCalories}>
                  Open goal page
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="log-section">
          <h3>Meal log</h3>
          <div className="log-list">
            {mealLogItems.map((item, index) => (
              <div
                key={item.id || `meal-${item.date || "unknown"}-${index}`}
                className="log-list-row"
              >
                <div className="workout-row-copy">
                  <strong>{item.date || "--"}</strong>
                  <span className="muted">
                    {" "}
                    - {(item.mealType || "other").replace(/^\w/, (value) => value.toUpperCase())}
                    {item.name ? ` - ${item.name}` : ""}
                  </span>
                  <p className="muted workout-detail">
                    {item.calories ?? "--"} kcal | P {item.proteinG ?? "--"} / C{" "}
                    {item.carbsG ?? "--"} / F {item.fatG ?? "--"}
                  </p>
                  {!!item.notes && <p className="muted workout-detail">{item.notes}</p>}
                </div>
              </div>
            ))}
            {!mealLogItems.length && (
              <div className="log-empty-state">
                <p className="muted">No meal logs yet.</p>
                <button type="button" className="ghost" onClick={onOpenMeal}>
                  Open meal prep
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="log-section">
          <h3>Progress metrics log</h3>
          <div className="log-list">
            {progressLogs.map((item, index) => (
              <div
                key={item.id || `metric-${item.date || "unknown"}-${index}`}
                className="log-list-row"
              >
                <div className="workout-row-copy">
                  <strong>{item.date || "--"}</strong>
                  <p className="muted workout-detail">
                    W {item.weightLb ?? "--"} lb | BF {item.bodyFatPct ?? "--"}% | Waist{" "}
                    {item.waistCm ?? "--"} cm | RHR {item.restingHr ?? "--"}
                  </p>
                  {!!item.notes && <p className="muted workout-detail">{item.notes}</p>}
                </div>
              </div>
            ))}
            {!progressLogs.length && (
              <div className="log-empty-state">
                <p className="muted">No progress metrics logged yet.</p>
                <button type="button" className="ghost" onClick={onOpenCalories}>
                  Log progress in goal page
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

