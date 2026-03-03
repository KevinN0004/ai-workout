export const EXTRA_MEAL_LIBRARY = {
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


