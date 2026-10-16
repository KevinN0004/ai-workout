/**
 * The dashboard's Logs view: the workout, calorie, meal and progress-metric
 * logs, newest first. Rendered by DashboardPage, which loads it lazily.
 */
import { useMemo, useState } from "react";
import { getLocalDateKey } from "../../../app/units";
import useOlderLogPages from "../hooks/useOlderLogPages";
import "./WorkoutsView.css";

const INITIAL_VISIBLE_ROWS = 40;
const ROW_BATCH_SIZE = 40;

/**
 * A row's date as a sortable timestamp; a missing or unparseable date sorts as
 * 0, last. A bare YYYY-MM-DD reads as UTC midnight, unlike useDashboardMetrics'
 * parseDateValue, which reads it as local midnight, but UTC midnights fall in
 * date order too, so the sort is the same.
 */
const toSortTime = (value) => {
  if (!value) return 0;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const sortByDateDesc = (items) =>
  [...items].sort((a, b) => toSortTime(b?.date) - toSortTime(a?.date));

// The dashboard's rows, then each fetched row whose id it does not already
// hold: useOlderLogPages' list starts with a copy of the dashboard's page.
const mergeById = (held, older) => {
  const heldIds = new Set(held.map((item) => item?.id));
  return [...held, ...older.filter((item) => !heldIds.has(item?.id))];
};

/**
 * The four lists arrive deduplicated from useDashboardMetrics. Each shows
 * INITIAL_VISIBLE_ROWS and grows by ROW_BATCH_SIZE on "Show more". Workouts and
 * calories page over rows the dashboard already holds. Meal logs and metrics
 * do too, and once those run out "Show more" also fetches the next page
 * (useOlderLogPages), for as long as `pagination`, the dashboard response's,
 * says the server holds more. Both Add workout buttons set the workout form's
 * date to today and open the Log workout modal; the other empty states link to
 * the view where that log is entered.
 */
export default function WorkoutsView({
  workouts,
  calories,
  mealLogs,
  progressMetrics,
  pagination,
  setWorkoutForm,
  setWorkoutModalOpen,
  onOpenCalories,
  onOpenMeal
}) {
  // ---- Sorted lists and the visible slice of each ---------------------------
  const [visibleRows, setVisibleRows] = useState({
    workouts: INITIAL_VISIBLE_ROWS,
    calories: INITIAL_VISIBLE_ROWS,
    meals: INITIAL_VISIBLE_ROWS,
    progress: INITIAL_VISIBLE_ROWS
  });

  // Meal logs and metrics past the dashboard's first page come from their
  // paged routes, a page at a time, once the rows the dashboard holds run out.
  const heldMealLogs = useMemo(() => (Array.isArray(mealLogs) ? mealLogs : []), [mealLogs]);
  const heldProgressMetrics = useMemo(
    () => (Array.isArray(progressMetrics) ? progressMetrics : []),
    [progressMetrics]
  );
  const olderMeals = useOlderLogPages({
    path: "/api/dashboard/meal-logs",
    collection: "mealLogs",
    heldItems: heldMealLogs,
    total: pagination?.mealLogs?.total
  });
  const olderMetrics = useOlderLogPages({
    path: "/api/dashboard/progress-metrics",
    collection: "progressMetrics",
    heldItems: heldProgressMetrics,
    total: pagination?.progressMetrics?.total
  });

  const workoutLogs = useMemo(
    () => sortByDateDesc(Array.isArray(workouts) ? workouts : []),
    [workouts]
  );
  const calorieLogs = useMemo(
    () => sortByDateDesc(Array.isArray(calories) ? calories : []),
    [calories]
  );
  const mealLogItems = useMemo(
    () => sortByDateDesc(mergeById(heldMealLogs, olderMeals.items)),
    [heldMealLogs, olderMeals.items]
  );
  const progressLogs = useMemo(
    () => sortByDateDesc(mergeById(heldProgressMetrics, olderMetrics.items)),
    [heldProgressMetrics, olderMetrics.items]
  );

  const visibleWorkoutLogs = useMemo(
    () => workoutLogs.slice(0, visibleRows.workouts),
    [workoutLogs, visibleRows.workouts]
  );
  const visibleCalorieLogs = useMemo(
    () => calorieLogs.slice(0, visibleRows.calories),
    [calorieLogs, visibleRows.calories]
  );
  const visibleMealLogs = useMemo(
    () => mealLogItems.slice(0, visibleRows.meals),
    [mealLogItems, visibleRows.meals]
  );
  const visibleProgressLogs = useMemo(
    () => progressLogs.slice(0, visibleRows.progress),
    [progressLogs, visibleRows.progress]
  );

  const expandRows = (key) => {
    setVisibleRows((prev) => ({ ...prev, [key]: prev[key] + ROW_BATCH_SIZE }));
  };

  // The next batch of rows. Once every row held is on screen it fetches the
  // next page as well, and the batch fills in when the page arrives.
  const showMore = (key, rows, older) => {
    if (rows.length <= visibleRows[key]) older.loadMore();
    expandRows(key);
  };

  // ---- Render ---------------------------------------------------------------
  return (
    <section className="panel workouts-view">
      <div className="panel-header">
        <div>
          <h2>Logs</h2>
          <p className="muted">
            View all logged items across workouts, calories, meals, and metrics.
          </p>
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
        {/* ---- Workouts ---- */}
        <section className="log-section">
          <h3>Workout log</h3>
          <div className="log-list">
            {visibleWorkoutLogs.map((item, index) => {
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
            {workoutLogs.length > visibleRows.workouts && (
              <button type="button" className="ghost" onClick={() => expandRows("workouts")}>
                Show more workouts
              </button>
            )}
          </div>
        </section>

        {/* ---- Calories ---- */}
        <section className="log-section">
          <h3>Calories log</h3>
          <div className="log-list">
            {visibleCalorieLogs.map((item, index) => (
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
            {calorieLogs.length > visibleRows.calories && (
              <button type="button" className="ghost" onClick={() => expandRows("calories")}>
                Show more calories
              </button>
            )}
          </div>
        </section>

        {/* ---- Meals ---- */}
        <section className="log-section">
          <h3>Meal log</h3>
          <div className="log-list">
            {visibleMealLogs.map((item, index) => (
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
            {(mealLogItems.length > visibleRows.meals || olderMeals.hasMore) && (
              <button
                type="button"
                className="ghost"
                disabled={olderMeals.loading}
                onClick={() => showMore("meals", mealLogItems, olderMeals)}
              >
                Show more meals
              </button>
            )}
            {olderMeals.error && (
              <p className="muted" role="alert">
                {olderMeals.error}
              </p>
            )}
          </div>
        </section>

        {/* ---- Progress metrics ---- */}
        <section className="log-section">
          <h3>Progress metrics log</h3>
          <div className="log-list">
            {visibleProgressLogs.map((item, index) => (
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
            {(progressLogs.length > visibleRows.progress || olderMetrics.hasMore) && (
              <button
                type="button"
                className="ghost"
                disabled={olderMetrics.loading}
                onClick={() => showMore("progress", progressLogs, olderMetrics)}
              >
                Show more metrics
              </button>
            )}
            {olderMetrics.error && (
              <p className="muted" role="alert">
                {olderMetrics.error}
              </p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
