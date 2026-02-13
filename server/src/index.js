import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const usersFile = path.join(process.cwd(), "data", "users.json");
const sessions = new Map();
const defaultProfile = () => ({
  name: "",
  age: null,
  heightCm: null,
  weightKg: null,
  sex: "",
  bodyFat: null,
  activity: "Moderate",
  notes: "",
  updatedAt: new Date().toISOString()
});
const allowedSexes = new Set(["Female", "Male", "Non-binary", "Prefer not to say"]);
const allowedActivities = new Set(["Light", "Moderate", "High", "Very high"]);

const cleanText = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const toNullableNumber = (value, min, max) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
};

const buildProfile = (input = {}) => {
  const base = defaultProfile();
  return {
    ...base,
    name: cleanText(input.name, 80),
    age: toNullableNumber(input.age, 10, 120),
    heightCm: toNullableNumber(input.heightCm, 100, 260),
    weightKg: toNullableNumber(input.weightKg, 25, 400),
    sex: allowedSexes.has(input.sex) ? input.sex : "",
    bodyFat: toNullableNumber(input.bodyFat, 3, 70),
    activity: allowedActivities.has(input.activity) ? input.activity : base.activity,
    notes: cleanText(input.notes, 500),
    updatedAt: new Date().toISOString()
  };
};

const readUsers = async () => {
  try {
    const raw = await fs.readFile(usersFile, "utf-8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
};

const writeUsers = async (users) => {
  const dir = path.dirname(usersFile);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${usersFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), "utf-8");
  await fs.rename(tmp, usersFile);
};

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512");
  return { salt, hash: hash.toString("hex") };
};

const verifyPassword = (password, user) => {
  const hash = crypto.pbkdf2Sync(password, user.salt, 120000, 64, "sha512");
  return crypto.timingSafeEqual(Buffer.from(user.hash, "hex"), hash);
};

const parseCookies = (cookieHeader = "") =>
  cookieHeader.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});

const createSession = (userId) => {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
};

const getSessionUser = async (req) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.sid;
  if (!token || !sessions.has(token)) return null;
  const session = sessions.get(token);
  const users = await readUsers();
  return users.find((user) => user.id === session.userId) || null;
};

const requireAuth = async (req, res, next) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in." });
  req.user = user;
  next();
};

const updateUser = async (userId, updater) => {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  const next = updater(users[idx]);
  users[idx] = next;
  await writeUsers(users);
  return next;
};

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in." });
  res.json({ user: { id: user.id, email: user.email } });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, profile } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required." });
    }
    const users = await readUsers();
    const exists = users.find((user) => user.email === email.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: "Account already exists." });
    }
    const { salt, hash } = hashPassword(password);
    const newUser = {
      id: crypto.randomUUID(),
      email: email.toLowerCase(),
      salt,
      hash,
      createdAt: new Date().toISOString(),
      profile: buildProfile(profile),
      dashboard: {
        workouts: [],
        calories: [],
        plans: [],
        goals: {
          targetWeight: 160,
          targetCalories: 2200,
          weeklyWorkouts: 3
        }
      }
    };
    users.push(newUser);
    await writeUsers(users);
    const token = createSession(newUser.id);
    res.setHeader(
      "Set-Cookie",
      `sid=${token}; HttpOnly; Path=/; SameSite=Lax`
    );
    res.json({ user: { id: newUser.id, email: newUser.email } });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required." });
    }
    const users = await readUsers();
    const user = users.find((u) => u.email === email.toLowerCase());
    if (!user || !verifyPassword(password, user)) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const token = createSession(user.id);
    res.setHeader(
      "Set-Cookie",
      `sid=${token}; HttpOnly; Path=/; SameSite=Lax`
    );
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.sid;
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ ok: true });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user.dashboard) {
    return res.json({
      dashboard: {
        workouts: [],
        calories: [],
        plans: [],
        goals: {
          targetWeight: 160,
          targetCalories: 2200,
          weeklyWorkouts: 3
        }
      }
    });
  }
  res.json({ dashboard: user.dashboard });
});

