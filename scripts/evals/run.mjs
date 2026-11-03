/**
 * Runs the plan-quality evals: each profile's plan generated three times through
 * Gemini with the production prompt, scored, written to out/, and compared with
 * the committed reference. `npm run eval:plans`; needs GEMINI_EVAL_API_KEY.
 */
import crypto from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GoogleGenAI } from "@google/genai";
import {
  DEFAULT_GEMINI_MODEL,
  SYSTEM_INSTRUCTION,
  buildPlanPrompt
} from "../../server/src/services/dashboard/planPromptService.js";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS
} from "../../server/src/routes/generateRoutes.js";
import { PROFILES } from "./profiles.mjs";
import { scorePlan } from "./scorePlan.mjs";
import { compare, summarize } from "./summarize.mjs";

const PLANS_PER_PROFILE = 3;

// The wait before every call but a run's first, retries included, to stay under
// the key's per-minute limit.
const PAUSE_MS = 4000;

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));

// The prompts the version is a hash of, beside the system instruction: between
// them they hold every capability line the prompt can send (a home with each
// label, a home with none, full gym access, and one commercial area).
const REFERENCE_FIELDS = {
  goal: "Build lean strength and energy",
  duration: 45,
  level: "Intermediate",
  injuries: "None",
  days: 3,
  focuses: ["Strength"]
};
const REFERENCE_SETUPS = [
  {
    environment: "Home",
    equipment: [
      "Bodyweight only",
      "Dumbbells",
      "Kettlebell",
      "Pull-up bar",
      "Resistance bands",
      "Adjustable bench",
      "Yoga mat"
    ]
  },
  { environment: "Home", equipment: [] },
  { environment: "Commercial", equipment: ["Full gym access"] },
  { environment: "Commercial", equipment: ["Strength floor"] }
];

/**
 * The prompt's version: the first 8 hex characters of the sha256 of the system
 * instruction and the client-data block built for the reference setups, so any
 * change to the wording changes it. The arguments stand in for the real prompt.
 */
export const promptVersion = ({
  systemInstruction = SYSTEM_INSTRUCTION,
  buildPrompt = buildPlanPrompt
} = {}) => {
  const prompts = REFERENCE_SETUPS.map((setup) =>
    buildPrompt({ ...REFERENCE_FIELDS, ...setup }, "0")
  );
  return crypto
    .createHash("sha256")
    .update([systemInstruction, ...prompts].join("\n"))
    .digest("hex")
    .slice(0, 8);
};

