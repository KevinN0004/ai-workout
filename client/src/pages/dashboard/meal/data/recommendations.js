/**
 * The meal suggestions for each goal track, keyed by detectTrack's track names:
 * a titled MealDB search per section, run by useMealDbSearch. Also the key of
 * MealView's "All courses" option.
 */
export const COURSE_ALL_KEY = "all-courses";

export const MEALDB_RECOMMENDATION_QUERIES = {
  lean_strength: [
    {
      key: "protein-focus",
      title: "Protein-forward meals",
      subtitle: "Great options to support strength days and recovery.",
      query: "chicken"
    },
    {
      key: "seafood-focus",
      title: "Seafood meals",
      subtitle: "Balanced meals with protein and healthy fats.",
      query: "salmon"
    },
    {
      key: "hearty-meals",
      title: "Hearty meal ideas",
      subtitle: "Filling choices for post-workout meals.",
      query: "beef"
    }
  ],
  fat_loss: [
    {
      key: "lighter-plates",
      title: "Lighter plate ideas",
      subtitle: "Lower-calorie options that stay satisfying.",
      query: "salad"
    },
    {
      key: "soup-options",
      title: "Soup and stew options",
      subtitle: "Simple meals that are easy to portion.",
      query: "soup"
    },
    {
      key: "lean-protein",
      title: "Lean protein meals",
      subtitle: "Protein-centered meals with straightforward prep.",
      query: "chicken"
    }
  ],
  endurance: [
    {
      key: "carb-fuel",
      title: "Carb-fuel meals",
      subtitle: "Higher-energy meals for longer training sessions.",
      query: "pasta"
    },
    {
      key: "rice-meals",
      title: "Rice-based meals",
      subtitle: "Steady fuel options before or after workouts.",
      query: "rice"
    },
    {
      key: "breakfast-fuel",
      title: "Breakfast fuel",
      subtitle: "Start-your-day meals for stable energy.",
      query: "breakfast"
    }
  ],
  recovery: [
    {
      key: "comfort-recovery",
      title: "Recovery comfort meals",
      subtitle: "Warm, easier meals for lighter training days.",
      query: "soup"
    },
    {
      key: "omega-options",
      title: "Omega-rich choices",
      subtitle: "Good options when recovery is your focus.",
      query: "salmon"
    },
    {
      key: "easy-prep",
      title: "Easy-prep meals",
      subtitle: "Lower-effort ideas when you want simple cooking.",
      query: "stew"
    }
  ]
};
