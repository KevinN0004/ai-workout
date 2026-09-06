import { describe, expect, test } from "vitest";
import { extractLatestPlanByWeekday, parsePlanSections } from "./plans";

// The two parsers that turn a generated plan -- free text from Gemini -- into
// the day sections the Plans view renders and the weekday lookup the dashboard
// uses for "today". Previously 25% covered, and the only thing standing between
// a model that phrases its output slightly differently and an empty plan.

const plan = (...lines) => lines.join("\n");

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

describe("parsePlanSections", () => {
  describe("nothing to parse", () => {
    test.each([
      ["null", null],
      ["undefined", undefined],
      ["an empty string", ""]
    ])("returns empty sections for %s", (_label, input) => {
      expect(parsePlanSections(input)).toEqual({ days: [], notes: [] });
    });

    test("returns empty sections for whitespace only", () => {
      expect(parsePlanSections("\n\n   \n")).toEqual({ days: [], notes: [] });
    });
  });

  describe("day sections", () => {
    test("splits on weekday headings", () => {
      const { days } = parsePlanSections(weekPlan);

      expect(days.map((day) => day.title)).toEqual([
        "Monday - Push",
        "Tuesday - Pull",
        "Wednesday - Rest"
      ]);
    });

    test("puts the lines under the day they follow", () => {
      const { days } = parsePlanSections(weekPlan);

      expect(days[0].lines).toEqual(["Bench press 4x6", "Overhead press 3x8"]);
      expect(days[1].lines).toEqual(["Barbell row 4x6"]);
    });

    test("keeps a day with no lines under it", () => {
      const { days } = parsePlanSections(weekPlan);

      expect(days[2]).toEqual({ title: "Wednesday - Rest", lines: [] });
    });

    test("matches a weekday heading regardless of case", () => {
      const { days } = parsePlanSections(plan("MONDAY", "Bench press"));

      expect(days[0].title).toBe("MONDAY");
    });

    test("ignores blank lines between entries", () => {
      const { days } = parsePlanSections(plan("Monday", "", "Bench press", "   ", "Squat"));

      expect(days[0].lines).toEqual(["Bench press", "Squat"]);
    });

    // Anything before the first weekday belongs to no day and is dropped.
    test("drops a preamble that arrives before the first weekday", () => {
      const { days } = parsePlanSections(plan("Here is your week!", "Monday", "Bench press"));

      expect(days).toHaveLength(1);
      expect(days[0].title).toBe("Monday");
    });

    // A plan with no recognisable weekday still renders as one block rather
    // than vanishing.
    test("falls back to a single section when no weekday is found", () => {
      const { days } = parsePlanSections(plan("Do 20 push-ups", "Then a 2km run"));

      expect(days).toEqual([
        { title: "Your plan", lines: ["Do 20 push-ups", "Then a 2km run"] }
      ]);
    });

    // startsWith, not a contains, so a line only counts as a heading when the
    // weekday opens it.
    test("does not treat a mid-sentence weekday as a heading", () => {
      const { days } = parsePlanSections(plan("Monday", "Repeat this on Friday too"));

      expect(days).toHaveLength(1);
      expect(days[0].lines).toEqual(["Repeat this on Friday too"]);
    });
  });

  describe("coach notes", () => {
    test.each([
      "Notes: rest well",
      "Note: rest well",
      "Tips: rest well",
      "Tip: rest well",
      "Coach Notes: rest well",
      "Coach's Notes: rest well",
      "COACH NOTES: rest well"
    ])("recognises %s as the notes heading", (heading) => {
      const { notes } = parsePlanSections(plan("Monday", "Bench press", heading));

      expect(notes).toEqual(["rest well"]);
    });

    test("keeps everything after the heading as notes", () => {
      const { notes } = parsePlanSections(weekPlan);

      expect(notes).toEqual(["keep one rep in reserve", "Hydrate between sets"]);
    });

    test("keeps notes out of the day sections", () => {
      const { days } = parsePlanSections(weekPlan);

      expect(JSON.stringify(days)).not.toContain("Hydrate");
    });

    // A bare heading contributes no text of its own.
    test("drops a heading with nothing after the colon", () => {
      const { notes } = parsePlanSections(plan("Monday", "Bench press", "Notes", "Rest well"));

      expect(notes).toEqual(["Rest well"]);
    });

    test("returns no notes when there is no heading", () => {
      const { notes } = parsePlanSections(plan("Monday", "Bench press"));

      expect(notes).toEqual([]);
    });

    // The heading is matched on a word boundary, so a day line that merely
    // begins with a similar word is not mistaken for it.
    test("does not treat 'Noteworthy' as a notes heading", () => {
      const { days, notes } = parsePlanSections(plan("Monday", "Noteworthy: form check"));

      expect(notes).toEqual([]);
      expect(days[0].lines).toEqual(["Noteworthy: form check"]);
    });

    // A model that leads with its notes leaves nothing above them, and the
    // whole plan is read as notes.
    test("produces no days when the notes heading comes first", () => {
      const { days, notes } = parsePlanSections(plan("Notes: warm up first", "Monday", "Bench"));

      expect(days).toEqual([]);
      expect(notes).toEqual(["warm up first", "Monday", "Bench"]);
    });
  });

  // The generator is asked for plain text, but a model that reaches for
  // markdown emphasis produces headings that startsWith cannot see. Recorded
  // because the whole week then collapses into one "Your plan" block rather
  // than failing loudly.
  describe("markdown headings are not recognised", () => {
    test.each([
      ["bold", "**Monday - Push**"],
      ["a hash heading", "## Monday - Push"],
      ["a bullet", "- Monday - Push"]
    ])("does not split on %s", (_label, heading) => {
      const { days } = parsePlanSections(plan(heading, "Bench press"));

      expect(days).toHaveLength(1);
      expect(days[0].title).toBe("Your plan");
    });
  });
});