// One call, as the route makes it: the system instruction, the token cap and an
// abort signal, raced against a deadline that aborts it. Throws on a failure or
// the deadline; a cut-off answer is returned, with its finish reason.
const callOnce = async ({ client, model, prompt, timeoutMs }) => {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${timeoutMs} ms`));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([
      client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
          abortSignal: controller.signal
        }
      }),
      deadline
    ]);
    return {
      text: typeof result?.text === "string" ? result.text : "",
      finishReason: result?.candidates?.[0]?.finishReason ?? null
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Generates and scores `plansPerProfile` plans for each profile, in turn, with
 * a fresh fence each call. A call that throws or passes the deadline is retried
 * once after the pause, and one that fails twice is scored as failed; a plan cut
 * off at the token cap is scored as it is. Returns every plan, with its text and
 * scores, and the run's summary. `client` is a GoogleGenAI client, or a stub.
 */
export const runEval = async ({
  client,
  model,
  profiles = PROFILES,
  plansPerProfile = PLANS_PER_PROFILE,
  sleep,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) => {
  const plans = [];
  let calls = 0;
  const call = async (prompt) => {
    if (calls > 0) await sleep(PAUSE_MS);
    calls += 1;
    return callOnce({ client, model, prompt, timeoutMs });
  };

  for (const { name, ...fields } of profiles) {
    for (let run = 1; run <= plansPerProfile; run += 1) {
      const prompt = buildPlanPrompt(fields, crypto.randomBytes(8).toString("hex"));
      let outcome;
      let attempts = 0;
      while (attempts < 2) {
        attempts += 1;
        try {
          outcome = await call(prompt);
          break;
        } catch (err) {
          outcome = { error: err instanceof Error ? err.message : String(err) };
        }
      }
      plans.push({ profile: name, run, attempts, ...outcome, ...scorePlan(fields, outcome) });
    }
  }

  return { plans, summary: summarize(plans) };
};

// The model's name made safe as a file name: anything but letters, digits, dot,
// dash and underscore becomes "_", and so does each dot of a "..".
const fileSafe = (model) => model.replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.\./g, "__");

// The reference run's summary, from the file reference.json names in results/,
// or null when it names none. Throws on a name that is not a plain file name.
const readReference = (evalsDir) => {
  const { results } = JSON.parse(readFileSync(path.join(evalsDir, "reference.json"), "utf8"));
  if (results === null || results === undefined) return { name: null, summary: null };
  if (typeof results !== "string" || path.basename(results) !== results || results === "..") {
    throw new Error(`reference.json names ${JSON.stringify(results)}, not a file in results/`);
  }
  const file = JSON.parse(readFileSync(path.join(evalsDir, "results", results), "utf8"));
  return { name: results, summary: file.summary };
};

// The run's summary as Markdown, for the job summary: one row per profile, the
// totals, and the comparison's verdict.
const formatReport = ({ model, version, summary, reference, verdict }) => {
  const row = (label, counts) =>
    `| ${label} | ${counts.plans} | ${counts.structureBreaks} | ${counts.failedCalls} | ${counts.injuryHits} | ${counts.equipmentHits} |`;
  return [
    `## Plan-quality evals: ${model}, prompt ${version}`,
    "",
    "| Profile | Plans | Structure breaks | Failed calls | Injury hits | Equipment hits |",
    "| --- | --- | --- | --- | --- | --- |",
    ...Object.entries(summary.profiles).map(([name, counts]) => row(name, counts)),
    row("**Total**", summary.totals),
    "",
    reference.name
      ? `Compared with ${reference.name}: injury hits ${reference.summary.totals.injuryHits}, equipment hits ${reference.summary.totals.equipmentHits}.`
      : "No reference yet: only structure gates this run.",
    "",
    verdict.pass ? "**Pass.**" : `**Fail:** ${verdict.reasons.join("; ")}.`
  ].join("\n");
};

/**
 * The command: reads GEMINI_EVAL_API_KEY and EVAL_MODEL from `env`, refuses with
 * no key, reads the reference before any call, runs the evals, writes
 * out/<model>--<version>.json, prints the report through `log` (progress and
 * problems go to `error`), and resolves to the exit code: 0 for a pass, else 1.
 */
export const main = async ({
  env = process.env,
  createClient = (apiKey) => new GoogleGenAI({ apiKey }),
  log = console.log,
  error = console.error,
  evalsDir = EVALS_DIR,
  profiles = PROFILES,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) => {
  const apiKey = env.GEMINI_EVAL_API_KEY;
  if (!apiKey) {
    error(
      "GEMINI_EVAL_API_KEY is not set. Plan evals make live Gemini calls and need their own key."
    );
    return 1;
  }
  const model = env.EVAL_MODEL || DEFAULT_GEMINI_MODEL;
  const version = promptVersion();

  let reference;
  try {
    reference = readReference(evalsDir);
  } catch (err) {
    error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  error(
    `Generating ${profiles.length} profiles x ${PLANS_PER_PROFILE} with ${model}, prompt ${version}.`
  );
  const { plans, summary } = await runEval({
    client: createClient(apiKey),
    model,
    profiles,
    sleep
  });
  const verdict = compare(summary, reference.summary);

  const outDir = path.join(evalsDir, "out");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${fileSafe(model)}--${version}.json`);
  const scores = {
    date: new Date().toISOString(),
    model,
    promptVersion: version,
    reference: reference.name,
    summary,
    verdict,
    plans
  };
  writeFileSync(outFile, `${JSON.stringify(scores, null, 2)}\n`);
  error(`Wrote ${outFile}.`);

  log(formatReport({ model, version, summary, reference, verdict }));
  return verdict.pass ? 0 : 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
