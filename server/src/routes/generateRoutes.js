/**
 * POST /api/generate: asks Gemini for a weekly workout plan built from the
 * planner form, and saves it for a signed-in caller. Registered by
 * registerApiRoutes.
 */
import crypto from "crypto";
import { sendErrorResponse } from "../services/http/errorResponseService.js";

// Keys here and in COMMERCIAL_ACCESS_CAPABILITY_MAP are the planner's equipment
// labels (equipmentOptionsByEnv in client/src/app/constants.js), lower-cased;
// values are the capabilities the prompt tells the model each one provides.
const HOME_ACCESS_CAPABILITY_MAP = {
  "bodyweight only": ["bodyweight training", "mobility work", "floor/core work"],
  dumbbells: ["dumbbells", "unilateral strength work", "hypertrophy accessories"],
  kettlebell: ["kettlebells", "hinge patterns", "conditioning circuits"],
  "pull-up bar": ["pull-up bar", "vertical pulling", "hanging core work"],
  "resistance bands": ["resistance bands", "band-resisted work", "joint-friendly accessories"],
  "adjustable bench": ["adjustable bench", "incline/flat pressing", "supported rows"],
  "yoga mat": ["yoga mat", "mobility flows", "recovery sessions"]
};

const COMMERCIAL_FULL_ACCESS_LABEL = "full gym access";

const COMMERCIAL_ACCESS_CAPABILITY_MAP = {
  [COMMERCIAL_FULL_ACCESS_LABEL]: [
    "barbells and racks",
    "dumbbells and kettlebells",
    "selectorized/cable machines",
    "cardio machines",
    "functional training tools",
    "group class programming",
    "pool-based conditioning",
    "court conditioning drills",
    "mobility and recovery tools"
  ],
  "strength floor": [
    "barbells and racks",
    "dumbbells and kettlebells",
    "bench variations",
    "plate-loaded machines"
  ],
  "cardio deck": [
    "treadmills",
    "ellipticals",
    "stationary bikes",
    "rowing machines",
    "interval cardio formats"
  ],
  "functional training zone": [
    "kettlebells",
    "dumbbells",
    "bodyweight stations",
    "cables and bands",
    "conditioning circuits"
  ],
  "group class studio": [
    "group class formats",
    "bodyweight intervals",
    "light equipment circuits",
    "mobility classes"
  ],
  "pool / aquatic center": ["lap swimming", "aquatic conditioning", "low-impact cardio"],
  "court sports area": ["agility drills", "conditioning runs", "plyometric patterns"],
  "recovery & mobility zone": [
    "mobility circuits",
    "stretching work",
    "low-intensity recovery blocks"
  ],
  // Backward compatibility for older commercial labels.
  "barbell + plates": ["barbells and racks", "loaded compound lifts"],
  "cable machine": ["selectorized/cable machines", "isolation accessories"],
  "smith machine": ["smith machine variations", "guided barbell patterns"],
  "cardio machines": [
    "treadmills",
    "ellipticals",
    "stationary bikes",
    "rowing machines",
    "interval cardio formats"
  ],
  "free weights": ["dumbbells and kettlebells", "free-weight accessory work"]
};

const uniqueList = (items) => [...new Set(items.filter(Boolean))];
const normalizeText = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/**
 * Turns the chosen environment and equipment labels into the three equipment
 * lines of the Gemini prompt: what the user listed, the capabilities that
 * implies, and how to program around it. Labels match case-insensitively, and
 * one missing from the capability maps adds no capabilities.
 */
export const buildGenerationEquipmentContext = ({ environment, equipment }) => {
  const environmentKey = normalizeText(environment);
  const selectedLabels = Array.isArray(equipment) ? equipment : [];
  const selectedKeys = uniqueList(selectedLabels.map(normalizeText));

  // A commercial gym: each label names an area, and "full gym access" stands for
  // all of them.
  if (environmentKey === "commercial") {
    const hasFullGymAccess = selectedKeys.includes(COMMERCIAL_FULL_ACCESS_LABEL);
    const effectiveKeys = hasFullGymAccess
      ? uniqueList([
          ...selectedKeys,
          ...Object.keys(COMMERCIAL_ACCESS_CAPABILITY_MAP).filter(
            (key) => key !== COMMERCIAL_FULL_ACCESS_LABEL
          )
        ])
      : selectedKeys;

    const capabilityHints = uniqueList(
      effectiveKeys.flatMap((key) => COMMERCIAL_ACCESS_CAPABILITY_MAP[key] || [])
    );

    return {
      profileLine:
        selectedLabels.join(", ") ||
        "Commercial facility access unspecified (assume standard gym spaces).",
      capabilityLine: capabilityHints.join(", ") || "standard strength and cardio gym capabilities",
      planningGuidance: hasFullGymAccess
        ? "Full gym access is available. Program across all gym rooms and operations."
        : "Program only with the listed commercial rooms and operations."
    };
  }

  // Any other environment is a home setup, and no equipment means bodyweight only.
  const homeHints = uniqueList(
    selectedKeys.flatMap((key) => HOME_ACCESS_CAPABILITY_MAP[key] || [])
  );

  return {
    profileLine: selectedLabels.join(", ") || "Bodyweight only",
    capabilityLine:
      homeHints.join(", ") ||
      "bodyweight training, mobility work, and minimal-equipment progressions",
    planningGuidance:
      "Program for the listed home setup. Offer bodyweight-friendly substitutions when useful."
  };
};

