import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PLAN_PAYLOAD_VERSION, buildPlanPayload, toPlanPayload } from "../planPayloadService.js";

// The structure a generated plan is saved with. The fixtures are eight real
// /api/generate answers, captured on 2026-11-02 for synthetic planner profiles
// (docs/specs/2026-11-02-structured-plans-design.md, "Real answers"). The other
// cases are the ones client/src/app/__tests__/plans.test.js pins for the text
// parse, whose rules this module shares.

const fixtureDir = new URL("./fixtures/plans/", import.meta.url);
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith(".txt"))
  .sort();
const readFixture = (name) => readFileSync(new URL(name, fixtureDir), "utf8");

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const plan = (...lines) => lines.join("\n");
const days = (text) => buildPlanPayload(text).days;
const notes = (text) => buildPlanPayload(text).notes;

describe("buildPlanPayload", () => {
  describe("the captured answers", () => {
    test("there are eight", () => {
      expect(fixtures).toHaveLength(8);
    });

    test.each(fixtures)("%s is seven days, Monday to Sunday, then its notes", (name) => {
      const payload = buildPlanPayload(readFixture(name));

      expect(payload.version).toBe(PLAN_PAYLOAD_VERSION);
      expect(payload.days.map((day) => day.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(payload.days.map((day) => day.weekday)).toEqual(WEEKDAYS);
      expect(payload.days.map((day) => day.title)).toEqual(WEEKDAYS);
      expect(payload.days.every((day) => day.lines.length > 0)).toBe(true);
      expect(payload.notes.length).toBeGreaterThan(0);
    });

    // A rest day is prose, so it is a day like any other, and the notes start
    // below the Coach Notes heading.
    test("keeps a rest day's lines and starts the notes below Coach Notes", () => {
      const payload = buildPlanPayload(readFixture("05-home-bands-2d-shoulder.txt"));

      expect(payload.days[0].lines).toEqual([
        "Rest / Active Recovery",
        "(Light walking or gentle stretching permitted)"
      ]);
      expect(payload.notes[0]).toMatch(/^- Shoulder Safety:/);
    });
  });

  describe("nothing to parse", () => {
    test.each([
      ["an empty string", ""],
      ["whitespace only", "\n\n   \n"]
    ])("is no days and no notes for %s", (_label, text) => {
      expect(buildPlanPayload(text)).toEqual({
        version: PLAN_PAYLOAD_VERSION,
        days: [],
        notes: []
      });
    });
  });

  describe("days", () => {
    const weekPlan = plan(
      "Monday - Push",
      "Bench press 4x6",
      "Overhead press 3x8",
      "Tuesday - Pull",
      "Barbell row 4x6",
      "Wednesday - Rest",
      "Coach Notes: keep one rep in reserve",
      "Hydrate between sets"
    );

    test("opens a day at each weekday heading, with the lines under it", () => {
      expect(days(weekPlan)).toEqual([
        {
          index: 0,
          weekday: "Monday",
          title: "Monday - Push",
          lines: ["Bench press 4x6", "Overhead press 3x8"]
        },
        { index: 1, weekday: "Tuesday", title: "Tuesday - Pull", lines: ["Barbell row 4x6"] },
        { index: 2, weekday: "Wednesday", title: "Wednesday - Rest", lines: [] }
      ]);
    });

    test("names the weekday in one spelling, whatever the heading's case", () => {
      expect(days(plan("MONDAY - Push", "Bench press"))[0]).toMatchObject({
        weekday: "Monday",
        title: "MONDAY - Push"
      });
    });

    test("keeps a repeated weekday as two days, indexed in order", () => {
      expect(days(plan("Monday", "Bench", "Monday", "Squat"))).toEqual([
        { index: 0, weekday: "Monday", title: "Monday", lines: ["Bench"] },
        { index: 1, weekday: "Monday", title: "Monday", lines: ["Squat"] }
      ]);
    });

    test("drops blank lines and trims the rest", () => {
      expect(days(plan("Monday", "", "  Bench press  ", "   ", "Squat"))[0].lines).toEqual([
        "Bench press",
        "Squat"
      ]);
    });

    test("parses CRLF text as it parses LF text", () => {
      expect(buildPlanPayload(weekPlan.replace(/\n/g, "\r\n"))).toEqual(buildPlanPayload(weekPlan));
    });

    test("drops a preamble before the first weekday", () => {
      expect(days(plan("Here is your week!", "Monday", "Bench press"))).toEqual([
        { index: 0, weekday: "Monday", title: "Monday", lines: ["Bench press"] }
      ]);
    });

    test("counts a weekday only where it opens the line", () => {
      expect(days(plan("Monday", "Repeat this on Friday too"))).toEqual([
        { index: 0, weekday: "Monday", title: "Monday", lines: ["Repeat this on Friday too"] }
      ]);
    });

    // A plan with no weekday heading still has one day to show, and no weekday.
    test("makes text with no weekday heading one 'Your plan' day", () => {
      expect(days(plan("Do 20 push-ups", "Then a 2km run"))).toEqual([
        { index: 0, weekday: null, title: "Your plan", lines: ["Do 20 push-ups", "Then a 2km run"] }
      ]);
    });

    // Recorded rather than wanted: no captured answer uses markdown, and a
    // model that did would collapse its week into one "Your plan" day.
    test.each([
      ["bold", "**Monday - Push**"],
      ["a hash heading", "## Monday - Push"],
      ["a bullet", "- Monday - Push"]
    ])("opens no day on %s", (_label, heading) => {
      expect(days(plan(heading, "Bench press"))).toEqual([
        { index: 0, weekday: null, title: "Your plan", lines: [heading, "Bench press"] }
      ]);
    });
  });

  describe("notes", () => {
    test.each([
      "Notes: rest well",
      "Note: rest well",
      "Tips: rest well",
      "Tip: rest well",
      "Coach Notes: rest well",
      "Coach's Notes: rest well",
      "COACH NOTES: rest well"
    ])("recognises %s as the notes heading", (heading) => {
      expect(notes(plan("Monday", "Bench press", heading))).toEqual(["rest well"]);
    });

    test("keeps every line below the heading, and keeps them out of the days", () => {
      const text = plan("Monday", "Bench", "Coach Notes: sleep well", "Hydrate between sets");

      expect(notes(text)).toEqual(["sleep well", "Hydrate between sets"]);
      expect(days(text)[0].lines).toEqual(["Bench"]);
    });

    test("takes nothing from a heading with no text after it", () => {
      expect(notes(plan("Monday", "Bench press", "Notes", "Rest well"))).toEqual(["Rest well"]);
    });

    test("is empty when there is no notes heading", () => {
      expect(notes(plan("Monday", "Bench press"))).toEqual([]);
    });

    test("does not take 'Noteworthy' for a notes heading", () => {
      const text = plan("Monday", "Noteworthy: form check");

      expect(notes(text)).toEqual([]);
      expect(days(text)[0].lines).toEqual(["Noteworthy: form check"]);
    });

    // A Tips or Notes heading counts only below the last weekday heading, so a
    // tip inside a day stays in that day, and leading notes are preamble.
    test("keeps a tip inside the day it appears in", () => {
      const text = plan("Monday", "Bench", "Tip: brace hard", "Tuesday", "Rows", "Tips: hydrate");

      expect(days(text).map((day) => day.lines)).toEqual([["Bench", "Tip: brace hard"], ["Rows"]]);
      expect(notes(text)).toEqual(["hydrate"]);
    });

    test("still reads the week when a Notes heading comes first", () => {
      const text = plan("Notes: warm up first", "Monday", "Bench");

      expect(days(text)).toEqual([
        { index: 0, weekday: "Monday", title: "Monday", lines: ["Bench"] }
      ]);
      expect(notes(text)).toEqual([]);
    });

    // The Coach Notes heading wins wherever it is, so a note naming a weekday
    // stays a note rather than opening a day.
    test("keeps a coach note that opens with a weekday in the notes", () => {
      const text = plan(
        "Monday - Push",
        "Bench 4x6",
        "Tuesday - Pull",
        "Rows 4x8",
        "Coach Notes:",
        "Saturday: light walk",
        "Sleep 8 hours"
      );

      expect(days(text).map((day) => day.weekday)).toEqual(["Monday", "Tuesday"]);
      expect(notes(text)).toEqual(["Saturday: light walk", "Sleep 8 hours"]);
    });

    test("prefers a Coach Notes heading to an earlier Tips heading below the week", () => {
      const text = plan("Monday", "Bench", "Tips: hydrate", "Coach Notes: sleep well");

      expect(days(text)[0].lines).toEqual(["Bench", "Tips: hydrate"]);
      expect(notes(text)).toEqual(["sleep well"]);
    });
  });
});

describe("toPlanPayload", () => {
  const valid = () => buildPlanPayload(readFixture("01-home-bodyweight-3d.txt"));

  test("returns a valid payload as it is", () => {
    const payload = valid();

    expect(toPlanPayload(payload)).toBe(payload);
  });

  test.each([
    ["no days", { version: PLAN_PAYLOAD_VERSION, days: [], notes: [] }],
    ["a 'Your plan' day", buildPlanPayload("Do 20 push-ups")]
  ])("accepts a payload with %s", (_label, payload) => {
    expect(toPlanPayload(payload)).toBe(payload);
  });

  const withDay = (change) => {
    const payload = valid();
    payload.days[0] = { ...payload.days[0], ...change };
    return payload;
  };

  test.each([
    ["the {} an older plan stores", {}],
    ["null", null],
    ["undefined", undefined],
    ["a string", "Monday"],
    ["an array", []],
    ["another version", { ...valid(), version: 2 }],
    ["days that are not a list", { ...valid(), days: "Monday" }],
    ["a day that is not an object", { ...valid(), days: ["Monday"] }],
    ["an index that is not the day's position", withDay({ index: 1 })],
    ["a fractional index", withDay({ index: 0.5 })],
    ["a weekday outside the seven", withDay({ weekday: "Funday" })],
    ["a weekday in another spelling", withDay({ weekday: "monday" })],
    ["a title that is not a string", withDay({ title: 5 })],
    ["lines that are not all strings", withDay({ lines: ["Bench", 5] })],
    ["notes that are not a list of strings", { ...valid(), notes: "Sleep well" }]
  ])("returns null for %s", (_label, value) => {
    expect(toPlanPayload(value)).toBeNull();
  });
});
