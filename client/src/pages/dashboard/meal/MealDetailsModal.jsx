import ModalPortal from "../../../components/ModalPortal";

export default function MealDetailsModal({
  activeMeal,
  activeMealIngredients,
  activeMealRecipes,
  onClose,
  handleImageError
}) {
  if (!activeMeal) return null;

  return (
    <ModalPortal open={Boolean(activeMeal)} onClose={onClose}>
      <div
        className="modal-backdrop dashboard-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={`Meal details for ${activeMeal.title}`}
        onClick={onClose}
      >
        <div
          className="modal dashboard-modal meal-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-header meal-modal-header">
            <button
              type="button"
              className="ghost icon-button"
              aria-label="Close"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="modal-body">
            <div className="meal-modal-grid">
              <section className="meal-modal-left">
                <img src={activeMeal.image} alt={activeMeal.title} onError={handleImageError} />
              </section>

              <section className="meal-modal-right">
                <h3 className="meal-modal-title">{activeMeal.title}</h3>
                <p className="meal-modal-summary">{activeMeal.blurb}</p>
                {activeMeal.portionNote ? (
                  <p className="meal-modal-summary">{activeMeal.portionNote}</p>
                ) : null}

                <h3>Ingredients</h3>
                <ul className="meal-list">
                  {activeMealIngredients.map((ingredient) => (
                    <li key={ingredient}>{ingredient}</li>
                  ))}
                  {!activeMealIngredients.length && <li>No ingredient details available.</li>}
                </ul>

                <h3>Recipe links</h3>
                <ul className="meal-list meal-links">
                  {activeMealRecipes.map((recipe) => (
                    <li key={recipe.url}>
                      <a href={recipe.url} target="_blank" rel="noreferrer">
                        {recipe.label}
                      </a>
                    </li>
                  ))}
                  {!activeMealRecipes.length && <li>No recipe links available.</li>}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
