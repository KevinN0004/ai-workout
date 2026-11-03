import { describe, expect, test } from "vitest";
import { buildPlanWeek } from "../planWeek";

// This week of the newest plan against the workouts logged. The owner decided
// what completes a planned day: a workout linked to it and dated this week, or
// a workout with no link dated on it.

const mainLifts = (name) => ["Main lifts:", `- ${name}: 3 x 5`];
const restLines = ["Rest or 20-minute light walk."];

// Monday, Wednesday and Friday train; the other four rest.
const DAYS = [
  { index: 0, weekday: "Monday", title: "Monday", lines: mainLifts("Back Squats") },
  { index: 1, weekday: "Tuesday", title: "Tuesday", lines: restLines },
  { index: 2, weekday: "Wednesday", title: "Wednesday", lines: mainLifts("Bench Press") },
  { index: 3, weekday: "Thursday", title: "Thursday", lines: restLines },
  { index: 4, weekday: "Friday", title: "Friday", lines: mainLifts("Deadlifts") },
  { index: 5, weekday: "Saturday", title: "Saturday", lines: ["Active Recovery: yoga"] },
  { index: 6, weekday: "Sunday", title: "Sunday", lines: ["Full Rest."] }
];

// Saved well before the week of 2 to 8 November 2026.
const plan = (overrides = {}) => ({
  id: "plan-1",
  createdAt: new Date(2026, 9, 20, 12).toISOString(),
  plan: "Monday",
  payload: { version: 1, days: DAYS, notes: [] },
  ...overrides
});

// Local dates, so the week is the same in every time zone.
const MONDAY = new Date(2026, 10, 2, 9);
const WEDNESDAY = new Date(2026, 10, 4, 9);
const SUNDAY = new Date(2026, 10, 8, 21);

const week = (options) =>
  buildPlanWeek({ plan: plan(), workouts: [], today: WEDNESDAY, ...options });
const stateOf = (result) => Object.fromEntries(result.days.map((day) => [day.label, day.state]));
const counts = ({ planned, done, missed }) => ({ planned, done, missed });

