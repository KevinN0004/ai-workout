/**
 * The curated exercises the rule-based plan generator chooses from, each tagged
 * by pattern, equipment, level and how it suits each body area, and the
 * capabilities each planner label supplies (docs/specs/2026-11-03-rule-based-plans-design.md).
 */
// @ts-check

import { INJURY_AREAS } from "./injuryRules.js";

/**
 * One library entry. `flags` maps an area to "modify" or "avoid"; an area it
 * does not name suits the entry. `regressions` names, for each "modify" area,
 * the easier entry to use instead and the cue the plan shows with it.
 * @typedef {object} Exercise
 * @property {string} id
 * @property {string} name
 * @property {string} pattern
 * @property {string[]} needs
 * @property {string} level
 * @property {Record<string, "modify" | "avoid">} flags
 * @property {Record<string, { id: string, cue: string }>} regressions
 * @property {boolean} supine
 * @property {"high" | "low"} [impact]
 */

/** The movement patterns a day's slots ask for. */
export const PATTERNS = [
  "squat",
  "hinge",
  "horizontal-push",
  "vertical-push",
  "horizontal-pull",
  "vertical-pull",
  "single-leg",
  "glutes-calves",
  "core",
  "arms",
  "conditioning",
  "mobility",
  "balance"
];

/** The equipment an entry can need, in the order capabilitiesFor lists them. */
export const CAPABILITIES = [
  "dumbbell",
  "kettlebell",
  "barbell",
  "bench",
  "band",
  "pull-up bar",
  "cable",
  "machine",
  "cardio machine",
  "pool"
];

/** The levels, easiest first; an entry suits its own level and those above. */
export const LEVELS = ["beginner", "intermediate", "advanced"];

/** The areas an entry is tagged for: those the injuries answer names, and pregnancy. */
export const AREAS = [...INJURY_AREAS, "pregnancy"];

const BACK = ["lower back", "back"];
const WRIST_ELBOW = ["wrist", "elbow"];

/**
 * The same value for each of `areas`.
 * @template T
 * @param {string[]} areas
 * @param {T} value
 * @returns {Record<string, T>}
 */
const forAreas = (areas, value) => Object.fromEntries(areas.map((area) => [area, value]));

/**
 * @typedef {object} EntryOptions
 * @property {string[]} [avoid] the areas the entry is left out for
 * @property {Record<string, [string, string]>} [modify] area to [regression id, cue]
 * @property {boolean} [supine] whether it is done lying on the back
 * @property {"high" | "low"} [impact] for conditioning entries
 */

/**
 * @param {string} id
 * @param {string} name
 * @param {string} pattern
 * @param {string[]} needs
 * @param {string} level
 * @param {EntryOptions} [options]
 * @returns {Exercise}
 */
const entry = (id, name, pattern, needs, level, options = {}) => {
  const { avoid = [], modify = {}, supine = false, impact } = options;
  /** @type {Record<string, "modify" | "avoid">} */
  const flags = {};
  /** @type {Record<string, { id: string, cue: string }>} */
  const regressions = {};
  for (const [area, [regressionId, cue]] of Object.entries(modify)) {
    flags[area] = "modify";
    regressions[area] = { id: regressionId, cue };
  }
  for (const area of avoid) flags[area] = "avoid";
  return {
    id,
    name,
    pattern,
    needs,
    level,
    flags,
    regressions,
    supine,
    ...(impact ? { impact } : {})
  };
};

const BOX_CUE = "sit back to a box at a height that stays comfortable";
const SPLIT_CUE = "hold a wall and keep the range comfortable";
const NEUTRAL_CUE = "turn the palms to face each other";
const CHAIR_CUE = "sit on a chair instead";

