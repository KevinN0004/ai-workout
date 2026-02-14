import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const usersFile = path.join(process.cwd(), "data", "users.json");
const sessions = new Map();
const pbkdf2Async = promisify(crypto.pbkdf2);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const cookieSecure = process.env.NODE_ENV === "production" ? "; Secure" : "";
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
const defaultGoals = () => ({
  targetWeight: 160,
  targetCalories: 2200,
  weeklyWorkouts: 3
});
const defaultDashboard = () => ({
  workouts: [],
  calories: [],
  plans: [],
  goals: defaultGoals()
});
const buildDashboard = (input = {}) => {
  const base = defaultDashboard();
  const goals = input.goals || {};
  return {
    ...base,
    workouts: Array.isArray(input.workouts) ? input.workouts : [],
    calories: Array.isArray(input.calories) ? input.calories : [],
    plans: Array.isArray(input.plans) ? input.plans : [],
    goals: {
      ...base.goals,
      targetWeight:
        toNullableNumber(goals.targetWeight, 80, 400) ?? base.goals.targetWeight,
      targetCalories:
        toNullableNumber(goals.targetCalories, 1200, 4500) ??
        base.goals.targetCalories,
      weeklyWorkouts:
        toNullableNumber(goals.weeklyWorkouts, 1, 7) ?? base.goals.weeklyWorkouts
    }
  };
};

const cleanText = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const toNullableNumber = (value, min, max) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
};

const toCleanArray = (value, maxItems = 8, maxLen = 60) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

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

let usersCache = null;
let usersCacheMtimeMs = 0;

const readUsers = async () => {
  try {
    const stat = await fs.stat(usersFile);
    if (usersCache && usersCacheMtimeMs === stat.mtimeMs) {
      return usersCache;
    }
    const raw = await fs.readFile(usersFile, "utf-8");
    const parsed = JSON.parse(raw || "[]");
    usersCache = Array.isArray(parsed) ? parsed : [];
    usersCacheMtimeMs = stat.mtimeMs;
    return usersCache;
  } catch (err) {
    if (err.code === "ENOENT") {
      usersCache = [];
      usersCacheMtimeMs = 0;
      return [];
    }
    throw err;
  }
};

const writeUsers = async (users) => {
  const dir = path.dirname(usersFile);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${usersFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(users, null, 2), "utf-8");
  await fs.rename(tmp, usersFile);
  usersCache = users;
  try {
    const stat = await fs.stat(usersFile);
    usersCacheMtimeMs = stat.mtimeMs;
  } catch {
    usersCacheMtimeMs = Date.now();
  }
};

const hashPassword = async (password, salt = crypto.randomBytes(16).toString("hex")) => {
  const hash = await pbkdf2Async(password, salt, 120000, 64, "sha512");
  return { salt, hash: hash.toString("hex") };
};

const verifyPassword = async (password, user) => {
  if (!user?.salt || !user?.hash) return false;
  const hash = await pbkdf2Async(password, user.salt, 120000, 64, "sha512");
  const storedHash = Buffer.from(user.hash, "hex");
  if (storedHash.length !== hash.length) return false;
  return crypto.timingSafeEqual(storedHash, hash);
};

const parseCookies = (cookieHeader = "") =>
  cookieHeader.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return acc;
    const rawValue = rest.join("=");
    try {
      acc[key] = decodeURIComponent(rawValue);
    } catch {
      acc[key] = rawValue;
    }
    return acc;
  }, {});

const pruneExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
    }
  }
};

