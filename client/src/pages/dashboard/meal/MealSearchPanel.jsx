export default function MealSearchPanel({
  mealDbInput,
  setMealDbInput,
  mealDbLoading,
  mealDbError,
  mealDbQuery,
  mealDbMeals,
  onSubmitMealDbSearch,
  onTryDefaultSearch
}) {
  return (
    <section className="mealdb-panel">
      <div className="meal-log-header">
        <h3>Recipe finder</h3>
        <p className="muted">
          Search for recipe ideas and open any card for ingredients and quick links.
        </p>
      </div>
      <form className="form mealdb-search-form" onSubmit={onSubmitMealDbSearch}>
        <label>
          Search
          <input
            value={mealDbInput}
            onChange={(event) => setMealDbInput(event.target.value)}
            placeholder="chicken, pasta, salmon"
          />
        </label>
        <button className="ghost mealdb-search-submit" type="submit" disabled={mealDbLoading}>
          {mealDbLoading ? "Searching..." : "Search"}
        </button>
      </form>
      {mealDbLoading && (
        <div className="meal-skeleton-grid" aria-hidden="true">
          <div className="meal-skeleton-card" />
          <div className="meal-skeleton-card" />
          <div className="meal-skeleton-card" />
        </div>
      )}
      {mealDbError && <p className="error">{mealDbError}</p>}
      {!mealDbLoading && !mealDbError && mealDbQuery && !mealDbMeals.length && (
        <div className="meal-empty-state">
          <p className="muted">No recipes found for "{mealDbQuery}".</p>
          <button type="button" className="ghost" onClick={onTryDefaultSearch}>
            Try "chicken"
          </button>
        </div>
      )}
    </section>
  );
}