describe("buildPlanWeek", () => {
  test("is null with no plan", () => {
    expect(buildPlanWeek({ plan: undefined, workouts: [], today: WEDNESDAY })).toBeNull();
  });

  test("lays out this week, Monday to Sunday, with each day's local date", () => {
    expect(week().days.map(({ key, label, date }) => [key, label, date])).toEqual([
      ["Monday", "Mon", "2026-11-02"],
      ["Tuesday", "Tue", "2026-11-03"],
      ["Wednesday", "Wed", "2026-11-04"],
      ["Thursday", "Thu", "2026-11-05"],
      ["Friday", "Fri", "2026-11-06"],
      ["Saturday", "Sat", "2026-11-07"],
      ["Sunday", "Sun", "2026-11-08"]
    ]);
  });

  describe("with nothing logged", () => {
    test("a past training day is missed, today's is today, a later one upcoming", () => {
      const result = week();

      expect(stateOf(result)).toEqual({
        Mon: "missed",
        Tue: "rest",
        Wed: "today",
        Thu: "rest",
        Fri: "upcoming",
        Sat: "rest",
        Sun: "rest"
      });
      expect(counts(result)).toEqual({ planned: 3, done: 0, missed: 1 });
    });

    test("on the week's first day, nothing is missed yet", () => {
      expect(counts(week({ today: MONDAY }))).toEqual({ planned: 3, done: 0, missed: 0 });
      expect(stateOf(week({ today: MONDAY })).Mon).toBe("today");
    });

    // Sunday ends the week it is in, rather than starting the next.
    test("on the week's last day, every training day is missed", () => {
      const result = week({ today: SUNDAY });

      expect(result.days[0].date).toBe("2026-11-02");
      expect(counts(result)).toEqual({ planned: 3, done: 0, missed: 3 });
    });
  });

  describe("a workout linked to a day", () => {
    test("completes that day whatever its date in the week", () => {
      const result = week({
        workouts: [{ id: "w1", date: "2026-11-03", planId: "plan-1", planDayIndex: 0 }]
      });

      expect(stateOf(result).Mon).toBe("done");
      expect(counts(result)).toEqual({ planned: 3, done: 1, missed: 0 });
    });

    test("completes a later day logged early", () => {
      const result = week({
        workouts: [{ id: "w1", date: "2026-11-04", planId: "plan-1", planDayIndex: 4 }]
      });

      expect(stateOf(result)).toMatchObject({ Wed: "today", Fri: "done" });
    });

    test("completes nothing when it is dated last week", () => {
      const result = week({
        workouts: [{ id: "w1", date: "2026-11-01", planId: "plan-1", planDayIndex: 0 }]
      });

      expect(stateOf(result).Mon).toBe("missed");
    });

    test("completes nothing when it is linked to an older plan, even on the day", () => {
      const result = week({
        workouts: [{ id: "w1", date: "2026-11-02", planId: "plan-0", planDayIndex: 0 }]
      });

      expect(stateOf(result).Mon).toBe("missed");
    });

    test("completes nothing when it is linked to a rest day", () => {
      const result = week({
        workouts: [{ id: "w1", date: "2026-11-03", planId: "plan-1", planDayIndex: 1 }]
      });

      expect(stateOf(result)).toMatchObject({ Mon: "missed", Tue: "rest" });
    });
  });

  describe("a workout with no link", () => {
    test("completes the training day it is dated on", () => {
      const result = week({ workouts: [{ id: "w1", date: "2026-11-02", planId: null }] });

      expect(stateOf(result).Mon).toBe("done");
    });

    test("completes today's training day", () => {
      const result = week({ workouts: [{ id: "w1", date: "2026-11-04" }] });

      expect(stateOf(result).Wed).toBe("done");
      expect(counts(result)).toEqual({ planned: 3, done: 1, missed: 1 });
    });

    test("completes no other day", () => {
      const result = week({ workouts: [{ id: "w1", date: "2026-11-03", planId: null }] });

      expect(stateOf(result)).toMatchObject({ Mon: "missed", Tue: "rest", Wed: "today" });
    });

    test.each([
      ["no date", {}],
      ["a date that is not a day", { date: "next week" }],
      ["last week's date", { date: "2026-10-26" }]
    ])("completes nothing with %s", (_label, fields) => {
      expect(stateOf(week({ workouts: [{ id: "w1", ...fields }] })).Mon).toBe("missed");
    });
  });

  describe("a plan saved during the week", () => {
    const savedWednesday = plan({ createdAt: new Date(2026, 10, 4, 8).toISOString() });

    test("leaves the days before it unplanned, and plans the day it was saved", () => {
      const result = week({ plan: savedWednesday });

      expect(stateOf(result)).toMatchObject({ Mon: "unplanned", Wed: "today", Fri: "upcoming" });
      expect(counts(result)).toEqual({ planned: 2, done: 0, missed: 0 });
    });

    test("does not count a workout on a day before it", () => {
      const result = week({
        plan: savedWednesday,
        workouts: [{ id: "w1", date: "2026-11-02" }]
      });

      expect(stateOf(result).Mon).toBe("unplanned");
      expect(counts(result).done).toBe(0);
    });

    test("is planned in full when its saved date does not parse", () => {
      expect(counts(week({ plan: plan({ createdAt: "soon" }) })).planned).toBe(3);
    });
  });

  // A plan saved before its structure was, read from its text.
  test("reads a plan saved without a structure from its text", () => {
    const result = week({
      plan: plan({
        payload: null,
        plan: ["Monday", ...mainLifts("Back Squats"), "Tuesday", ...restLines].join("\n")
      })
    });

    expect(stateOf(result)).toMatchObject({ Mon: "missed", Tue: "rest", Wed: "rest" });
    expect(counts(result)).toEqual({ planned: 1, done: 0, missed: 1 });
  });
});
