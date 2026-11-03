/**
 * POST /api/generate: asks Gemini for a weekly workout plan built from the
 * planner form, parses it into days and notes, and saves both for a signed-in
 * caller. Registered by registerApiRoutes.
 */
import crypto from "crypto";
import { sendErrorResponse } from "../services/http/errorResponseService.js";
import { collapseWhitespace } from "../services/dashboard/dashboardDataBuildersService.js";
import { buildPlanPayload } from "../services/dashboard/planPayloadService.js";
import {
  DEFAULT_GEMINI_MODEL,
  SYSTEM_INSTRUCTION,
  buildPlanPrompt
} from "../services/dashboard/planPromptService.js";

// Defaults for the generation guardrails, used when GEMINI_MAX_OUTPUT_TOKENS
// (tokens), GEMINI_TIMEOUT_MS (milliseconds) or GEMINI_MAX_PLAN_CHARS
// (characters) is unset or not a positive integer. README's environment table
// and env.example document the same defaults.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_TIMEOUT_MS = 30000;

/** The longest plan served, in characters, when GEMINI_MAX_PLAN_CHARS is unset. */
export const DEFAULT_MAX_PLAN_CHARS = 20000;

// Thrown only by the route's own deadline, so the handler can tell a timeout
// (504) from a failure of the Gemini call itself (500).
class GenerationTimeoutError extends Error {}

/**
 * Registers POST /api/generate.
 *
 * @param deps `gemini` is the Gemini client, or null when GEMINI_API_KEY is
 *   unset. `toPositiveInt` is index.js's reader for a positive integer
 *   setting, which the three GEMINI_* limits go through.
 */