const setSessionCookie = (res, token) => {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${cookieSecure}`
  );
};

const clearSessionCookie = (res) => {
  res.setHeader(
    "Set-Cookie",
    `sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieSecure}`
  );
};

const createSession = (userId) => {
  pruneExpiredSessions();
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { userId, createdAt: Date.now() });
  return token;
};

const getSessionUser = async (req) => {
  pruneExpiredSessions();
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.sid;
  if (!token || !sessions.has(token)) return null;
  const session = sessions.get(token);
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
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
  res.json({
    user: {
      id: user.id,
      email: user.email,
      profile: user.profile || defaultProfile()
    }
  });
});

app.get("/api/profile", requireAuth, (req, res) => {
  res.json({ profile: req.user.profile || defaultProfile() });
});

app.post("/api/profile", requireAuth, async (req, res) => {
  try {
    const profileInput = req.body || {};
    const updated = await updateUser(req.user.id, (user) => ({
      ...user,
      profile: buildProfile({
        ...(user.profile || defaultProfile()),
        ...profileInput
      })
    }));
    if (!updated) return res.status(404).json({ error: "User not found." });
    res.json({ profile: updated.profile || defaultProfile() });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { email, password, profile } = req.body || {};
    const normalizedEmail = cleanText(email, 254).toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    const users = await readUsers();
    const exists = users.find((user) => user.email === normalizedEmail);
    if (exists) {
      return res.status(409).json({ error: "Account already exists." });
    }
    const { salt, hash } = await hashPassword(password);
    const newUser = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      salt,
      hash,
      createdAt: new Date().toISOString(),
      profile: buildProfile(profile),
      dashboard: defaultDashboard()
    };
    users.push(newUser);
    await writeUsers(users);
    const token = createSession(newUser.id);
    setSessionCookie(res, token);
    res.json({
      user: {
        id: newUser.id,
        email: newUser.email,
        profile: newUser.profile || defaultProfile()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = cleanText(email, 254).toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password required." });
    }
    const users = await readUsers();
    const user = users.find((u) => u.email === normalizedEmail);
    if (!user || !(await verifyPassword(password, user))) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const token = createSession(user.id);
    setSessionCookie(res, token);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile || defaultProfile()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.sid;
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const user = req.user;
  if (!user.dashboard) {
    return res.json({ dashboard: defaultDashboard() });
  }
  res.json({ dashboard: buildDashboard(user.dashboard) });
});

app.post("/api/dashboard/workouts", requireAuth, async (req, res) => {
  const { date, focus, duration, notes } = req.body || {};
  const parsedDuration = toNullableNumber(duration, 5, 360);
  if (!cleanText(date, 20) || parsedDuration === null) {
    return res.status(400).json({ error: "Date and duration are required." });
  }
  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    const workout = {
      id: crypto.randomUUID(),
      date: cleanText(date, 20),
      focus: cleanText(focus, 80) || "General",
      duration: parsedDuration,
      notes: cleanText(notes, 500)
    };
    return {
      ...user,
      dashboard: {
        ...dashboard,
        workouts: [workout, ...dashboard.workouts]
      }
    };
  });
  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({ dashboard: updated.dashboard });
});

app.post("/api/dashboard/calories", requireAuth, async (req, res) => {
  const { date, calories } = req.body || {};
  const parsedCalories = toNullableNumber(calories, 800, 10000);
  if (!cleanText(date, 20) || parsedCalories === null) {
    return res.status(400).json({ error: "Date and calories are required." });
  }
  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    const entry = {
      id: crypto.randomUUID(),
      date: cleanText(date, 20),
      calories: parsedCalories
    };
    return {
      ...user,
      dashboard: {
        ...dashboard,
        calories: [entry, ...dashboard.calories]
      }
    };
  });
  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({ dashboard: updated.dashboard });
});

app.post("/api/dashboard/goals", requireAuth, async (req, res) => {
  const { targetWeight, targetCalories, weeklyWorkouts } = req.body || {};
  const parsedTargetWeight = toNullableNumber(targetWeight, 80, 400);
  const parsedTargetCalories = toNullableNumber(targetCalories, 1200, 4500);
  const parsedWeeklyWorkouts = toNullableNumber(weeklyWorkouts, 1, 7);
  const updated = await updateUser(req.user.id, (user) => {
    const dashboard = buildDashboard(user.dashboard);
    return {
      ...user,
      dashboard: {
        ...dashboard,
        goals: {
          targetWeight: parsedTargetWeight ?? dashboard.goals.targetWeight,
          targetCalories: parsedTargetCalories ?? dashboard.goals.targetCalories,
          weeklyWorkouts: parsedWeeklyWorkouts ?? dashboard.goals.weeklyWorkouts
        }
      }
    };
  });
  if (!updated) return res.status(404).json({ error: "User not found." });
  res.json({ dashboard: updated.dashboard });
});

app.post("/api/generate", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY." });
    }

    const body = req.body || {};
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

      const updated = await updateUser(sessionUser.id, (user) => {
        const dashboard = buildDashboard(user.dashboard);
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