app.post("/api/dashboard/workouts", requireAuth, async (req, res) => {
  const { date, focus, duration, notes } = req.body || {};
  if (!date || !duration) {
    return res.status(400).json({ error: "Date and duration are required." });
  }
  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = user.dashboard || {
      workouts: [],
      calories: [],
      plans: [],
      goals: {
        targetWeight: 160,
        targetCalories: 2200,
        weeklyWorkouts: 3
      }
    };
    const workout = {
      id: crypto.randomUUID(),
      date,
      focus: focus || "General",
      duration: Number(duration),
      notes: notes || ""
    };
    return {
      ...user,
      dashboard: {
        ...dashboard,
        workouts: [workout, ...dashboard.workouts]
      }
    };
  });
  res.json({ dashboard: updated.dashboard });
});

app.post("/api/dashboard/calories", requireAuth, async (req, res) => {
  const { date, calories } = req.body || {};
  if (!date || !calories) {
    return res.status(400).json({ error: "Date and calories are required." });
  }
  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = user.dashboard || {
      workouts: [],
      calories: [],
      plans: [],
      goals: {
        targetWeight: 160,
        targetCalories: 2200,
        weeklyWorkouts: 3
      }
    };
    const entry = {
      id: crypto.randomUUID(),
      date,
      calories: Number(calories)
    };
    return {
      ...user,
      dashboard: {
        ...dashboard,
        calories: [entry, ...dashboard.calories]
      }
    };
  });
  res.json({ dashboard: updated.dashboard });
});

app.post("/api/dashboard/goals", requireAuth, async (req, res) => {
  const { targetWeight, targetCalories, weeklyWorkouts } = req.body || {};
  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = user.dashboard || {
      workouts: [],
      calories: [],
      plans: [],
      goals: {
        targetWeight: 160,
        targetCalories: 2200,
        weeklyWorkouts: 3
      }
    };
    return {
      ...user,
      dashboard: {
        ...dashboard,
        goals: {
          targetWeight: Number(targetWeight) || dashboard.goals.targetWeight,
          targetCalories:
            Number(targetCalories) || dashboard.goals.targetCalories,
          weeklyWorkouts:
            Number(weeklyWorkouts) || dashboard.goals.weeklyWorkouts
        }
      }
    };
  });
  res.json({ dashboard: updated.dashboard });
});

app.post("/api/generate", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
    }

    const {
      goal = "Build strength and energy",
      equipment = "Bodyweight",
      duration = "45",
      level = "Intermediate",
      injuries = "None",
      days = "3",
      environment = "Home",
      focuses = []
    } = req.body || {};

    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const equipmentLine = Array.isArray(equipment)
      ? equipment.join(", ")
      : equipment;
    const focusLine = Array.isArray(focuses) ? focuses.join(", ") : focuses;

    const prompt = `You are an expert fitness coach. Create a weekly workout plan.\n\nClient info:\n- Goal: ${goal}\n- Equipment: ${equipment}\n- Session length: ${duration} minutes\n- Experience: ${level}\n- Injuries/limitations: ${injuries}\n\nInstructions:\n- Use weekday headings exactly as: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.\n- For each day include: Warmup, Main lifts, Accessories, and Finisher/conditioning with sets x reps and rest guidance.\n- Keep it concise and practical for a home or gym setting.\n- If injuries are mentioned, adapt and avoid risky movements.\n- End with a section labeled \"Coach Notes:\" containing tips and recovery guidance.\n- Output in clean plain text with clear headings.`;
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
        equipment: Array.isArray(equipment) ? equipment : [equipment].filter(Boolean),
        duration: Number(duration),
        level,
        injuries,
        days: Number(days),
        environment,
        focuses: Array.isArray(focuses) ? focuses : [],
        plan
      };

      const updated = await updateUser(sessionUser.id, (user) => {
        const dashboard = user.dashboard || {
          workouts: [],
          calories: [],
          plans: [],
          goals: {
            targetWeight: 160,
            targetCalories: 2200,
            weeklyWorkouts: 3
          }
        };
        return {
          ...user,
          dashboard: {
            ...dashboard,
            plans: [planEntry, ...(dashboard.plans || [])]
          }
        };
      });
      savedPlan = updated?.dashboard?.plans?.[0] || planEntry;
    }

    res.json({ plan, savedPlan });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