describe("extractLatestPlanByWeekday", () => {
  const dashboard = (planText) => ({ plans: [{ plan: planText }] });

  test("groups the lines under each weekday", () => {
    const week = extractLatestPlanByWeekday(dashboard(weekPlan));

    expect(week).toEqual({
      Monday: ["Bench press 4x6", "Overhead press 3x8"],
      Tuesday: ["Barbell row 4x6"]
    });
  });

  // A day with no lines never gets a key, so callers have to treat a missing
  // day and a rest day the same way.
  test("omits a weekday that has no lines under it", () => {
    const week = extractLatestPlanByWeekday(dashboard(weekPlan));

    expect("Wednesday" in week).toBe(false);
  });

  test("uses the first plan in the list", () => {
    const week = extractLatestPlanByWeekday({
      plans: [{ plan: plan("Monday", "Newest") }, { plan: plan("Monday", "Older") }]
    });

    expect(week.Monday).toEqual(["Newest"]);
  });

  test("stops at the coach notes", () => {
    const week = extractLatestPlanByWeekday(dashboard(weekPlan));

    expect(JSON.stringify(week)).not.toContain("Hydrate");
  });

  test("drops a preamble before the first weekday", () => {
    const week = extractLatestPlanByWeekday(
      dashboard(plan("Here is your week!", "Monday", "Bench press"))
    );

    expect(week).toEqual({ Monday: ["Bench press"] });
  });

  test("matches weekdays regardless of case", () => {
    const week = extractLatestPlanByWeekday(dashboard(plan("FRIDAY", "Deadlift")));

    expect(week.Friday).toEqual(["Deadlift"]);
  });

  test.each([
    ["the dashboard is missing", undefined],
    ["there are no plans", { plans: [] }],
    ["plans is absent", {}]
  ])("returns nothing when %s", (_label, input) => {
    expect(extractLatestPlanByWeekday(input)).toEqual({});
  });

  test("returns nothing when the stored plan is empty", () => {
    expect(extractLatestPlanByWeekday({ plans: [{ plan: "" }] })).toEqual({});
    expect(extractLatestPlanByWeekday({ plans: [{}] })).toEqual({});
  });

  // The asymmetry worth knowing about. parsePlanSections falls back to a single
  // "Your plan" section when it finds no weekday, so the Plans view still shows
  // something; this one has no such fallback and returns nothing, so the
  // dashboard's "today" panel is empty for the same plan.
  test("returns nothing for a plan with no weekday headings", () => {
    const planText = plan("Do 20 push-ups", "Then a 2km run");

    expect(extractLatestPlanByWeekday(dashboard(planText))).toEqual({});
    expect(parsePlanSections(planText).days).toHaveLength(1);
  });

  test("agrees with parsePlanSections about which lines belong to a day", () => {
    const week = extractLatestPlanByWeekday(dashboard(weekPlan));
    const { days } = parsePlanSections(weekPlan);

    expect(week.Monday).toEqual(days[0].lines);
    expect(week.Tuesday).toEqual(days[1].lines);
  });
});