// Each pattern's entries are in priority order: the first one that fits is the
// default choice, so the heavier and more specific options come first and the
// bodyweight ones last.
/** @type {Exercise[]} */
export const EXERCISES = [
  // ---- Squat ---------------------------------------------------------------
  entry("barbell-back-squat", "Barbell back squat", "squat", ["barbell"], "intermediate", {
    modify: {
      knee: ["barbell-box-squat", BOX_CUE],
      hip: ["barbell-box-squat", BOX_CUE],
      ...forAreas(BACK, ["barbell-box-squat", "use a lighter load and keep your trunk braced"])
    },
    avoid: ["shoulder", ...WRIST_ELBOW, "pregnancy"]
  }),
  entry("barbell-box-squat", "Barbell box squat", "squat", ["barbell"], "intermediate", {
    avoid: ["shoulder", ...WRIST_ELBOW, "pregnancy"]
  }),
  entry("dumbbell-goblet-squat", "Dumbbell goblet squat", "squat", ["dumbbell"], "beginner", {
    modify: { knee: ["dumbbell-box-squat", BOX_CUE], hip: ["dumbbell-box-squat", BOX_CUE] }
  }),
  entry("dumbbell-box-squat", "Dumbbell box squat", "squat", ["dumbbell"], "beginner"),
  entry("kettlebell-goblet-squat", "Kettlebell goblet squat", "squat", ["kettlebell"], "beginner", {
    modify: { knee: ["kettlebell-box-squat", BOX_CUE], hip: ["kettlebell-box-squat", BOX_CUE] }
  }),
  entry("kettlebell-box-squat", "Kettlebell box squat", "squat", ["kettlebell"], "beginner"),
  entry("leg-press", "Leg press", "squat", ["machine"], "beginner"),
  entry("banded-squat", "Banded squat", "squat", ["band"], "beginner", {
    modify: { knee: ["box-squat", BOX_CUE], hip: ["box-squat", BOX_CUE] }
  }),
  entry("dumbbell-sumo-squat", "Dumbbell sumo squat", "squat", ["dumbbell"], "beginner", {
    modify: { knee: ["dumbbell-box-squat", BOX_CUE] },
    avoid: ["hip"]
  }),
  entry("bodyweight-squat", "Bodyweight squat", "squat", [], "beginner", {
    modify: { knee: ["box-squat", BOX_CUE], hip: ["box-squat", BOX_CUE] }
  }),
  entry("box-squat", "Box squat to a chair", "squat", [], "beginner"),
  entry("wall-sit", "Wall sit", "squat", [], "beginner"),

  // ---- Hinge ---------------------------------------------------------------
  entry("barbell-deadlift", "Barbell deadlift", "hinge", ["barbell"], "intermediate", {
    avoid: [...BACK, "pregnancy"]
  }),
  entry(
    "barbell-romanian-deadlift",
    "Barbell Romanian deadlift",
    "hinge",
    ["barbell"],
    "intermediate",
    {
      modify: forAreas(BACK, [
        "barbell-glute-bridge",
        "keep the load moderate and drive through your heels"
      ]),
      avoid: ["pregnancy"]
    }
  ),
  entry("barbell-hip-thrust", "Barbell hip thrust", "hinge", ["barbell", "bench"], "intermediate", {
    avoid: ["pregnancy"]
  }),
  entry("barbell-glute-bridge", "Barbell glute bridge", "hinge", ["barbell"], "intermediate", {
    supine: true,
    avoid: ["pregnancy"]
  }),
  entry(
    "dumbbell-romanian-deadlift",
    "Dumbbell Romanian deadlift",
    "hinge",
    ["dumbbell"],
    "beginner",
    {
      modify: forAreas(BACK, [
        "dumbbell-romanian-deadlift-mid-shin",
        "lower only to mid-shin and keep the load at accessory weight"
      ])
    }
  ),
  entry(
    "dumbbell-romanian-deadlift-mid-shin",
    "Dumbbell Romanian deadlift to mid-shin",
    "hinge",
    ["dumbbell"],
    "beginner"
  ),
  entry("dumbbell-hip-thrust", "Dumbbell hip thrust", "hinge", ["dumbbell", "bench"], "beginner", {
    avoid: ["pregnancy"]
  }),
  entry("kettlebell-deadlift", "Kettlebell deadlift", "hinge", ["kettlebell"], "beginner", {
    modify: forAreas(BACK, [
      "kettlebell-block-deadlift",
      "pull from a raised block so the bottom of the lift stays short"
    ])
  }),
  entry(
    "kettlebell-block-deadlift",
    "Kettlebell deadlift from a raised block",
    "hinge",
    ["kettlebell"],
    "beginner"
  ),
  entry("kettlebell-swing", "Kettlebell swing", "hinge", ["kettlebell"], "intermediate", {
    modify: forAreas(BACK, [
      "kettlebell-block-deadlift",
      "swap the swing for a slow deadlift from a block"
    ]),
    avoid: ["pregnancy"]
  }),
  entry("cable-pull-through", "Cable pull-through", "hinge", ["cable"], "beginner"),
  entry("banded-hip-hinge", "Banded hip hinge", "hinge", ["band"], "beginner"),
  entry(
    "single-leg-romanian-deadlift",
    "Single-leg Romanian deadlift, hand on a wall",
    "hinge",
    [],
    "intermediate",
    {
      modify: {
        hip: ["standing-hip-hinge", "keep both feet down and hinge from the hips"],
        pregnancy: ["standing-hip-hinge", "keep both feet down and hinge from the hips"]
      }
    }
  ),
  entry("glute-bridge", "Glute bridge", "hinge", [], "beginner", {
    supine: true,
    avoid: ["pregnancy"]
  }),
  entry("standing-hip-hinge", "Standing hip hinge", "hinge", [], "beginner"),

  // ---- Horizontal push -----------------------------------------------------
  entry(
    "barbell-bench-press",
    "Barbell bench press",
    "horizontal-push",
    ["barbell", "bench"],
    "intermediate",
    {
      supine: true,
      modify: {
        shoulder: ["barbell-floor-press", "press from the floor so the elbows stop short"],
        ...forAreas(WRIST_ELBOW, [
          "barbell-floor-press",
          "press from the floor with the wrists stacked over the elbows"
        ])
      },
      avoid: ["pregnancy"]
    }
  ),
  entry(
    "barbell-floor-press",
    "Barbell floor press",
    "horizontal-push",
    ["barbell"],
    "intermediate",
    {
      supine: true,
      avoid: ["pregnancy"]
    }
  ),
  entry(
    "dumbbell-bench-press",
    "Dumbbell bench press",
    "horizontal-push",
    ["dumbbell", "bench"],
    "beginner",
    {
      supine: true,
      modify: {
        shoulder: ["dumbbell-floor-press", "press from the floor so the elbows stop short"],
        ...forAreas(WRIST_ELBOW, ["neutral-grip-dumbbell-bench-press", NEUTRAL_CUE])
      },
      avoid: ["pregnancy"]
    }
  ),
  entry(
    "neutral-grip-dumbbell-bench-press",
    "Neutral-grip dumbbell bench press",
    "horizontal-push",
    ["dumbbell", "bench"],
    "beginner",
    { supine: true, avoid: ["pregnancy"] }
  ),
  entry(
    "incline-dumbbell-press",
    "Incline dumbbell press",
    "horizontal-push",
    ["dumbbell", "bench"],
    "beginner",
    {
      modify: {
        shoulder: [
          "neutral-grip-dumbbell-bench-press",
          "turn the palms to face each other and keep the elbows in"
        ]
      }
    }
  ),
  entry(
    "dumbbell-floor-press",
    "Dumbbell floor press",
    "horizontal-push",
    ["dumbbell"],
    "beginner",
    {
      supine: true,
      avoid: ["pregnancy"]
    }
  ),
  entry("machine-chest-press", "Machine chest press", "horizontal-push", ["machine"], "beginner"),
  entry(
    "cable-chest-press",
    "Standing cable chest press",
    "horizontal-push",
    ["cable"],
    "beginner"
  ),
  entry("band-chest-press", "Band chest press", "horizontal-push", ["band"], "beginner"),
  entry("push-up", "Push-up", "horizontal-push", [], "beginner", {
    modify: {
      wrist: ["fist-push-up", "press up from your fists to keep the wrists straight"],
      ...forAreas(
        ["shoulder", "elbow", "pregnancy"],
        ["incline-push-up", "put your hands on a counter to lighten the load"]
      )
    }
  }),
  entry(
    "incline-push-up",
    "Incline push-up, hands on a counter",
    "horizontal-push",
    [],
    "beginner",
    {
      modify: {
        wrist: ["incline-fist-push-up", "press from your fists to keep the wrists straight"]
      }
    }
  ),
  entry("incline-fist-push-up", "Incline push-up on your fists", "horizontal-push", [], "beginner"),
  entry("fist-push-up", "Push-up on your fists", "horizontal-push", [], "beginner", {
    modify: forAreas(
      ["shoulder", "elbow", "pregnancy"],
      ["incline-fist-push-up", "put your fists on a counter to lighten the load"]
    )
  }),

  // ---- Vertical push -------------------------------------------------------
  entry(
    "barbell-overhead-press",
    "Barbell overhead press",
    "vertical-push",
    ["barbell"],
    "intermediate",
    {
      modify: {
        shoulder: ["landmine-press", "press along the angled bar instead of straight overhead"],
        ...forAreas(BACK, ["landmine-press", "half-kneel so the lower back stays neutral"]),
        ...forAreas(WRIST_ELBOW, [
          "landmine-press",
          "press along the angled bar with a neutral grip"
        ])
      },
      avoid: ["pregnancy"]
    }
  ),
  entry(
    "landmine-press",
    "Half-kneeling landmine press",
    "vertical-push",
    ["barbell"],
    "intermediate"
  ),
  entry(
    "seated-dumbbell-press",
    "Seated dumbbell shoulder press",
    "vertical-push",
    ["dumbbell", "bench"],
    "beginner",
    {
      modify: forAreas(
        ["shoulder", ...WRIST_ELBOW],
        ["seated-neutral-grip-dumbbell-press", NEUTRAL_CUE]
      )
    }
  ),
  entry(
    "seated-neutral-grip-dumbbell-press",
    "Seated neutral-grip dumbbell press",
    "vertical-push",
    ["dumbbell", "bench"],
    "beginner"
  ),
  entry(
    "standing-dumbbell-press",
    "Standing dumbbell shoulder press",
    "vertical-push",
    ["dumbbell"],
    "beginner",
    {
      modify: {
        ...forAreas(
          ["shoulder", ...WRIST_ELBOW],
          ["standing-neutral-grip-dumbbell-press", NEUTRAL_CUE]
        ),
        ...forAreas(BACK, [
          "half-kneeling-dumbbell-press",
          "half-kneel and press one arm at a time"
        ])
      }
    }
  ),
  entry(
    "standing-neutral-grip-dumbbell-press",
    "Standing neutral-grip dumbbell press",
    "vertical-push",
    ["dumbbell"],
    "beginner"
  ),
  entry(
    "half-kneeling-dumbbell-press",
    "Half-kneeling one-arm dumbbell press",
    "vertical-push",
    ["dumbbell"],
    "beginner",
    { modify: { knee: ["standing-neutral-grip-dumbbell-press", "stand instead of kneeling"] } }
  ),
  entry(
    "kettlebell-press",
    "Kettlebell overhead press",
    "vertical-push",
    ["kettlebell"],
    "intermediate",
    {
      modify: {
        shoulder: [
          "half-kneeling-kettlebell-press",
          "press one arm at a time from a half-kneel, keeping the range comfortable"
        ]
      }
    }
  ),
  entry(
    "half-kneeling-kettlebell-press",
    "Half-kneeling kettlebell press",
    "vertical-push",
    ["kettlebell"],
    "intermediate",
    { modify: { knee: ["kettlebell-press", "stand instead of kneeling"] } }
  ),
  entry(
    "machine-shoulder-press",
    "Machine shoulder press",
    "vertical-push",
    ["machine"],
    "beginner"
  ),
  entry("band-overhead-press", "Band overhead press", "vertical-push", ["band"], "beginner"),
  entry("pike-push-up", "Pike push-up", "vertical-push", [], "intermediate", {
    modify: { shoulder: ["wall-slide", "slide the forearms up a wall instead"] },
    avoid: [...WRIST_ELBOW, "pregnancy"]
  }),
  entry("chair-pike-push-up", "Pike push-up, hands on a chair", "vertical-push", [], "beginner", {
    modify: { shoulder: ["wall-slide", "slide the forearms up a wall instead"] },
    avoid: [...WRIST_ELBOW, "pregnancy"]
  }),
  entry("wall-slide", "Wall slide with a lift-off", "vertical-push", [], "beginner"),

  // ---- Horizontal pull -----------------------------------------------------
  entry("barbell-row", "Barbell bent-over row", "horizontal-pull", ["barbell"], "intermediate", {
    modify: forAreas(BACK, [
      "barbell-inverted-row",
      "lie under a racked bar and pull your chest to it instead of bending over"
    ]),
    avoid: ["pregnancy"]
  }),
  entry(
    "barbell-inverted-row",
    "Inverted row under a racked barbell",
    "horizontal-pull",
    ["barbell"],
    "intermediate",
    { avoid: ["pregnancy"] }
  ),
  entry(
    "chest-supported-dumbbell-row",
    "Chest-supported dumbbell row",
    "horizontal-pull",
    ["dumbbell", "bench"],
    "beginner",
    { avoid: ["pregnancy"] }
  ),
  entry(
    "bench-dumbbell-row",
    "One-arm dumbbell row, hand on a bench",
    "horizontal-pull",
    ["dumbbell", "bench"],
    "beginner"
  ),
  entry(
    "bent-over-dumbbell-row",
    "Bent-over dumbbell row",
    "horizontal-pull",
    ["dumbbell"],
    "beginner",
    {
      modify: forAreas(
        [...BACK, "pregnancy"],
        ["supported-dumbbell-row", "brace one hand on a chair"]
      )
    }
  ),
  entry(
    "supported-dumbbell-row",
    "One-arm dumbbell row, hand on a chair",
    "horizontal-pull",
    ["dumbbell"],
    "beginner"
  ),
  entry(
    "kettlebell-row",
    "One-arm kettlebell row, hand on a chair",
    "horizontal-pull",
    ["kettlebell"],
    "beginner"
  ),
  entry("seated-cable-row", "Seated cable row", "horizontal-pull", ["cable"], "beginner"),
  entry("machine-row", "Chest-supported machine row", "horizontal-pull", ["machine"], "beginner"),
  entry("band-row", "Band row", "horizontal-pull", ["band"], "beginner"),
  entry("door-frame-row", "Door-frame row", "horizontal-pull", [], "beginner"),

  // ---- Vertical pull -------------------------------------------------------
  entry("pull-up", "Pull-up", "vertical-pull", ["pull-up bar"], "intermediate", {
    modify: forAreas(
      ["shoulder", "elbow"],
      [
        "scapular-pull-up",
        "hang and squeeze the shoulder blades down instead of pulling all the way"
      ]
    )
  }),
  entry("chin-up", "Chin-up", "vertical-pull", ["pull-up bar"], "intermediate", {
    modify: forAreas(
      ["shoulder", "elbow"],
      [
        "scapular-pull-up",
        "hang and squeeze the shoulder blades down instead of pulling all the way"
      ]
    )
  }),
  entry(
    "slow-lowering-pull-up",
    "Slow-lowering pull-up",
    "vertical-pull",
    ["pull-up bar"],
    "beginner",
    {
      modify: forAreas(
        ["shoulder", "elbow"],
        [
          "scapular-pull-up",
          "hang and squeeze the shoulder blades down instead of lowering from the top"
        ]
      )
    }
  ),
  entry("scapular-pull-up", "Scapular pull-up", "vertical-pull", ["pull-up bar"], "beginner"),
  entry("lat-pulldown", "Lat pulldown", "vertical-pull", ["cable"], "beginner"),
  entry("band-lat-pulldown", "Band lat pulldown", "vertical-pull", ["band"], "beginner"),

  // ---- Single leg ----------------------------------------------------------
  entry(
    "dumbbell-reverse-lunge",
    "Dumbbell reverse lunge",
    "single-leg",
    ["dumbbell"],
    "beginner",
    {
      modify: forAreas(["knee", "hip", "pregnancy"], ["supported-split-squat", SPLIT_CUE])
    }
  ),
  entry("dumbbell-step-up", "Dumbbell step-up", "single-leg", ["dumbbell", "bench"], "beginner", {
    modify: forAreas(["knee", "hip"], ["low-step-up", "step onto a low stair instead"])
  }),
  entry(
    "bulgarian-split-squat",
    "Dumbbell Bulgarian split squat",
    "single-leg",
    ["dumbbell", "bench"],
    "intermediate",
    {
      modify: forAreas(["knee", "hip"], ["supported-split-squat", SPLIT_CUE]),
      avoid: ["pregnancy"]
    }
  ),
  entry(
    "kettlebell-reverse-lunge",
    "Kettlebell reverse lunge",
    "single-leg",
    ["kettlebell"],
    "beginner",
    {
      modify: forAreas(["knee", "hip", "pregnancy"], ["supported-split-squat", SPLIT_CUE])
    }
  ),
  entry("walking-lunge", "Walking lunge", "single-leg", [], "intermediate", {
    modify: forAreas(["knee", "hip"], ["supported-split-squat", SPLIT_CUE]),
    avoid: ["pregnancy"]
  }),
  entry("reverse-lunge", "Reverse lunge", "single-leg", [], "beginner", {
    modify: forAreas(["knee", "hip", "pregnancy"], ["supported-split-squat", SPLIT_CUE])
  }),
  entry("split-squat", "Split squat", "single-leg", [], "beginner", {
    modify: forAreas(["knee", "hip"], ["supported-split-squat", SPLIT_CUE])
  }),
  entry("lateral-lunge", "Lateral lunge", "single-leg", [], "intermediate", {
    modify: forAreas(["knee", "hip"], ["supported-split-squat", SPLIT_CUE]),
    avoid: ["pregnancy"]
  }),
  entry("pistol-squat", "Pistol squat", "single-leg", [], "advanced", {
    avoid: ["knee", "hip", "pregnancy"]
  }),
  entry(
    "supported-split-squat",
    "Supported split squat, one hand on a wall",
    "single-leg",
    [],
    "beginner"
  ),
  entry("low-step-up", "Low step-up onto a stair", "single-leg", [], "beginner"),

  // ---- Glutes and calves ---------------------------------------------------
  entry("dumbbell-calf-raise", "Dumbbell calf raise", "glutes-calves", ["dumbbell"], "beginner"),
  entry("machine-calf-raise", "Machine calf raise", "glutes-calves", ["machine"], "beginner"),
  entry("seated-hamstring-curl", "Seated hamstring curl", "glutes-calves", ["machine"], "beginner"),
  entry("cable-glute-kickback", "Cable glute kickback", "glutes-calves", ["cable"], "beginner"),
  entry("band-lateral-walk", "Band lateral walk", "glutes-calves", ["band"], "beginner"),
  entry("single-leg-glute-bridge", "Single-leg glute bridge", "glutes-calves", [], "intermediate", {
    supine: true,
    avoid: ["pregnancy"]
  }),
  entry("standing-calf-raise", "Standing calf raise", "glutes-calves", [], "beginner"),
  entry("side-lying-leg-raise", "Side-lying leg raise", "glutes-calves", [], "beginner"),
  entry("clamshell", "Clamshell", "glutes-calves", [], "beginner"),

  // ---- Core ----------------------------------------------------------------
  entry("hanging-knee-raise", "Hanging knee raise", "core", ["pull-up bar"], "intermediate", {
    modify: { shoulder: ["dead-bug", "do dead bugs on the floor instead"] },
    avoid: ["pregnancy"]
  }),
  entry("cable-pallof-press", "Cable Pallof press", "core", ["cable"], "beginner"),
  entry("band-pallof-press", "Band Pallof press", "core", ["band"], "beginner"),
  entry("dumbbell-suitcase-carry", "Dumbbell suitcase carry", "core", ["dumbbell"], "beginner"),
  entry(
    "kettlebell-suitcase-carry",
    "Kettlebell suitcase carry",
    "core",
    ["kettlebell"],
    "beginner"
  ),
  entry("dead-bug", "Dead bug", "core", [], "beginner", { supine: true, avoid: ["pregnancy"] }),
  entry("bird-dog", "Bird dog", "core", [], "beginner", {
    modify: { wrist: ["forearm-side-plank", "do side planks on the forearm instead"] }
  }),
  entry("forearm-plank", "Forearm plank", "core", [], "beginner", {
    modify: { pregnancy: ["bird-dog", "swap the plank for a bird dog"] }
  }),
  entry("side-plank", "Side plank", "core", [], "intermediate", {
    modify: forAreas(
      ["shoulder", "wrist"],
      ["forearm-side-plank", "drop to the forearm and the knees"]
    )
  }),
  entry("forearm-side-plank", "Forearm side plank from the knees", "core", [], "beginner"),

  // ---- Arms ----------------------------------------------------------------
  entry("dumbbell-biceps-curl", "Dumbbell biceps curl", "arms", ["dumbbell"], "beginner", {
    modify: forAreas(WRIST_ELBOW, ["dumbbell-hammer-curl", NEUTRAL_CUE])
  }),
  entry("dumbbell-hammer-curl", "Dumbbell hammer curl", "arms", ["dumbbell"], "beginner"),
  entry(
    "dumbbell-overhead-triceps-extension",
    "Dumbbell overhead triceps extension",
    "arms",
    ["dumbbell"],
    "beginner",
    {
      modify: forAreas(
        ["shoulder", "elbow"],
        ["dumbbell-triceps-kickback", "keep the upper arm by your side"]
      )
    }
  ),
  entry("dumbbell-triceps-kickback", "Dumbbell triceps kickback", "arms", ["dumbbell"], "beginner"),
  entry("barbell-curl", "Barbell curl", "arms", ["barbell"], "beginner", { avoid: WRIST_ELBOW }),
  entry(
    "barbell-skull-crusher",
    "Barbell skull crusher",
    "arms",
    ["barbell", "bench"],
    "intermediate",
    {
      supine: true,
      avoid: [...WRIST_ELBOW, "pregnancy"]
    }
  ),
  entry("cable-curl", "Cable curl", "arms", ["cable"], "beginner", {
    modify: forAreas(WRIST_ELBOW, [
      "cable-rope-hammer-curl",
      "use the rope with the palms facing each other"
    ])
  }),
  entry("cable-rope-hammer-curl", "Cable rope hammer curl", "arms", ["cable"], "beginner"),
  entry("cable-triceps-pushdown", "Cable triceps pushdown", "arms", ["cable"], "beginner", {
    modify: { elbow: ["cable-rope-pushdown", "use the rope and keep the load light"] }
  }),
  entry("cable-rope-pushdown", "Cable rope pushdown", "arms", ["cable"], "beginner"),
  entry("band-curl", "Band curl", "arms", ["band"], "beginner", {
    modify: forAreas(WRIST_ELBOW, ["band-hammer-curl", NEUTRAL_CUE])
  }),
  entry("band-hammer-curl", "Band hammer curl", "arms", ["band"], "beginner"),
  entry("band-triceps-pushdown", "Band triceps pushdown", "arms", ["band"], "beginner"),
  entry("kettlebell-hammer-curl", "Kettlebell hammer curl", "arms", ["kettlebell"], "beginner"),
  entry("bench-dip", "Bench dip", "arms", ["bench"], "intermediate", {
    avoid: ["shoulder", ...WRIST_ELBOW, "pregnancy"]
  }),

  // ---- Conditioning --------------------------------------------------------
  entry("stationary-bike", "Stationary bike", "conditioning", ["cardio machine"], "beginner", {
    impact: "low"
  }),
  entry("rowing-machine", "Rowing machine", "conditioning", ["cardio machine"], "beginner", {
    impact: "low",
    modify: forAreas(BACK, ["stationary-bike", "ride the bike instead"])
  }),
  entry("elliptical", "Elliptical", "conditioning", ["cardio machine"], "beginner", {
    impact: "low"
  }),
  entry(
    "treadmill-incline-walk",
    "Treadmill incline walk",
    "conditioning",
    ["cardio machine"],
    "beginner",
    { impact: "low" }
  ),
  entry("assault-bike", "Assault bike", "conditioning", ["cardio machine"], "intermediate", {
    impact: "low"
  }),
  entry("stair-climber", "Stair climber", "conditioning", ["cardio machine"], "beginner", {
    impact: "low",
    modify: { knee: ["stationary-bike", "ride the bike instead"] }
  }),
  entry("treadmill-run", "Treadmill run", "conditioning", ["cardio machine"], "beginner", {
    impact: "high",
    avoid: ["knee", "hip", "pregnancy"]
  }),
  entry("lap-swim", "Lap swim", "conditioning", ["pool"], "beginner", {
    impact: "low",
    modify: { shoulder: ["pool-walking", "walk laps in the shallow end instead"] }
  }),
  entry("pool-walking", "Pool walking", "conditioning", ["pool"], "beginner", { impact: "low" }),
  entry("shadow-boxing", "Shadow boxing", "conditioning", [], "beginner", { impact: "low" }),
  entry("stair-climbing", "Stair climbing", "conditioning", [], "beginner", {
    impact: "low",
    modify: { knee: ["march-in-place", "march in place instead"] }
  }),
  entry("mountain-climber", "Mountain climber", "conditioning", [], "intermediate", {
    impact: "low",
    modify: { wrist: ["march-in-place", "march in place instead"] },
    avoid: ["pregnancy"]
  }),
  entry("burpee", "Burpee", "conditioning", [], "intermediate", {
    impact: "high",
    avoid: ["knee", "hip", "wrist", "pregnancy"]
  }),
  entry("jumping-jacks", "Jumping jacks", "conditioning", [], "beginner", {
    impact: "high",
    avoid: ["knee", "hip", "pregnancy"]
  }),
  entry("squat-jump", "Squat jump", "conditioning", [], "intermediate", {
    impact: "high",
    avoid: ["knee", "hip", "pregnancy"]
  }),
  entry("brisk-walk", "Brisk walk", "conditioning", [], "beginner", { impact: "low" }),
  entry("march-in-place", "March in place with an arm drive", "conditioning", [], "beginner", {
    impact: "low"
  }),

  // ---- Mobility ------------------------------------------------------------
  entry("band-pass-through", "Band pass-through", "mobility", ["band"], "beginner", {
    modify: {
      shoulder: ["band-external-rotation", "keep the elbow by your side and rotate out"]
    }
  }),
  entry("band-external-rotation", "Band external rotation", "mobility", ["band"], "beginner"),
  entry("worlds-greatest-stretch", "World's greatest stretch", "mobility", [], "beginner", {
    modify: forAreas(
      ["knee", "hip", "wrist"],
      ["standing-hip-flexor-stretch", "stand tall and tuck the pelvis instead of lunging deep"]
    )
  }),
  entry(
    "half-kneeling-hip-flexor-stretch",
    "Half-kneeling hip flexor stretch",
    "mobility",
    [],
    "beginner",
    { modify: { knee: ["standing-hip-flexor-stretch", "stand instead of kneeling"] } }
  ),
  entry(
    "quadruped-thoracic-rotation",
    "Thoracic rotation on all fours",
    "mobility",
    [],
    "beginner",
    {
      modify: forAreas(["wrist", "knee"], ["seated-thoracic-rotation", CHAIR_CUE])
    }
  ),
  entry("cat-cow", "Cat-cow", "mobility", [], "beginner", {
    modify: forAreas(["wrist", "knee"], ["seated-cat-cow", CHAIR_CUE])
  }),
  entry("hip-90-90", "90/90 hip switches", "mobility", [], "beginner", {
    modify: forAreas(
      ["knee", "hip"],
      ["seated-figure-four", "sit on a chair and cross one ankle over the other knee"]
    )
  }),
  entry("pigeon-stretch", "Pigeon stretch", "mobility", [], "intermediate", {
    modify: forAreas(
      ["knee", "hip"],
      ["seated-figure-four", "sit on a chair and cross one ankle over the other knee"]
    )
  }),
  entry("deep-squat-hold", "Deep squat hold, holding a door frame", "mobility", [], "beginner", {
    modify: forAreas(
      ["knee", "hip"],
      ["ankle-rocks", "rock the knee over the toes instead of sitting deep"]
    )
  }),
  entry("childs-pose", "Child's pose", "mobility", [], "beginner", {
    modify: { knee: ["seated-forward-fold", "sit on a chair and fold forward"] }
  }),
  entry("doorway-chest-stretch", "Doorway chest stretch", "mobility", [], "beginner", {
    modify: { shoulder: ["shoulder-rolls", "roll the shoulders slowly instead"] }
  }),
  entry("hamstring-stretch", "Hamstring stretch, heel on a step", "mobility", [], "beginner"),
  entry("calf-stretch", "Calf stretch against a wall", "mobility", [], "beginner"),
  entry("ankle-rocks", "Ankle rocks", "mobility", [], "beginner"),
  entry("standing-hip-flexor-stretch", "Standing hip flexor stretch", "mobility", [], "beginner"),
  entry("seated-thoracic-rotation", "Seated thoracic rotation", "mobility", [], "beginner"),
  entry("seated-cat-cow", "Seated cat-cow", "mobility", [], "beginner"),
  entry("seated-figure-four", "Seated figure-four stretch", "mobility", [], "beginner"),
  entry("seated-forward-fold", "Seated forward fold", "mobility", [], "beginner"),
  entry("shoulder-rolls", "Slow shoulder rolls", "mobility", [], "beginner"),

  // ---- Balance -------------------------------------------------------------
  entry("single-leg-reach", "Single-leg stand with a reach", "balance", [], "intermediate", {
    modify: forAreas(
      ["knee", "hip", "pregnancy"],
      ["single-leg-stand", "keep a hand on the wall and skip the reach"]
    )
  }),
  entry("paused-step-up", "Paused low step-up, hold at the top", "balance", [], "beginner", {
    modify: { knee: ["single-leg-stand", "stand on one leg instead of stepping"] }
  }),
  entry("single-leg-stand", "Single-leg stand near a wall", "balance", [], "beginner"),
  entry("heel-to-toe-walk", "Heel-to-toe walk", "balance", [], "beginner")
];