export const registerGenerateRoutes = (app, deps) => {
  const {
    gemini,
    validateBody,
    generatePlanBodySchema,
    cleanText,
    toCleanArray,
    toNullableNumber,
    toPositiveInt,
    saveGeneratedPlan,
    pruneGeneratedPlans
  } = deps;

  // Open to anonymous callers by design; the anonymous quota is enforced by the
  // rate limiters mounted on this path in index.js. `req.user` is populated by
  // attachOptionalUser, so a signed-in caller still gets their plan persisted.
  app.post("/api/generate", async (req, res) => {
    try {
      // `gemini` is null when no key was configured at boot; see index.js.
      if (!process.env.GEMINI_API_KEY || !gemini) {
        return res
          .status(500)
          .json({ error: "Missing GEMINI_API_KEY.", requestId: req.requestId || "" });
      }

      // Validate, then default every field the prompt uses. Free text is
      // flattened onto one line, so nothing a user types can start a prompt line
      // of its own.
      const body = validateBody(req, res, generatePlanBodySchema);
      if (!body) return;

      const inline = (value, maxLen) => collapseWhitespace(cleanText(value, maxLen));
      const inlineList = (items) => items.map(collapseWhitespace).filter(Boolean);

      const goal = inline(body.goal, 120) || "Build strength and energy";
      const equipment = inlineList(toCleanArray(body.equipment, 10, 80));
      const duration = toNullableNumber(body.duration, 15, 180) ?? 45;
      const level = inline(body.level, 40) || "Intermediate";
      const injuries = inline(body.injuries, 140) || "None";
      const days = toNullableNumber(body.days, 1, 7) ?? 3;
      const environment = inline(body.environment, 40) || "Home";
      const focuses = inlineList(toCleanArray(body.focuses, 8, 60));

      // Build the prompt: the client data, one field per line between BEGIN and
      // END marker lines that SYSTEM_INSTRUCTION tells the model to treat as
      // untrusted. Both markers carry a tag drawn fresh for each request, so a
      // value that spells out a marker cannot end the block: it lacks the tag.
      const fence = crypto.randomBytes(8).toString("hex");
      const modelName = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
      const prompt = buildPlanPrompt(
        { goal, equipment, duration, level, injuries, days, environment, focuses },
        fence
      );

      // Generate under the GEMINI_MAX_OUTPUT_TOKENS cap and within GEMINI_TIMEOUT_MS,
      // past which the answer is a 504. A call that fails is a 500.
      const maxOutputTokens = toPositiveInt(
        process.env.GEMINI_MAX_OUTPUT_TOKENS,
        DEFAULT_MAX_OUTPUT_TOKENS
      );
      const timeoutMs = toPositiveInt(process.env.GEMINI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
      const maxPlanChars = toPositiveInt(process.env.GEMINI_MAX_PLAN_CHARS, DEFAULT_MAX_PLAN_CHARS);

      // abortSignal cancels the client side of the request; the race makes the
      // deadline hold even if the call ignores the signal.
      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new GenerationTimeoutError("Plan generation timed out."));
          controller.abort();
        }, timeoutMs);
      });
      let result;
      try {
        result = await Promise.race([
          gemini.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              maxOutputTokens,
              abortSignal: controller.signal
            }
          }),
          deadline
        ]);
      } catch (err) {
        if (err instanceof GenerationTimeoutError) {
          req.log?.warn({ event: "generate_timeout", timeoutMs }, "Plan generation timed out.");
          return res.status(504).json({
            error: "Plan generation took too long. Please try again.",
            requestId: req.requestId || ""
          });
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
      const plan = typeof result?.text === "string" ? result.text : "";

      // Check the answer. A plan the model stopped at the token cap, an empty or
      // whitespace-only plan, or one longer than GEMINI_MAX_PLAN_CHARS, is a 502
      // and is not saved. One with no weekday heading is logged and still served.
      // "MAX_TOKENS" is @google/genai's FinishReason.MAX_TOKENS; a cut-off plan
      // still has text, often every weekday heading, so only this tells it apart.
      if (result?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        req.log?.warn(
          { event: "generate_truncated", maxOutputTokens },
          "Generated plan stopped at the token cap."
        );
        return res.status(502).json({
          error: "The plan was cut off before it was finished. Please try again.",
          requestId: req.requestId || ""
        });
      }

      if (!plan.trim()) {
        return res
          .status(502)
          .json({ error: "No plan generated.", requestId: req.requestId || "" });
      }

      if (plan.length > maxPlanChars) {
        req.log?.warn(
          { event: "generate_oversized", length: plan.length, maxPlanChars },
          "Generated plan exceeded the length cap."
        );
        return res.status(502).json({
          error: "Generated plan was too long. Please try again.",
          requestId: req.requestId || ""
        });
      }

      // Parse the answer once, into the days and notes every reader uses. With
      // no weekday heading, the whole plan is one "Your plan" day.
      const payload = buildPlanPayload(plan);
      if (!payload.days.some((day) => day.weekday !== null)) {
        req.log?.warn({ event: "generate_no_weekday" }, "Generated plan has no weekday heading.");
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
          plan,
          payload
        };

        // Always an insert: the dashboard orders plans newest first and caps how
        // many it reads (userReadRepository.js). The entry built here is returned
        // instead when the user cannot be resolved.
        savedPlan =
          (await saveGeneratedPlan({ userId: sessionUser.id, entry: planEntry })) || planEntry;

        // Then drop the plans past that cap, which no route can read. The plan
        // is saved by now, so a failed prune is only logged: answering 500
        // would cost the caller this plan, and the next save prunes again.
        try {
          await pruneGeneratedPlans({ userId: sessionUser.id });
        } catch (pruneErr) {
          req.log?.warn(
            {
              event: "generated_plan_prune_failed",
              error: cleanText(pruneErr?.message || String(pruneErr), 240)
            },
            "Pruning older generated plans failed."
          );
        }
      }

      res.json({ plan, payload, savedPlan });
    } catch (err) {
      sendErrorResponse(req, res, err, 500);
    }
  });
};
