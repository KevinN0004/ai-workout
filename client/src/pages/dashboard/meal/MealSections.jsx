/**
 * The meal view's suggestion sections: one card per meal, grouped by course.
 * Rendered by MealView.
 */

/**
 * Renders `displayedSections`, already narrowed by MealView to the chosen
 * course. A card passes its meal's id to `onSelectMeal`, which opens the meal's
 * details. A course with no meals says so, and so does an empty list. MealDB
 * meals carry no calories (mapMealDbMeal on the server sets them to null), so
 * in the app every card reads "Calories not provided".
 */
export default function MealSections({ displayedSections, onSelectMeal, handleImageError }) {
  return (
    <div className="meal-sections">
      {/* ---- One section per course ---- */}
      {displayedSections.map((section) => (
        <section key={section.key} className="meal-section">
          <div className="meal-section-header">
            <h3>{section.title}</h3>
            <p className="muted">{section.subtitle}</p>
          </div>
          {Array.isArray(section.meals) && section.meals.length ? (
            <div className="meal-grid" role="group" aria-label={`${section.title} suggestions`}>
              {section.meals.map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  className="meal-card"
                  onClick={() => onSelectMeal(meal.id)}
                >
                  <img
                    src={meal.image}
                    alt={meal.title}
                    loading="lazy"
                    onError={handleImageError}
                  />
                  <div className="meal-card-copy card-shell">
                    <div className="card-section-head">
                      <h3>{meal.title}</h3>
                    </div>
                    <div className="card-section-body">
                      <p className="muted">{meal.blurb}</p>
                    </div>
                    <div className="card-section-foot">
                      <p className="meal-card-meta">
                        {meal.calories === null ||
                        meal.calories === undefined ||
                        meal.calories === ""
                          ? "Calories not provided"
                          : `Approx. ${meal.calories} calories`}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No options available in this course yet.</p>
          )}
        </section>
      ))}
      {/* ---- No sections at all ---- */}
      {!displayedSections.length && (
        <p className="muted">No course options are available right now.</p>
      )}
    </div>
  );
}