// The capabilities each planner label supplies, by environment, keyed by the
// label lower-cased: the ones scripts/evals/scorePlan.mjs credits it with. A
// label not listed, the bodyweight and mat labels among them, supplies none.
/** @type {Record<string, string[]>} */
const HOME_LABELS = {
  dumbbells: ["dumbbell"],
  kettlebell: ["kettlebell"],
  "pull-up bar": ["pull-up bar"],
  "resistance bands": ["band"],
  "adjustable bench": ["bench"]
};

/** @type {Record<string, string[]>} */
const COMMERCIAL_LABELS = {
  "full gym access": CAPABILITIES,
  "strength floor": ["dumbbell", "kettlebell", "barbell", "bench", "pull-up bar", "machine"],
  "cardio deck": ["cardio machine"],
  "functional training zone": ["dumbbell", "kettlebell", "band", "pull-up bar", "cable"],
  "group class studio": ["dumbbell", "kettlebell", "band"],
  "pool / aquatic center": ["pool"],
  "recovery & mobility zone": ["band"]
};

/**
 * The capabilities the selected labels supply, once each and in CAPABILITIES
 * order. "Commercial", ignoring case and spaces, reads the commercial labels,
 * and any other environment the home ones; a label matches ignoring case and
 * spaces, and anything not a string supplies nothing.
 * @param {{ environment?: unknown, equipment?: unknown }} selection
 * @returns {string[]}
 */
export const capabilitiesFor = ({ environment, equipment }) => {
  const isCommercial =
    typeof environment === "string" && environment.trim().toLowerCase() === "commercial";
  const labels = isCommercial ? COMMERCIAL_LABELS : HOME_LABELS;
  const selected = Array.isArray(equipment) ? equipment : [];
  const supplied = new Set(
    selected.flatMap((label) =>
      typeof label === "string" ? (labels[label.trim().toLowerCase()] ?? []) : []
    )
  );
  return CAPABILITIES.filter((capability) => supplied.has(capability));
};
