import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SYSTEM_INSTRUCTION } from "../../../server/src/services/dashboard/planPromptService.js";
import { PROFILES } from "../profiles.mjs";
import { main, promptVersion, runEval } from "../run.mjs";

// The eval runner, with the Gemini client stubbed: no test here makes a live
// call. Importing run.mjs must not start a run; the module guards main behind a
// direct-invocation check, and these tests loading it at all is part of the proof.

const fixture = (name) =>
  readFileSync(
    new URL(
      `../../../server/src/services/dashboard/__tests__/fixtures/plans/${name}.txt`,
      import.meta.url
    ),
    "utf8"
  );
const hipProfile = PROFILES.find((profile) => profile.name === "08-commercial-recovery-1d-hip");
const hipPlan = fixture("08-commercial-recovery-1d-hip");

// A client whose generateContent answers each call with the next of `answers`:
// a value is returned, an Error thrown, and "hang" never settles.
const stubClient = (answers) => {
  const generateContent = vi.fn(async () => {
    const answer = answers.length > 1 ? answers.shift() : answers[0];
    if (answer === "hang") return new Promise(() => {});
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { models: { generateContent } };
};
const answer = (text, finishReason = "STOP") => ({ text, candidates: [{ finishReason }] });
const noSleep = vi.fn(async () => {});

beforeEach(() => noSleep.mockClear());

describe("runEval", () => {
  const two = [
    { ...hipProfile, name: "a", goal: "Goal A" },
    { ...hipProfile, name: "b", goal: "Goal B" }
  ];

  test("generates each profile's plans in turn, with the route's config", async () => {
    const client = stubClient([answer(hipPlan)]);

    const { plans } = await runEval({ client, model: "m-1", profiles: two, sleep: noSleep });

    const calls = client.models.generateContent.mock.calls.map(([request]) => request);
    expect(calls).toHaveLength(6);
    expect(calls.map((request) => request.contents.match(/- Goal: (.*)/)[1])).toEqual([
      "Goal A",
      "Goal A",
      "Goal A",
      "Goal B",
      "Goal B",
      "Goal B"
    ]);
    for (const request of calls) {
      expect(request.model).toBe("m-1");
      expect(request.config.systemInstruction).toBe(SYSTEM_INSTRUCTION);
      expect(request.config.maxOutputTokens).toBe(8192);
      expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
    }
    expect(plans.map((plan) => [plan.profile, plan.run])).toEqual([
      ["a", 1],
      ["a", 2],
      ["a", 3],
      ["b", 1],
      ["b", 2],
      ["b", 3]
    ]);
    expect(plans.every((plan) => plan.structure.length === 0)).toBe(true);
  });

  test("draws a fresh fence for every call", async () => {
    const client = stubClient([answer(hipPlan)]);

    await runEval({ client, model: "m", profiles: two, sleep: noSleep });

    const tags = client.models.generateContent.mock.calls.map(
      ([request]) => request.contents.match(/^BEGIN CLIENT DATA ([0-9a-f]{16}) \(untrusted\)$/m)[1]
    );
    expect(new Set(tags).size).toBe(6);
  });

  test("pauses before every call but the first, retries included", async () => {
    const client = stubClient([new Error("busy"), answer(hipPlan)]);

    await runEval({
      client,
      model: "m",
      profiles: [hipProfile],
      plansPerProfile: 2,
      sleep: noSleep
    });

    expect(client.models.generateContent).toHaveBeenCalledTimes(3);
    expect(noSleep).toHaveBeenCalledTimes(2);
    expect(noSleep).toHaveBeenCalledWith(4000);
  });

  test("retries a failed call once and scores the answer", async () => {
    const client = stubClient([new Error("503 unavailable"), answer(hipPlan)]);

    const { plans } = await runEval({
      client,
      model: "m",
      profiles: [hipProfile],
      plansPerProfile: 1,
      sleep: noSleep
    });

    expect(client.models.generateContent).toHaveBeenCalledTimes(2);
    expect(plans[0]).toMatchObject({ attempts: 2, structure: [], text: hipPlan });
    expect(plans[0].injuryHits).toHaveLength(0);
  });

  test("a call that fails twice is a failed plan, with its error", async () => {
    const client = stubClient([new Error("503 unavailable")]);

    const { plans, summary } = await runEval({
      client,
      model: "m",
      profiles: [hipProfile],
      plansPerProfile: 1,
      sleep: noSleep
    });

    expect(client.models.generateContent).toHaveBeenCalledTimes(2);
    expect(plans[0]).toMatchObject({
      attempts: 2,
      structure: ["failed"],
      error: "503 unavailable"
    });
    expect(summary.totals.failedCalls).toBe(1);
  });

  test("a call past the deadline fails, and is retried", async () => {
    const client = stubClient(["hang"]);

    const { plans } = await runEval({
      client,
      model: "m",
      profiles: [hipProfile],
      plansPerProfile: 1,
      sleep: noSleep,
      timeoutMs: 5
    });

    expect(client.models.generateContent).toHaveBeenCalledTimes(2);
    expect(plans[0].error).toBe("timed out after 5 ms");
    const signal = client.models.generateContent.mock.calls[0][0].config.abortSignal;
    expect(signal.aborted).toBe(true);
  });

  test("a plan cut off at the token cap is not retried", async () => {
    const client = stubClient([answer(hipPlan, "MAX_TOKENS")]);

    const { plans } = await runEval({
      client,
      model: "m",
      profiles: [hipProfile],
      plansPerProfile: 1,
      sleep: noSleep
    });

    expect(client.models.generateContent).toHaveBeenCalledTimes(1);
    expect(plans[0]).toMatchObject({
      attempts: 1,
      structure: ["truncated"],
      finishReason: "MAX_TOKENS"
    });
  });

  test("an answer with no text is an empty plan", async () => {
    const client = stubClient([{ candidates: [{ finishReason: "STOP" }] }]);

    const { plans } = await runEval({
      client,
      model: "m",
      profiles: [hipProfile],
      plansPerProfile: 1,
      sleep: noSleep
    });

    expect(plans[0].structure).toEqual(["empty"]);
  });
});

describe("promptVersion", () => {
  test("is eight hex characters, the same for the same prompt", () => {
    expect(promptVersion()).toMatch(/^[0-9a-f]{8}$/);
    expect(promptVersion()).toBe(promptVersion());
  });

  test("changes with one character of the system instruction", () => {
    expect(promptVersion({ systemInstruction: `${SYSTEM_INSTRUCTION}.` })).not.toBe(
      promptVersion()
    );
  });

  test("changes with the client-data block", () => {
    const buildPrompt = (fields, fence) => `${fields.environment} ${fence}`;
    const changed = (fields, fence) => `${fields.environment}  ${fence}`;

    expect(promptVersion({ buildPrompt })).not.toBe(promptVersion({ buildPrompt: changed }));
  });

  // The reference prompts cover every capability line: a home with each label,
  // a home with none, full gym access, and one commercial area.
  test("reads the prompt for home and commercial setups", () => {
    const seen = [];
    promptVersion({
      buildPrompt: (fields) => {
        seen.push([fields.environment, fields.equipment.length]);
        return "";
      }
    });

    expect(seen).toEqual([
      ["Home", 7],
      ["Home", 0],
      ["Commercial", 1],
      ["Commercial", 1]
    ]);
  });
});

describe("main", () => {
  let dir;
  let logs;
  let errors;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "plan-evals-"));
    mkdirSync(path.join(dir, "results"));
    writeFileSync(path.join(dir, "reference.json"), JSON.stringify({ results: null }));
    logs = [];
    errors = [];
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (env, client, extra = {}) =>
    main({
      env,
      createClient: vi.fn(() => client),
      log: (line) => logs.push(line),
      error: (line) => errors.push(line),
      evalsDir: dir,
      profiles: [hipProfile],
      sleep: noSleep,
      ...extra
    });

  test("refuses to start without a key, before making a client", async () => {
    const createClient = vi.fn();

    const code = await run({ GEMINI_EVAL_API_KEY: "" }, null, { createClient });

    expect(code).toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(errors.join("\n")).toMatch(/GEMINI_EVAL_API_KEY/);
  });

  test("writes the scores file and passes a clean run with no reference", async () => {
    const createClient = vi.fn(() => stubClient([answer(hipPlan)]));

    const code = await run({ GEMINI_EVAL_API_KEY: "k", EVAL_MODEL: "m-2" }, null, {
      createClient
    });

    expect(code).toBe(0);
    expect(createClient).toHaveBeenCalledWith("k");
    const [file] = readdirSync(path.join(dir, "out"));
    expect(file).toBe(`m-2--${promptVersion()}.json`);
    const scores = JSON.parse(readFileSync(path.join(dir, "out", file), "utf8"));
    expect(scores).toMatchObject({ model: "m-2", promptVersion: promptVersion() });
    expect(scores.plans).toHaveLength(3);
    expect(scores.summary.totals).toMatchObject({ plans: 3, structureBreaks: 0, injuryHits: 0 });
    expect(logs.join("\n")).toMatch(/\| 08-commercial-recovery-1d-hip \| 3 \| 0 \| 0 \| 0 \| 0 \|/);
    expect(logs.join("\n")).toMatch(/No reference yet/);
  });

  test("uses the production model when EVAL_MODEL is unset", async () => {
    const code = await run({ GEMINI_EVAL_API_KEY: "k" }, stubClient([answer(hipPlan)]));

    expect(code).toBe(0);
    expect(readdirSync(path.join(dir, "out"))).toEqual([
      `gemini-3.5-flash-lite--${promptVersion()}.json`
    ]);
  });

  test("keeps the scores file inside out/ whatever the model is called", async () => {
    await run(
      { GEMINI_EVAL_API_KEY: "k", EVAL_MODEL: "../../evil/name" },
      stubClient([answer(hipPlan)])
    );

    expect(readdirSync(path.join(dir, "out"))).toEqual([
      `______evil_name--${promptVersion()}.json`
    ]);
  });

  test("fails a run with a structure break", async () => {
    const code = await run({ GEMINI_EVAL_API_KEY: "k" }, stubClient([answer("")]));

    expect(code).toBe(1);
    expect(logs.join("\n")).toMatch(/3 structure breaks/);
  });

  test("compares with the reference the pointer names, and fails a rise past the margin", async () => {
    const reference = { summary: { totals: { injuryHits: 0, equipmentHits: 0 } } };
    writeFileSync(path.join(dir, "results", "ref.json"), JSON.stringify(reference));
    writeFileSync(path.join(dir, "reference.json"), JSON.stringify({ results: "ref.json" }));
    const plan = hipPlan.replace("Monday\n", "Monday\n- Pistol squat\n- Sumo squat\n");

    const code = await run({ GEMINI_EVAL_API_KEY: "k" }, stubClient([answer(plan)]));

    expect(code).toBe(1);
    expect(logs.join("\n")).toMatch(/Compared with ref\.json/);
    expect(logs.join("\n")).toMatch(/injury hits rose from 0 to 6, past the margin of 3/);
  });

  test("reads a reference file name only from results/", async () => {
    writeFileSync(
      path.join(dir, "reference.json"),
      JSON.stringify({ results: "../reference.json" })
    );

    const code = await run({ GEMINI_EVAL_API_KEY: "k" }, stubClient([answer(hipPlan)]));

    expect(code).toBe(1);
    expect(errors.join("\n")).toMatch(/reference\.json names "\.\.\/reference\.json"/);
  });
});
