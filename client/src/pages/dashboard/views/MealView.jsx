import { useEffect, useMemo, useRef, useState } from "react";
import { detectTrack } from "../planUtils";
import { COURSE_ALL_KEY } from "../meal/data";
import { getCalorieBand, handleImageError } from "../meal/utils";
import useMealDbSearch from "../meal/useMealDbSearch";
import MealLogPanel from "../meal/MealLogPanel";
import MealSearchPanel from "../meal/MealSearchPanel";
import MealCoursePanel from "../meal/MealCoursePanel";
import MealSections from "../meal/MealSections";
import MealDetailsModal from "../meal/MealDetailsModal";
import "./MealView.css";

export default function MealView({
  dashboard,
  fallbackPlan,
  mealLogForm,
  setMealLogForm,
  submitMealLog,
  mealLogs
}) {
  const [activeMealId, setActiveMealId] = useState(null);
  const [activeCourseKey, setActiveCourseKey] = useState(COURSE_ALL_KEY);
  const mealLogNameInputRef = useRef(null);

  const safeMealLogs = Array.isArray(mealLogs) ? mealLogs : [];
  const safeMealLogForm = mealLogForm || {
    date: "",
    mealType: "breakfast",
    name: "",
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    notes: ""
  };

  const updateMealLogForm = typeof setMealLogForm === "function" ? setMealLogForm : () => {};
  const onSubmitMealLog =
    typeof submitMealLog === "function" ? submitMealLog : (event) => event.preventDefault();

  const latestPlan = dashboard?.plans?.[0];
  const goalTextForMeals =
    latestPlan?.goal ||
    dashboard?.goals?.goalType ||
    fallbackPlan?.goal ||
    "Build lean strength and energy";
  const mealTrack = detectTrack(goalTextForMeals);

  const {
    mealDbInput,
    setMealDbInput,
    mealDbQuery,
    mealDbMeals,
    mealDbLoading,
    mealDbError,
    mealDbRecommendations,
    mealDbRecommendationsLoading,
    mealDbRecommendationsError,
    submitMealDbSearch,
    runMealDbSearch
  } = useMealDbSearch(mealTrack);

  const mealContext = useMemo(() => {
    const targetCalories = Number(dashboard?.goals?.targetCalories || 2200);
    const weeklyDays = Number(
      latestPlan?.days || dashboard?.goals?.weeklyWorkouts || fallbackPlan?.days || 3
    );
    const calorieBand = getCalorieBand(targetCalories);
    const withPortions = (items) =>
      items.map((meal) => ({
        ...meal,
        portionNote: meal.portionByCalorie?.[calorieBand] || meal.portionByCalorie?.balanced || ""
      }));

    const recommendationSections = mealDbRecommendations.map((section) => ({
      key: section.key,
      title: section.title,
      subtitle: section.subtitle,
      meals: withPortions(section.meals)
    }));

    const sections = [
      {
        key: "mealdb-live",
        title: "Recipe results",
        subtitle: mealDbQuery
          ? `Results for "${mealDbQuery}".`
          : "Search above to see recipe ideas.",
        meals: withPortions(mealDbMeals)
      },
      ...recommendationSections
    ];
    const allMeals = sections.flatMap((section) => section.meals);
    const courseOptions = [
      { key: COURSE_ALL_KEY, title: "All courses", count: allMeals.length },
      ...sections.map((section) => ({
        key: section.key,
        title: section.title,
        count: Array.isArray(section.meals) ? section.meals.length : 0
      }))
    ];

    return {
      goalText: goalTextForMeals,
      targetCalories,
      weeklyDays,
      sections,
      allMeals,
      courseOptions
    };
  }, [
    dashboard,
    fallbackPlan,
    latestPlan,
    mealDbMeals,
    mealDbQuery,
    mealDbRecommendations,
    goalTextForMeals
  ]);

  const displayedSections = useMemo(() => {
    if (activeCourseKey === COURSE_ALL_KEY) {
      return mealContext.sections.filter(
        (section) => Array.isArray(section.meals) && section.meals.length
      );
    }
    const selected = mealContext.sections.find((section) => section.key === activeCourseKey);
    return selected ? [selected] : [];
  }, [mealContext.sections, activeCourseKey]);

  const activeMeal = useMemo(
    () => mealContext.allMeals.find((meal) => meal.id === activeMealId) || null,
    [mealContext.allMeals, activeMealId]
  );
  const activeMealIngredients = Array.isArray(activeMeal?.ingredients)
    ? activeMeal.ingredients
    : [];
  const activeMealRecipes = Array.isArray(activeMeal?.recipes) ? activeMeal.recipes : [];

  useEffect(() => {
    if (!activeMeal) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setActiveMealId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeMeal]);

  useEffect(() => {
    if (activeCourseKey === COURSE_ALL_KEY) return;
    const hasActiveCourse = mealContext.sections.some((section) => section.key === activeCourseKey);
    if (!hasActiveCourse) setActiveCourseKey(COURSE_ALL_KEY);
  }, [activeCourseKey, mealContext.sections]);

  return (
    <section className="panel meal-view">
      <div className="meal-view-header">
        <div>
          <h2>Meal prep</h2>
          <p className="muted">Suggestions based on your current account plan and goals.</p>
        </div>
        <aside className="meal-context">
          <p>
            <strong>Goal:</strong> {mealContext.goalText}
          </p>
          <p>
            <strong>Target calories:</strong> {mealContext.targetCalories} / day
          </p>
          <p>
            <strong>Weekly plan:</strong> {mealContext.weeklyDays} training days
          </p>
        </aside>
      </div>

      <MealLogPanel
        safeMealLogForm={safeMealLogForm}
        safeMealLogs={safeMealLogs}
        updateMealLogForm={updateMealLogForm}
        onSubmitMealLog={onSubmitMealLog}
        mealLogNameInputRef={mealLogNameInputRef}
      />

      <MealSearchPanel
        mealDbInput={mealDbInput}
        setMealDbInput={setMealDbInput}
        mealDbLoading={mealDbLoading}
        mealDbError={mealDbError}
        mealDbQuery={mealDbQuery}
        mealDbMeals={mealDbMeals}
        onSubmitMealDbSearch={submitMealDbSearch}
        onTryDefaultSearch={() => runMealDbSearch("chicken")}
      />

      {mealDbRecommendationsLoading && (
        <div className="meal-skeleton-grid" aria-hidden="true">
          <div className="meal-skeleton-card" />
          <div className="meal-skeleton-card" />
          <div className="meal-skeleton-card" />
        </div>
      )}
      {mealDbRecommendationsError && <p className="error">{mealDbRecommendationsError}</p>}

      <MealCoursePanel
        courseOptions={mealContext.courseOptions}
        activeCourseKey={activeCourseKey}
        setActiveCourseKey={setActiveCourseKey}
      />

      <MealSections
        displayedSections={displayedSections}
        onSelectMeal={setActiveMealId}
        handleImageError={handleImageError}
      />

      <MealDetailsModal
        activeMeal={activeMeal}
        activeMealIngredients={activeMealIngredients}
        activeMealRecipes={activeMealRecipes}
        onClose={() => setActiveMealId(null)}
        handleImageError={handleImageError}
      />
    </section>
  );
}
