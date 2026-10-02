/**
 * The meal log: a form for one meal's date, type, name, calories, macros and
 * notes, with the latest entries beneath it. Rendered by MealView.
 */

/**
 * A controlled form over MealView's meal-log form, saved by `onSubmitMealLog`
 * (submitMealLog in events.js). The list shows the first few of `safeMealLogs`,
 * which arrive most recently logged first. With none, "Log first meal" fills in
 * a date and a meal type where the form has none, then focuses the name field
 * through `mealLogNameInputRef`.
 */
export default function MealLogPanel({
  safeMealLogForm,
  safeMealLogs,
  updateMealLogForm,
  onSubmitMealLog,
  mealLogNameInputRef
}) {
  return (
    <section className="meal-log-panel">
      <div className="meal-log-header">
        <h3>Meal log history</h3>
        <p className="muted">Track meals and macros. Saved to your account.</p>
      </div>
      {/* ---- Form ---- */}
      <form className="form meal-log-form" onSubmit={onSubmitMealLog}>
        <label>
          Date
          <input
            type="date"
            value={safeMealLogForm.date}
            onChange={(event) =>
              updateMealLogForm((prev) => ({ ...prev, date: event.target.value }))
            }
            required
          />
        </label>
        <label>
          Meal type
          <select
            value={safeMealLogForm.mealType}
            onChange={(event) =>
              updateMealLogForm((prev) => ({ ...prev, mealType: event.target.value }))
            }
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="drink">Drink</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Meal name
          <input
            ref={mealLogNameInputRef}
            value={safeMealLogForm.name}
            onChange={(event) =>
              updateMealLogForm((prev) => ({ ...prev, name: event.target.value }))
            }
            placeholder="Chicken rice bowl"
            required
          />
        </label>
        <label>
          Calories
          <input
            type="number"
            min="0"
            max="5000"
            value={safeMealLogForm.calories}
            onChange={(event) =>
              updateMealLogForm((prev) => ({ ...prev, calories: event.target.value }))
            }
          />
        </label>
        <label>
          Protein (g)
          <input
            type="number"
            min="0"
            max="400"
            value={safeMealLogForm.proteinG}
            onChange={(event) =>
              updateMealLogForm((prev) => ({ ...prev, proteinG: event.target.value }))
            }
          />
        </label>
        <label>
          Carbs (g)
          <input
            type="number"
            min="0"
            max="700"
            value={safeMealLogForm.carbsG}
            onChange={(event) =>
              updateMealLogForm((prev) => ({ ...prev, carbsG: event.target.value }))
            }
          />
        </label>
        <label>
          Fat (g)
          <input
            type="number"
            min="0"
            max="300"
            value={safeMealLogForm.fatG}
            onChange={(event) =>
              updateMealLogForm((prev) => ({ ...prev, fatG: event.target.value }))
            }
          />
        </label>
        <label>
          Notes
          <input
            value={safeMealLogForm.notes}
            onChange={(event) =>
              updateMealLogForm((prev) => ({ ...prev, notes: event.target.value }))
            }
            placeholder="Post-workout meal"
          />
        </label>
        <button className="ghost meal-log-submit" type="submit">
          Save meal log
        </button>
      </form>

      {/* ---- Latest entries, or the empty state ---- */}
      <div className="meal-log-list">
        {safeMealLogs.slice(0, 8).map((item) => (
          <div key={item.id} className="meal-log-row">
            <div>
              <strong>{item.date}</strong>
              <span className="muted">
                {" "}
                - {(item.mealType || "other").replace(/^\w/, (value) => value.toUpperCase())}
                {item.name ? ` - ${item.name}` : ""}
              </span>
              <p className="muted meal-log-meta">
                {item.calories ?? "--"} kcal | P {item.proteinG ?? "--"} / C {item.carbsG ?? "--"} /
                F {item.fatG ?? "--"}
              </p>
            </div>
          </div>
        ))}
        {!safeMealLogs.length && (
          <div className="meal-empty-state">
            <p className="muted">No meal logs yet.</p>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                updateMealLogForm((prev) => ({
                  ...prev,
                  date: prev?.date || new Date().toISOString().slice(0, 10),
                  mealType: prev?.mealType || "breakfast"
                }));
                mealLogNameInputRef.current?.focus();
              }}
            >
              Log first meal
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
