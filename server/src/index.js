import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/generate", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY." });
    }

    const {
      goal = "Build strength and energy",
      equipment = "Bodyweight",
      duration = "45",
      level = "Intermediate",
      injuries = "None",
      days = "3"
    } = req.body || {};

    const model = process.env.OPENAI_MODEL || "gpt-5";

    const prompt = `You are an expert fitness coach. Create a ${days}-day workout plan.\n\nClient info:\n- Goal: ${goal}\n- Equipment: ${equipment}\n- Session length: ${duration} minutes\n- Experience: ${level}\n- Injuries/limitations: ${injuries}\n\nInstructions:\n- Provide a day-by-day plan with warmup, main lifts, accessories, and finisher/conditioning.\n- Include sets x reps and rest guidance.\n- Keep it concise and practical for a home or gym setting.\n- If injuries are mentioned, adapt and avoid risky movements.\n- Output in clean plain text with clear day headings.`;

    const response = await client.responses.create({
      model,
      input: prompt,
      temperature: 0.7
    });

    const plan =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    if (!plan) {
      return res.status(502).json({ error: "No plan generated." });
    }

    res.json({ plan });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Server error." });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});