/**
 * Registers POST /api/generate.
 *
 * @param deps `gemini` is the Gemini client, or null when GEMINI_API_KEY is
 *   unset; `saveGeneratedPlan` stores the plan for a caller that
 *   attachOptionalUser (mounted in index.js) has put on `req.user`.
 */
export const registerGenerateRoutes = (app, deps) => {
  const {
    gemini,
    validateBody,
    generatePlanBodySchema,
    cleanText,
    toCleanArray,
    toNullableNumber,
    saveGeneratedPlan
  } = deps;

  // Open to anonymous callers by design; the anonymous quota is enforced by the
  // rate limiters mounted on this path in index.js. `req.user` is populated by
  // attachOptionalUser, so a signed-in caller still gets their plan persisted.
  app.post("/api/generate", async (req, res) => {
    try {
      // `gemini` is null when no key was configured at boot; see index.js.
      if (!process.env.GEMINI_API_KEY || !gemini) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
      }

      // Validate, then default every field the prompt uses.
      const body = validateBody(req, res, generatePlanBodySchema);
      if (!body) return;

      const goal = cleanText(body.goal, 120) || "Build strength and energy";
      const equipment = toCleanArray(body.equipment, 10, 80);
      const duration = toNullableNumber(body.duration, 15, 180) ?? 45;
      const level = cleanText(body.level, 40) || "Intermediate";
      const injuries = cleanText(body.injuries, 140) || "None";
      const days = toNullableNumber(body.days, 1, 7) ?? 3;
      const environment = cleanText(body.environment, 40) || "Home";
      const focuses = toCleanArray(body.focuses, 8, 60);

      // Build the prompt. The weekday headings and "Coach Notes:" it asks for are
      // what client/src/app/plans.js parses, so that wording is a contract.
      const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
      const focusLine = focuses.join(", ") || "General fitness";
      const equipmentContext = buildGenerationEquipmentContext({
        environment,
        equipment
      });

      const prompt = `You are an expert fitness coach. Create a weekly workout plan.\n\nClient info:\n- Goal: ${goal}\n- Equipment/space profile: ${equipmentContext.profileLine}\n- Session length: ${duration} minutes\n- Experience: ${level}\n- Injuries/limitations: ${injuries}\n\nInstructions:\n- Use weekday headings exactly as: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.\n- For each day include: Warmup, Main lifts, Accessories, and Finisher/conditioning with sets x reps and rest guidance.\n- Keep it concise and practical for a home or gym setting.\n- If injuries are mentioned, adapt and avoid risky movements.\n- End with a section labeled "Coach Notes:" containing tips and recovery guidance.\n- Output in clean plain text with clear headings.`;
      const promptWithContext = `${prompt}\n\nEnvironment: ${environment}\nFocuses: ${focusLine}\nTraining days target: ${days}\nAvailable capabilities: ${equipmentContext.capabilityLine}\nPlanning guidance: ${equipmentContext.planningGuidance}`;

      // Generate. An empty answer is a 502.
      const result = await gemini.models.generateContent({
        model: modelName,
        contents: promptWithContext
      });
      const plan = result?.text || "";

      if (!plan) {
        return res.status(502).json({ error: "No plan generated." });
      }

      // Save the plan for a signed-in caller; an anonymous one gets the text only.
      const sessionUser = req.user;
      let savedPlan = null;

      if (sessionUser) {
        const planEntry = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          goal,
          equipment,
          duration,
          level,
          injuries,
          days,
          environment,
          focuses,
          plan
        };

        // Always an insert: the dashboard orders plans newest first and keeps
        // 200 when it reads them. The entry built here is returned instead when
        // the user cannot be resolved.
        savedPlan =
          (await saveGeneratedPlan({ userId: sessionUser.id, entry: planEntry })) || planEntry;
      }

      res.json({ plan, savedPlan });
    } catch (err) {
      sendErrorResponse(req, res, err, 500);
    }
  });
};
