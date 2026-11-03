/**
 * POST /api/generate: builds a weekly workout plan from the planner form with the
 * rule-based generator, asks Gemini for its coach notes (rule-written notes stand
 * in when it cannot), and saves the plan for a signed-in caller.
 */
import crypto from "crypto";
import { sendErrorResponse } from "../services/http/errorResponseService.js";
import { collapseWhitespace } from "../services/dashboard/dashboardDataBuildersService.js";
import { buildPlanPayload } from "../services/dashboard/planPayloadService.js";
import {
  DEFAULT_GEMINI_MODEL,
  NOTES_INSTRUCTION,
  buildNotesPrompt
} from "../services/dashboard/planPromptService.js";
import { generatePlan } from "../services/planning/generatePlan.js";
import { buildFallbackNotes, buildSafetyNotes } from "../services/planning/fallbackNotes.js";

// Defaults for the notes call, used when GEMINI_MAX_OUTPUT_TOKENS (tokens) or
// GEMINI_TIMEOUT_MS (milliseconds) is unset or not a positive integer. README's
// environment table and env.example document the same defaults.
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 8000;

// How much of Gemini's answer is kept: eight notes of up to 300 characters.
const MAX_NOTES = 8;
const MAX_NOTE_CHARS = 300;
const NOTES_LABEL = /^coach\s*notes?\s*:?\s*/i;

// Thrown only by the notes call's own deadline, so the log can tell a timeout
// from a failure of the call itself.
class NotesTimeoutError extends Error {}

/**
 * Gemini's notes for `planText`, trimmed, or the reason they cannot be used:
 * no client, a failed call, the deadline, a cut-off answer, or no text.
 */
const askForNotes = async ({ gemini, fields, planText, toPositiveInt }) => {
  // `gemini` is null when no key was configured at boot; see index.js.
  if (!process.env.GEMINI_API_KEY || !gemini) return { reason: "no-key" };

  // The client data sits between BEGIN and END marker lines that
  // NOTES_INSTRUCTION tells the model to treat as untrusted. Both carry a tag
  // drawn fresh for each request, so a value that spells out a marker cannot
  // end the block: it lacks the tag.
  const fence = crypto.randomBytes(8).toString("hex");
  const maxOutputTokens = toPositiveInt(
    process.env.GEMINI_MAX_OUTPUT_TOKENS,
    DEFAULT_MAX_OUTPUT_TOKENS
  );
  const timeoutMs = toPositiveInt(process.env.GEMINI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  // abortSignal cancels the client side of the request; the race makes the
  // deadline hold even if the call ignores the signal.
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new NotesTimeoutError("Coach notes timed out."));
      controller.abort();
    }, timeoutMs);
  });
  let result;
  try {
    result = await Promise.race([
      gemini.models.generateContent({
        model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
        contents: buildNotesPrompt(fields, fence, planText),
        config: {
          systemInstruction: NOTES_INSTRUCTION,
          maxOutputTokens,
          abortSignal: controller.signal
        }
      }),
      deadline
    ]);
  } catch (err) {
    return { reason: err instanceof NotesTimeoutError ? "timeout" : "error" };
  } finally {
    clearTimeout(timer);
  }

  // "MAX_TOKENS" is @google/genai's FinishReason.MAX_TOKENS: the answer stopped
  // at the cap, so its last note may be cut off.
  if (result?.candidates?.[0]?.finishReason === "MAX_TOKENS") return { reason: "truncated" };
  const lines = (typeof result?.text === "string" ? result.text : "")
    .split(/\r?\n/)
    .map((line, index) => (index === 0 ? line.replace(NOTES_LABEL, "") : line).trim())
    .filter(Boolean)
    .slice(0, MAX_NOTES)
    .map((line) => line.slice(0, MAX_NOTE_CHARS));
  return lines.length ? { lines } : { reason: "empty" };
};

/**
 * Registers POST /api/generate.
 *
 * @param deps `gemini` is the Gemini client, or null when GEMINI_API_KEY is
 *   unset. `toPositiveInt` is index.js's reader for a positive integer
 *   setting, which the two GEMINI_* limits go through.
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
      // Validate, then default every field. Free text is flattened onto one
      // line, so nothing a user types can start a prompt line of its own.
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
      const fields = { goal, equipment, duration, level, injuries, days, environment, focuses };

      // The health answers and the profile's age shape this plan only; neither
      // is saved with it.
      const age = req.user?.profile?.age;
      const plan = generatePlan({
        ...fields,
        health: body.health || {},
        age: typeof age === "number" ? age : null
      });

      // Gemini's notes, or the rules' when they cannot be used; the safety
      // lines follow either. The text and its payload come from one parse.
      const asked = await askForNotes({ gemini, fields, planText: plan.text, toPositiveInt });
      req.log?.info(
        {
          event: "generate_notes",
          source: asked.lines ? "gemini" : "rules",
          ...(asked.reason ? { reason: asked.reason } : {})
        },
        "Coach notes chosen."
      );
      const notes = [...(asked.lines ?? buildFallbackNotes(plan)), ...buildSafetyNotes(plan)];
      const text = `${plan.text}\n\nCoach Notes:\n${notes.join("\n")}`;
      const payload = buildPlanPayload(text);

      // Save the plan for a signed-in caller; an anonymous one gets the text only.
      const sessionUser = req.user;
      let savedPlan = null;

      if (sessionUser) {
        const planEntry = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...fields,
          plan: text,
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

      res.json({ plan: text, payload, savedPlan });
    } catch (err) {
      sendErrorResponse(req, res, err, 500);
    }
  });
};
