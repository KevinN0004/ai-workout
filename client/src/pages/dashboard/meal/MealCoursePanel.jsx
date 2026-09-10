export default function MealCoursePanel({ courseOptions, activeCourseKey, setActiveCourseKey }) {
  return (
    <section className="meal-course-panel">
      <div className="meal-log-header">
        <h3>Course options</h3>
        <p className="muted">Pick a section to focus your meal browsing.</p>
      </div>
      <div className="meal-course-controls" role="tablist" aria-label="Meal course options">
        {courseOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`meal-course-pill ${activeCourseKey === option.key ? "active" : ""}`}
            onClick={() => setActiveCourseKey(option.key)}
          >
            {option.title}
            <span className="meal-course-count">{option.count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
