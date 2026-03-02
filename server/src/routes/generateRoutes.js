import crypto from "crypto";

export const registerGenerateRoutes = (app, deps) => {
  const {
    gemini,
    validateBody,
    generatePlanBodySchema,
    cleanText,
    toCleanArray,
    toNullableNumber,
    getSessionUser,
    User,
    mapMongoDocToUser
  } = deps;

  app.post("/api/generate", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
      }

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

      const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
      const equipmentLine = equipment.join(", ") || "Bodyweight";
      const focusLine = focuses.join(", ") || "General fitness";

      const prompt = `You are an expert fitness coach. Create a weekly workout plan.\n\nClient info:\n- Goal: ${goal}\n- Equipment: ${equipmentLine}\n- Session length: ${duration} minutes\n- Experience: ${level}\n- Injuries/limitations: ${injuries}\n\nInstructions:\n- Use weekday headings exactly as: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.\n- For each day include: Warmup, Main lifts, Accessories, and Finisher/conditioning with sets x reps and rest guidance.\n- Keep it concise and practical for a home or gym setting.\n- If injuries are mentioned, adapt and avoid risky movements.\n- End with a section labeled \"Coach Notes:\" containing tips and recovery guidance.\n- Output in clean plain text with clear headings.`;
      const promptWithContext = `${prompt}\n\nEnvironment: ${environment}\nFocuses: ${focusLine}\nEquipment list: ${equipmentLine}`;

      const model = gemini.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(promptWithContext);
      const plan = result?.response?.text?.() || "";

      if (!plan) {
        return res.status(502).json({ error: "No plan generated." });
      }

      const sessionUser = await getSessionUser(req);
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

        const updatedDoc = await User.findOneAndUpdate(
          { userId: sessionUser.id },
          {
            $push: {
              "dashboard.plans": {
                $each: [planEntry],
                $position: 0,
                $slice: 200
              }
            }
          },
          { new: true }
        );
        const updated = mapMongoDocToUser(updatedDoc);
        savedPlan = updated?.dashboard?.plans?.[0] || planEntry;
      }

      res.json({ plan, savedPlan });
    } catch (err) {
      res.status(500).json({ error: err?.message || "Server error." });
    }
  });
};

