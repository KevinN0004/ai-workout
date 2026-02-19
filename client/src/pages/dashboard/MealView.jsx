import { useEffect, useMemo, useState } from "react";
import { detectTrack } from "./planUtils";
import "./MealView.css";

const FALLBACK_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0f0f0f"/><stop offset="100%" stop-color="#2b2b2b"/></linearGradient></defs><rect width="800" height="520" fill="url(#g)"/><text x="400" y="255" text-anchor="middle" fill="#f2f2f2" font-size="44" font-family="Arial, sans-serif">Meal Prep</text></svg>'
)}`;

const MEAL_LIBRARY = {
  lean_strength: [
    {
      id: "lean-salmon-bowl",
      title: "Salmon Rice Power Bowl",
      image:
        "https://source.unsplash.com/featured/900x650/?salmon,rice,bowl,mealprep",
      blurb: "High protein with omega-3 fats for recovery and strength days.",
      calories: 620,
      ingredients: [
        "6 oz salmon fillet",
        "1 cup cooked jasmine rice",
        "1 cup roasted broccoli",
        "1/2 avocado",
        "Lemon, garlic, olive oil, salt, pepper"
      ],
      recipes: [
        {
          label: "EatingWell search",
          url: "https://www.eatingwell.com/search?q=salmon+rice+bowl"
        },
        {
          label: "Budget Bytes search",
          url: "https://www.budgetbytes.com/?s=salmon+rice+bowl"
        }
      ],
      portionByCalorie: {
        light: "Use 3/4 cup rice and skip extra oil.",
        balanced: "Use 1 cup rice and 1 tsp oil.",
        high: "Use 1.5 cups rice and add a side of fruit."
      }
    },
    {
      id: "lean-chicken-quinoa",
      title: "Chicken Quinoa Prep Box",
      image:
        "https://source.unsplash.com/featured/900x650/?chicken,quinoa,mealprep",
      blurb: "Lean protein and complex carbs for steady energy and muscle gain.",
      calories: 540,
      ingredients: [
        "6 oz grilled chicken breast",
        "1 cup cooked quinoa",
        "1 cup mixed peppers and onions",
        "2 tbsp hummus",
        "Paprika, cumin, salt, pepper"
      ],
      recipes: [
        {
          label: "BBC Good Food search",
          url: "https://www.bbcgoodfood.com/search?q=chicken+quinoa+meal+prep"
        },
        {
          label: "Feel Good Foodie search",
          url: "https://feelgoodfoodie.net/?s=chicken+quinoa+meal+prep"
        }
      ],
      portionByCalorie: {
        light: "Use 3/4 cup quinoa and extra non-starchy vegetables.",
        balanced: "Use 1 cup quinoa and 2 tbsp hummus.",
        high: "Use 1.25 cups quinoa and add a whole-grain pita."
      }
    },
    {
      id: "lean-turkey-chili",
      title: "Turkey Bean Chili",
      image:
        "https://source.unsplash.com/featured/900x650/?turkey,chili,beans",
      blurb: "Batch-cook friendly with high protein and fiber per serving.",
      calories: 500,
      ingredients: [
        "1 lb lean ground turkey",
        "1 can black beans",
        "1 can kidney beans",
        "1 can crushed tomatoes",
        "Onion, garlic, chili powder, cumin"
      ],
      recipes: [
        {
          label: "Allrecipes search",
          url: "https://www.allrecipes.com/search?q=lean+turkey+chili"
        },
        {
          label: "The Kitchn search",
          url: "https://www.thekitchn.com/search?q=turkey+chili"
        }
      ],
      portionByCalorie: {
        light: "Keep each bowl to about 1.5 cups.",
        balanced: "Use 2 cups per bowl with extra veggies.",
        high: "Use 2 cups and pair with a baked potato."
      }
    },
    {
      id: "lean-yogurt-oats",
      title: "Greek Yogurt Oats Cup",
      image:
        "https://source.unsplash.com/featured/900x650/?greek,yogurt,oats,berries",
      blurb: "Fast prep breakfast with protein, carbs, and fruit.",
      calories: 430,
      ingredients: [
        "1 cup Greek yogurt",
        "1/2 cup rolled oats",
        "1 cup mixed berries",
        "1 tbsp chia seeds",
        "Honey and cinnamon"
      ],
      recipes: [
        {
          label: "Love and Lemons search",
          url: "https://www.loveandlemons.com/?s=greek+yogurt+oats"
        },
        {
          label: "Food Network search",
          url: "https://www.foodnetwork.com/search/greek-yogurt-oats"
        }
      ],
      portionByCalorie: {
        light: "Use 1/3 cup oats and no honey.",
        balanced: "Use 1/2 cup oats and 1 tsp honey.",
        high: "Use 3/4 cup oats and add nut butter."
      }
    }
  ],
  fat_loss: [
    {
      id: "fat-chicken-salad",
      title: "Chicken Crunch Salad Bowl",
      image:
        "https://source.unsplash.com/featured/900x650/?chicken,salad,healthy",
      blurb: "High volume and high protein with lower calories.",
      calories: 420,
      ingredients: [
        "5 oz grilled chicken breast",
        "2 cups romaine and spinach",
        "1 cup cucumber, tomato, red onion",
        "1/4 cup chickpeas",
        "Lemon juice, mustard, olive oil"
      ],
      recipes: [
        {
          label: "EatingWell search",
          url: "https://www.eatingwell.com/search?q=chicken+salad+meal+prep"
        },
        {
          label: "Skinnytaste search",
          url: "https://www.skinnytaste.com/?s=chicken+salad+meal+prep"
        }
      ],
      portionByCalorie: {
        light: "Use 1 tsp oil in dressing.",
        balanced: "Use 2 tsp oil and 1/4 cup chickpeas.",
        high: "Add quinoa or whole-grain pita on the side."
      }
    },
    {
      id: "fat-shrimp-cauliflower",
      title: "Shrimp Cauliflower Rice Stir Fry",
      image:
        "https://source.unsplash.com/featured/900x650/?shrimp,cauliflower,rice",
      blurb: "Light but filling option for fat loss and conditioning blocks.",
      calories: 390,
      ingredients: [
        "6 oz shrimp",
        "2 cups cauliflower rice",
        "1 cup snap peas and carrots",
        "Low-sodium soy sauce",
        "Garlic, ginger, sesame seeds"
      ],
      recipes: [
        {
          label: "Delish search",
          url: "https://www.delish.com/search/?q=shrimp+cauliflower+rice"
        },
        {
          label: "Downshiftology search",
          url: "https://downshiftology.com/?s=shrimp+cauliflower+rice"
        }
      ],
      portionByCalorie: {
        light: "Keep sauce to 1 tbsp and skip extra sesame oil.",
        balanced: "Use 1.5 tbsp sauce and 1 tsp sesame oil.",
        high: "Add 1/2 cup cooked rice with cauliflower rice."
      }
    },
    {
      id: "fat-egg-white-wrap",
      title: "Egg White Veggie Wrap",
      image:
        "https://source.unsplash.com/featured/900x650/?egg,white,wrap,veggies",
      blurb: "Quick prep meal with protein and fiber for lower-calorie days.",
      calories: 360,
      ingredients: [
        "6 egg whites",
        "1 whole-grain tortilla",
        "Spinach, mushrooms, peppers",
        "2 tbsp salsa",
        "Salt, pepper, garlic powder"
      ],
      recipes: [
        {
          label: "Allrecipes search",
          url: "https://www.allrecipes.com/search?q=egg+white+wrap"
        },
        {
          label: "Food52 search",
          url: "https://food52.com/recipes/search?q=egg+white+wrap"
        }
      ],
      portionByCalorie: {
        light: "Use a low-carb tortilla.",
        balanced: "Use a standard whole-grain tortilla.",
        high: "Add 1 oz cheese or a side of fruit."
      }
    },
    {
      id: "fat-lentil-soup",
      title: "Lentil Vegetable Soup",
      image:
        "https://source.unsplash.com/featured/900x650/?lentil,soup,vegetable",
      blurb: "Budget-friendly fiber and plant protein for satiety.",
      calories: 410,
      ingredients: [
        "1 cup dry lentils",
        "Carrot, celery, onion, tomatoes",
        "Low-sodium vegetable broth",
        "Spinach or kale",
        "Cumin, paprika, black pepper"
      ],
      recipes: [
        {
          label: "Cookie and Kate search",
          url: "https://cookieandkate.com/?s=lentil+soup"
        },
        {
          label: "Minimalist Baker search",
          url: "https://minimalistbaker.com/?s=lentil+soup"
        }
      ],
      portionByCalorie: {
        light: "Use 1.5 cups soup per serving.",
        balanced: "Use 2 cups soup per serving.",
        high: "Serve with whole-grain toast."
      }
    }
  ],
  endurance: [
    {
      id: "endurance-oats",
      title: "Banana Peanut Overnight Oats",
      image:
        "https://source.unsplash.com/featured/900x650/?overnight,oats,banana,peanut",
      blurb: "Higher carb breakfast for longer cardio sessions.",
      calories: 520,
      ingredients: [
        "1/2 cup rolled oats",
        "1 cup milk of choice",
        "1 banana",
        "1 tbsp peanut butter",
        "Chia seeds and cinnamon"
      ],
      recipes: [
        {
          label: "The Modern Proper search",
          url: "https://themodernproper.com/search?q=overnight+oats"
        },
        {
          label: "EatingWell search",
          url: "https://www.eatingwell.com/search?q=banana+overnight+oats"
        }
      ],
      portionByCalorie: {
        light: "Use 1/3 cup oats and 1/2 banana.",
        balanced: "Use 1/2 cup oats and 1 banana.",
        high: "Use 3/4 cup oats and add extra banana."
      }
    },
    {
      id: "endurance-chicken-pasta",
      title: "Chicken Pasta Prep",
      image:
        "https://source.unsplash.com/featured/900x650/?chicken,pasta,mealprep",
      blurb: "Carb-forward lunch for training volume and recovery.",
      calories: 640,
      ingredients: [
        "6 oz chicken breast",
        "2 cups cooked pasta",
        "1 cup marinara sauce",
        "Spinach or zucchini",
        "Parmesan, garlic, basil"
      ],
      recipes: [
        {
          label: "BBC Good Food search",
          url: "https://www.bbcgoodfood.com/search?q=chicken+pasta+meal+prep"
        },
        {
          label: "Food Network search",
          url: "https://www.foodnetwork.com/search/chicken-pasta"
        }
      ],
      portionByCalorie: {
        light: "Use 1 cup cooked pasta.",
        balanced: "Use 1.5 cups cooked pasta.",
        high: "Use 2 cups pasta and add fruit."
      }
    },
    {
      id: "endurance-tofu-teriyaki",
      title: "Tofu Teriyaki Rice Bowl",
      image:
        "https://source.unsplash.com/featured/900x650/?tofu,teriyaki,rice,bowl",
      blurb: "Plant-based option with solid carbs and post-workout protein.",
      calories: 560,
      ingredients: [
        "7 oz extra-firm tofu",
        "1.25 cups cooked rice",
        "Broccoli and carrots",
        "Low-sugar teriyaki sauce",
        "Ginger, garlic, sesame"
      ],
      recipes: [
        {
          label: "Love and Lemons search",
          url: "https://www.loveandlemons.com/?s=tofu+teriyaki+bowl"
        },
        {
          label: "Budget Bytes search",
          url: "https://www.budgetbytes.com/?s=tofu+teriyaki+bowl"
        }
      ],
      portionByCalorie: {
        light: "Use 3/4 cup rice.",
        balanced: "Use 1.25 cups rice.",
        high: "Use 1.75 cups rice and extra tofu."
      }
    },
    {
      id: "endurance-beef-sweet-potato",
      title: "Beef Sweet Potato Skillet",
      image:
        "https://source.unsplash.com/featured/900x650/?beef,sweet-potato,skillet",
      blurb: "Iron-rich protein and carbs to support harder training blocks.",
      calories: 610,
      ingredients: [
        "6 oz lean ground beef",
        "1.5 cups diced sweet potato",
        "Bell pepper and onion",
        "Olive oil",
        "Paprika, garlic, black pepper"
      ],
      recipes: [
        {
          label: "Allrecipes search",
          url: "https://www.allrecipes.com/search?q=beef+sweet+potato+skillet"
        },
        {
          label: "The Kitchn search",
          url: "https://www.thekitchn.com/search?q=beef+sweet+potato+skillet"
        }
      ],
      portionByCalorie: {
        light: "Use 1 cup sweet potato.",
        balanced: "Use 1.5 cups sweet potato.",
        high: "Use 2 cups sweet potato and add rice."
      }
    }
  ],
  recovery: [
    {
      id: "recovery-turmeric-soup",
      title: "Turmeric Chicken Soup",
      image:
        "https://source.unsplash.com/featured/900x650/?chicken,soup,turmeric",
      blurb: "Hydrating and warm meal for lighter or recovery-focused days.",
      calories: 460,
      ingredients: [
        "6 oz shredded chicken",
        "Carrot, celery, onion",
        "Low-sodium chicken broth",
        "Turmeric, ginger, garlic",
        "Spinach and lemon juice"
      ],
      recipes: [
        {
          label: "Feasting at Home search",
          url: "https://www.feastingathome.com/?s=turmeric+chicken+soup"
        },
        {
          label: "Allrecipes search",
          url: "https://www.allrecipes.com/search?q=turmeric+chicken+soup"
        }
      ],
      portionByCalorie: {
        light: "Use 1.5 cups soup per serving.",
        balanced: "Use 2 cups soup per serving.",
        high: "Serve with rice or whole-grain bread."
      }
    },
    {
      id: "recovery-salmon-quinoa",
      title: "Salmon Avocado Quinoa Plate",
      image:
        "https://source.unsplash.com/featured/900x650/?salmon,avocado,quinoa",
      blurb: "Omega-3 rich meal supporting joint and tissue recovery.",
      calories: 590,
      ingredients: [
        "6 oz baked salmon",
        "1 cup cooked quinoa",
        "1/2 avocado",
        "Arugula and cherry tomatoes",
        "Olive oil, lemon, dill"
      ],
      recipes: [
        {
          label: "EatingWell search",
          url: "https://www.eatingwell.com/search?q=salmon+quinoa+bowl"
        },
        {
          label: "BBC Good Food search",
          url: "https://www.bbcgoodfood.com/search?q=salmon+quinoa"
        }
      ],
      portionByCalorie: {
        light: "Use 3/4 cup quinoa.",
        balanced: "Use 1 cup quinoa.",
        high: "Use 1.25 cups quinoa and full avocado."
      }
    },
    {
      id: "recovery-tofu-soba",
      title: "Tofu Soba Noodle Bowl",
      image:
        "https://source.unsplash.com/featured/900x650/?tofu,soba,noodles",
      blurb: "Easy-to-digest carbs and protein for active recovery windows.",
      calories: 520,
      ingredients: [
        "7 oz tofu",
        "4 oz soba noodles",
        "Edamame, bok choy, carrots",
        "Low-sodium soy sauce",
        "Sesame oil, garlic, ginger"
      ],
      recipes: [
        {
          label: "Minimalist Baker search",
          url: "https://minimalistbaker.com/?s=soba+tofu"
        },
        {
          label: "Just One Cookbook search",
          url: "https://www.justonecookbook.com/?s=soba+tofu"
        }
      ],
      portionByCalorie: {
        light: "Use 3 oz dry soba noodles.",
        balanced: "Use 4 oz dry soba noodles.",
        high: "Use 5 oz dry soba noodles and extra edamame."
      }
    },
    {
      id: "recovery-frittata",
      title: "Turkey Veggie Frittata",
      image:
        "https://source.unsplash.com/featured/900x650/?frittata,turkey,vegetables",
      blurb: "Simple make-ahead option for protein and micronutrients.",
      calories: 470,
      ingredients: [
        "8 whole eggs",
        "6 oz ground turkey",
        "Spinach, mushroom, onion",
        "Feta cheese",
        "Salt, pepper, oregano"
      ],
      recipes: [
        {
          label: "Food Network search",
          url: "https://www.foodnetwork.com/search/turkey-frittata"
        },
        {
          label: "The Kitchn search",
          url: "https://www.thekitchn.com/search?q=turkey+frittata"
        }
      ],
      portionByCalorie: {
        light: "Cut into 6 slices and use one slice per serving.",
        balanced: "Cut into 5 slices and use one slice per serving.",
        high: "Use one larger slice and add toast or fruit."
      }
    }
  ]
};

const EXTRA_MEAL_LIBRARY = {
  desserts: [
    {
      id: "dessert-berry-parfait",
      title: "Berry Protein Parfait",
      image:
        "https://source.unsplash.com/featured/900x650/?berry,parfait,healthy,dessert",
      blurb: "Sweet finish with protein and fiber.",
      calories: 260,
      ingredients: [
        "3/4 cup Greek yogurt",
        "1/2 cup berries",
        "1 tbsp granola",
        "1 tsp honey",
        "Cinnamon"
      ],
      recipes: [
        {
          label: "EatingWell search",
          url: "https://www.eatingwell.com/search?q=greek+yogurt+parfait"
        },
        {
          label: "Love and Lemons search",
          url: "https://www.loveandlemons.com/?s=berry+parfait"
        }
      ],
      portionByCalorie: {
        light: "Use 1/2 cup yogurt and skip honey.",
        balanced: "Use standard portion.",
        high: "Add extra granola and nut butter."
      }
    },
    {
      id: "dessert-choco-pudding",
      title: "Chocolate Chia Pudding",
      image:
        "https://source.unsplash.com/featured/900x650/?chia,pudding,chocolate",
      blurb: "Prep-ahead dessert with healthy fats.",
      calories: 300,
      ingredients: [
        "3 tbsp chia seeds",
        "3/4 cup milk of choice",
        "1 tbsp cocoa powder",
        "1 tsp maple syrup",
        "Vanilla extract"
      ],
      recipes: [
        {
          label: "Minimalist Baker search",
          url: "https://minimalistbaker.com/?s=chocolate+chia+pudding"
        },
        {
          label: "Downshiftology search",
          url: "https://downshiftology.com/?s=chia+pudding"
        }
      ],
      portionByCalorie: {
        light: "Use 2 tbsp chia seeds.",
        balanced: "Use standard portion.",
        high: "Top with fruit and nuts."
      }
    },
    {
      id: "dessert-protein-brownie",
      title: "Protein Brownie Bites",
      image:
        "https://source.unsplash.com/featured/900x650/?protein,brownies,dessert",
      blurb: "Batch dessert option for controlled sweet cravings.",
      calories: 220,
      ingredients: [
        "1 scoop chocolate protein",
        "2 tbsp almond flour",
        "1 mashed banana",
        "1 tbsp cocoa powder",
        "Pinch of baking powder"
      ],
      recipes: [
        {
          label: "Allrecipes search",
          url: "https://www.allrecipes.com/search?q=protein+brownie"
        },
        {
          label: "BBC Good Food search",
          url: "https://www.bbcgoodfood.com/search?q=protein+brownie"
        }
      ],
      portionByCalorie: {
        light: "Keep to one brownie bite.",
        balanced: "Use two bite-size brownies.",
        high: "Pair with yogurt or fruit."
      }
    }
  ],
  snacks: [
    {
      id: "snack-hummus-box",
      title: "Hummus Crunch Snack Box",
      image:
        "https://source.unsplash.com/featured/900x650/?hummus,vegetable,snack",
      blurb: "Fiber-rich snack to stabilize appetite.",
      calories: 280,
      ingredients: [
        "1/4 cup hummus",
        "Carrot and cucumber sticks",
        "Bell pepper strips",
        "Whole-grain crackers",
        "Lemon and paprika"
      ],
      recipes: [
        {
          label: "Budget Bytes search",
          url: "https://www.budgetbytes.com/?s=hummus+snack+box"
        },
        {
          label: "The Kitchn search",
          url: "https://www.thekitchn.com/search?q=hummus+snack+box"
        }
      ],
      portionByCalorie: {
        light: "Use fewer crackers and extra veggies.",
        balanced: "Use standard portion.",
        high: "Add a boiled egg or extra crackers."
      }
    },
    {
      id: "snack-apple-peanut",
      title: "Apple Peanut Butter Pack",
      image:
        "https://source.unsplash.com/featured/900x650/?apple,peanut,butter,snack",
      blurb: "Simple carb-plus-fat snack for training days.",
      calories: 240,
      ingredients: [
        "1 apple",
        "1.5 tbsp peanut butter",
        "Pinch cinnamon",
        "Optional chia seeds"
      ],
      recipes: [
        {
          label: "Food Network search",
          url: "https://www.foodnetwork.com/search/apple-peanut-butter-snack"
        },
        {
          label: "EatingWell search",
          url: "https://www.eatingwell.com/search?q=apple+peanut+butter+snack"
        }
      ],
      portionByCalorie: {
        light: "Use 1 tbsp peanut butter.",
        balanced: "Use standard portion.",
        high: "Use 2 tbsp peanut butter and add yogurt."
      }
    },
    {
      id: "snack-cottage-cup",
      title: "Cottage Cheese Fruit Cup",
      image:
        "https://source.unsplash.com/featured/900x650/?cottage,cheese,fruit",
      blurb: "High-protein snack with quick prep.",
      calories: 230,
      ingredients: [
        "3/4 cup cottage cheese",
        "1/2 cup pineapple or berries",
        "1 tbsp pumpkin seeds",
        "Black pepper or cinnamon"
      ],
      recipes: [
        {
          label: "Allrecipes search",
          url: "https://www.allrecipes.com/search?q=cottage+cheese+fruit+bowl"
        },
        {
          label: "Cookie and Kate search",
          url: "https://cookieandkate.com/?s=cottage+cheese+bowl"
        }
      ],
      portionByCalorie: {
        light: "Use 1/2 cup cottage cheese.",
        balanced: "Use standard portion.",
        high: "Add extra fruit and seeds."
      }
    }
  ],
  drinks: [
    {
      id: "drink-green-smoothie",
      title: "Green Protein Smoothie",
      image:
        "https://source.unsplash.com/featured/900x650/?green,smoothie,protein",
      blurb: "Post-workout drink for protein and micronutrients.",
      calories: 320,
      ingredients: [
        "1 scoop vanilla protein",
        "1 cup spinach",
        "1 banana",
        "1 cup almond milk",
        "Ice"
      ],
      recipes: [
        {
          label: "EatingWell search",
          url: "https://www.eatingwell.com/search?q=green+protein+smoothie"
        },
        {
          label: "Minimalist Baker search",
          url: "https://minimalistbaker.com/?s=protein+smoothie"
        }
      ],
      portionByCalorie: {
        light: "Use half a banana.",
        balanced: "Use standard portion.",
        high: "Add oats or nut butter."
      }
    },
    {
      id: "drink-coldbrew-shake",
      title: "Cold Brew Recovery Shake",
      image:
        "https://source.unsplash.com/featured/900x650/?coffee,protein,shake",
      blurb: "Caffeine plus protein for busy mornings.",
      calories: 290,
      ingredients: [
        "1 cup cold brew coffee",
        "1 scoop chocolate protein",
        "1/2 cup milk",
        "Ice",
        "Pinch cinnamon"
      ],
      recipes: [
        {
          label: "Food Network search",
          url: "https://www.foodnetwork.com/search/coffee-protein-shake"
        },
        {
          label: "The Kitchn search",
          url: "https://www.thekitchn.com/search?q=coffee+protein+shake"
        }
      ],
      portionByCalorie: {
        light: "Use unsweetened milk.",
        balanced: "Use standard portion.",
        high: "Blend with oats for extra carbs."
      }
    },
    {
      id: "drink-electrolyte-refresher",
      title: "Citrus Electrolyte Refresher",
      image:
        "https://source.unsplash.com/featured/900x650/?citrus,drink,hydration",
      blurb: "Hydration-focused option for high-sweat sessions.",
      calories: 90,
      ingredients: [
        "16 oz cold water",
        "Juice from lemon and orange",
        "Pinch sea salt",
        "1 tsp honey",
        "Ice"
      ],
      recipes: [
        {
          label: "Allrecipes search",
          url: "https://www.allrecipes.com/search?q=homemade+electrolyte+drink"
        },
        {
          label: "BBC Good Food search",
          url: "https://www.bbcgoodfood.com/search?q=electrolyte+drink"
        }
      ],
      portionByCalorie: {
        light: "Skip honey.",
        balanced: "Use standard portion.",
        high: "Use a little extra honey around training."
      }
    }
  ]
};

const getCalorieBand = (targetCalories) => {
  if (targetCalories < 2000) return "light";
  if (targetCalories > 2500) return "high";
  return "balanced";
};

const handleImageError = (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = FALLBACK_IMAGE;
};

export default function MealView({
  dashboard,
  fallbackPlan,
  mealLogForm,
  setMealLogForm,
  submitMealLog,
  mealLogs
}) {
  const [activeMealId, setActiveMealId] = useState(null);
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
  const updateMealLogForm =
    typeof setMealLogForm === "function" ? setMealLogForm : () => {};
  const onSubmitMealLog =
    typeof submitMealLog === "function" ? submitMealLog : (event) => event.preventDefault();

  const mealContext = useMemo(() => {
    const latestPlan = dashboard?.plans?.[0];
    const goalText =
      latestPlan?.goal ||
      dashboard?.goals?.goalType ||
      fallbackPlan?.goal ||
      "Build lean strength and energy";
    const targetCalories = Number(dashboard?.goals?.targetCalories || 2200);
    const weeklyDays = Number(
      latestPlan?.days ||
        dashboard?.goals?.weeklyWorkouts ||
        fallbackPlan?.days ||
        3
    );
    const track = detectTrack(goalText);
    const calorieBand = getCalorieBand(targetCalories);
    const sourceMeals = MEAL_LIBRARY[track] || MEAL_LIBRARY.lean_strength;
    const withPortions = (items) =>
      items.map((meal) => ({
        ...meal,
        portionNote:
          meal.portionByCalorie?.[calorieBand] ||
          meal.portionByCalorie?.balanced ||
          ""
      }));

    const sections = [
      {
        key: "main-courses",
        title: "Main Courses",
        subtitle: "Primary meals aligned to your current goal and calories.",
        meals: withPortions(sourceMeals.slice(0, 6))
      },
      {
        key: "desserts",
        title: "Desserts",
        subtitle: "Lighter sweet options for structured meal prep.",
        meals: withPortions(EXTRA_MEAL_LIBRARY.desserts)
      },
      {
        key: "snacks",
        title: "Snacks",
        subtitle: "Simple grab-and-go options between meals.",
        meals: withPortions(EXTRA_MEAL_LIBRARY.snacks)
      },
      {
        key: "drinks",
        title: "Drinks",
        subtitle: "Hydration and recovery-focused beverage ideas.",
        meals: withPortions(EXTRA_MEAL_LIBRARY.drinks)
      }
    ];
    const allMeals = sections.flatMap((section) => section.meals);

    return { goalText, targetCalories, weeklyDays, sections, allMeals };
  }, [dashboard, fallbackPlan]);

  const activeMeal = useMemo(
    () => mealContext.allMeals.find((meal) => meal.id === activeMealId) || null,
    [mealContext.allMeals, activeMealId]
  );

  useEffect(() => {
    if (!activeMeal) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setActiveMealId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeMeal]);

  return (
    <section className="panel meal-view">
      <div className="meal-view-header">
        <div>
          <h2>Meal prep</h2>
          <p className="muted">
            Suggestions based on your current account plan and goals.
          </p>
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

      <section className="meal-log-panel">
        <div className="meal-log-header">
          <h3>Meal log history</h3>
          <p className="muted">Track meals and macros. Saved to your database.</p>
        </div>
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
                  {item.calories ?? "--"} kcal | P {item.proteinG ?? "--"} / C {item.carbsG ?? "--"} / F{" "}
                  {item.fatG ?? "--"}
                </p>
              </div>
            </div>
          ))}
          {!safeMealLogs.length && <p className="muted">No meal logs yet.</p>}
        </div>
      </section>

      <div className="meal-sections">
        {mealContext.sections.map((section) => (
          <section key={section.key} className="meal-section">
            <div className="meal-section-header">
              <h3>{section.title}</h3>
              <p className="muted">{section.subtitle}</p>
            </div>
            <div className="meal-grid" role="list" aria-label={`${section.title} suggestions`}>
              {section.meals.map((meal) => (
                <button
                  key={meal.id}
                  type="button"
                  className="meal-card"
                  role="listitem"
                  onClick={() => setActiveMealId(meal.id)}
                >
                  <img
                    src={meal.image}
                    alt={meal.title}
                    loading="lazy"
                    onError={handleImageError}
                  />
                  <div className="meal-card-copy">
                    <h3>{meal.title}</h3>
                    <p className="muted">{meal.blurb}</p>
                    <p className="meal-card-meta">Approx. {meal.calories} calories</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {activeMeal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Meal details for ${activeMeal.title}`}
          onClick={() => setActiveMealId(null)}
        >
          <div className="modal meal-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header meal-modal-header">
              <button
                type="button"
                className="ghost"
                onClick={() => setActiveMealId(null)}
              >
                Close
              </button>
            </div>

            <div className="modal-body">
              <div className="meal-modal-grid">
                <section className="meal-modal-left">
                  <h3>{activeMeal.title}</h3>
                  <img
                    src={activeMeal.image}
                    alt={activeMeal.title}
                    onError={handleImageError}
                  />
                  <p>{activeMeal.blurb}</p>
                  <p>{activeMeal.portionNote}</p>
                </section>

                <section className="meal-modal-right">
                  <h3>Ingredients</h3>
                  <ul className="meal-list">
                    {activeMeal.ingredients.map((ingredient) => (
                      <li key={ingredient}>{ingredient}</li>
                    ))}
                  </ul>

                  <h3>Recipe links</h3>
                  <ul className="meal-list meal-links">
                    {activeMeal.recipes.map((recipe) => (
                      <li key={recipe.url}>
                        <a href={recipe.url} target="_blank" rel="noreferrer">
                          {recipe.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
