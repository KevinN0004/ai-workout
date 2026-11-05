import { describe, expect, test } from "vitest";
import {
  PLAN_PAYLOAD_VERSION as SERVER_PLAN_PAYLOAD_VERSION,
  buildPlanPayload,
  toPlanPayload,
  withPrescriptions
} from "../../../../server/src/services/dashboard/planPayloadService.js";
import { generatePlan } from "../../../../server/src/services/planning/generatePlan.js";
import { PLAN_PAYLOAD_VERSION, parsePlanSections, readPlan, savedPlanDays } from "../plans";

// The server parses each new plan's text when it saves the plan; this client
// parses the text of a plan saved without that structure. A plan must read the
// same either way, so every captured answer and every edge case goes through
// both parsers, and the two must agree exactly.

// Loaded by Vite as text when the test is built: under jsdom, import.meta.url is
// not a file URL, so node:fs cannot find them from here.
const fixtures = Object.entries(
  import.meta.glob("../../../../server/src/services/dashboard/__tests__/fixtures/plans/*.txt", {
    query: "?raw",
    import: "default",
    eager: true
  })
)
  .map(([path, text]) => [path.split("/").pop(), text])
  .sort(([a], [b]) => a.localeCompare(b));

const plan = (...lines) => lines.join("\n");

// The cases client/src/app/__tests__/plans.test.js and the server's
// planPayloadService tests pin, as text.
const edgeCases = [
  ["empty text", ""],
  ["whitespace only", "\n\n   \n"],
  [
    "a week with Coach Notes",
    plan(
      "Monday - Push",
      "Bench press 4x6",
      "Tuesday - Pull",
      "Barbell row 4x6",
      "Wednesday - Rest",
      "Coach Notes: keep one rep in reserve",
      "Hydrate between sets"
    )
  ],
  ["CRLF line endings", "Monday - Push\r\nBench press\r\nCoach Notes: sleep\r\n"],
  ["an upper-case heading", plan("MONDAY", "Bench press")],
  ["a repeated weekday", plan("Monday", "Bench", "Monday", "Squat")],
  ["blank lines and padding", plan("Monday", "", "  Bench press  ", "   ", "Squat")],
  ["a preamble", plan("Here is your week!", "Monday", "Bench press")],
  ["a weekday mid-line", plan("Monday", "Repeat this on Friday too")],
  ["no weekday heading", plan("Do 20 push-ups", "Then a 2km run")],
  ["a bare notes heading", plan("Monday", "Bench press", "Notes", "Rest well")],
  ["a line like a heading", plan("Monday", "Noteworthy: form check")],
  ["a Notes heading first", plan("Notes: warm up first", "Monday", "Bench")],
  [
    "a tip inside a day",
    plan("Monday", "Bench", "Tip: brace hard", "Tuesday", "Rows", "Tips: hydrate")
  ],
  [
    "a coach note naming a weekday",
    plan("Monday - Push", "Bench 4x6", "Coach Notes:", "Saturday: light walk", "Sleep 8 hours")
  ],
  ["Tips before Coach Notes", plan("Monday", "Bench", "Tips: hydrate", "Coach Notes: sleep well")],
  ["a bold heading", plan("**Monday - Push**", "Bench press")],
  ["a hash heading", plan("## Monday - Push", "Bench press")],
  ["a bullet heading", plan("- Monday - Push", "Bench press")],
  ...[
    "Notes: rest well",
    "Note: rest well",
    "Tips: rest well",
    "Tip: rest well",
    "Coach's Notes: rest well",
    "COACH NOTES: rest well"
  ].map((heading) => [`the heading ${heading}`, plan("Monday", "Bench press", heading)])
];

describe("the plan parse, on the server and here", () => {
  test("agree on the payload version", () => {
    expect(PLAN_PAYLOAD_VERSION).toBe(SERVER_PLAN_PAYLOAD_VERSION);
  });

  test("read all eight captured answers", () => {
    expect(fixtures).toHaveLength(8);
  });

  test.each([...fixtures, ...edgeCases])("agree on %s", (_label, text) => {
    expect({ version: PLAN_PAYLOAD_VERSION, ...parsePlanSections(text) }).toEqual(
      buildPlanPayload(text)
    );
  });
});

// Roadmap B1: a rule-built plan's days carry prescriptions. The server checks
// them when it stores or reads a plan, and this client when it reads one, so
// both must keep the same lists and drop the same malformed ones, each costing
// only its own day.
describe("the days' prescriptions, on the server and here", () => {
  const week = generatePlan({
    goal: "Build lean strength and energy",
    environment: "Home",
    equipment: ["Dumbbells", "Adjustable bench"],
    level: "Intermediate",
    days: 3,
    duration: 45,
    injuries: "Knee",
    focuses: [],
    health: {},
    age: null
  });
  const ruleBuilt = withPrescriptions(buildPlanPayload(week.text), week.week);
  const monday = ruleBuilt.days.findIndex((day) => day.weekday === "Monday");
  const breaking = (change) => ({
    ...ruleBuilt,
    days: ruleBuilt.days.map((day, index) =>
      index === monday ? { ...day, prescriptions: change(day.prescriptions) } : day
    )
  });
  const [first] = ruleBuilt.days[monday].prescriptions;

  const payloads = [
    ["a rule-built plan", ruleBuilt],
    ["a plan without prescriptions", buildPlanPayload(week.text)],
    ["a missing name", breaking((list) => [{ ...first, name: "" }, ...list.slice(1)])],
    ["no sets", breaking((list) => [{ ...first, sets: 0 }, ...list.slice(1)])],
    ["a fraction of a set", breaking((list) => [{ ...first, sets: 1.5 }, ...list.slice(1)])],
    [
      "min past max",
      breaking((list) => [{ ...first, reps: { min: 9, max: 8 } }, ...list.slice(1)])
    ],
    [
      "a negative range",
      breaking((list) => [{ ...first, reps: { min: -2, max: 8 } }, ...list.slice(1)])
    ],
    [
      "reps and seconds",
      breaking((list) => [{ ...first, seconds: { min: 5, max: 9 } }, ...list.slice(1)])
    ],
    ["neither", breaking((list) => [{ ...first, reps: null }, ...list.slice(1)])],
    ["a perSide string", breaking((list) => [{ ...first, perSide: "no" }, ...list.slice(1)])],
    ["a numeric target", breaking((list) => [{ ...first, targetRpe: 8 }, ...list.slice(1)])],
    ["an entry that is text", breaking((list) => ["Squat", ...list.slice(1)])],
    ["a list that is an object", breaking(() => ({ squat: first }))]
  ];

  test("the rule-built plan carries prescriptions to agree on", () => {
    expect(ruleBuilt.days[monday].prescriptions.length).toBeGreaterThan(0);
  });

  test.each(payloads)("agree on %s", (_label, payload) => {
    const server = toPlanPayload(payload);

    expect(savedPlanDays({ payload })).toEqual(server.days);
    expect(readPlan({ payload, text: "" }).days).toEqual(server.days);
  });
});
