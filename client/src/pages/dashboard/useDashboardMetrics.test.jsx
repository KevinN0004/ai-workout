import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useDashboardMetrics from "./useDashboardMetrics";

const weekDays = [
  { label: "Mon", key: "Monday" },
  { label: "Tue", key: "Tuesday" },
  { label: "Wed", key: "Wednesday" }
];

describe("useDashboardMetrics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-02T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("dedupes merged workout data and computes progress metrics", () => {
    const dashboard = {
      workoutSessions: [
        {
          id: "session-1",
          date: "2026-03-02",
          focus: "Strength",
          duration: 45,
          createdAt: "2026-03-02T08:00:00.000Z"
        }
      ],
      workouts: [
        {
          id: "session-1",
          date: "2026-03-02",
          focus: "Strength",
          duration: 45,
          createdAt: "2026-03-02T08:00:00.000Z"
        }
      ],
      calories: [
        { id: "cal-1", date: "2026-03-02", calories: 2200, source: "manual" },
        { id: "cal-2", date: "2026-03-01", calories: 2100, source: "manual" }
      ],
      mealLogs: [],
      progressMetrics: [
        { id: "p1", date: "2026-03-02", weightLb: 170, loggedAt: "2026-03-02T10:00:00.000Z" },
        { id: "p2", date: "2026-03-01", weightLb: 172, loggedAt: "2026-03-01T10:00:00.000Z" }
      ],
      plans: [{ goal: "Fat loss + conditioning" }],
      goals: {
        targetWeight: 165,
        targetCalories: 2200,
        weeklyWorkouts: 3
      }
    };

    const { result } = renderHook(() =>
      useDashboardMetrics({
        dashboard,
        goalForm: { targetCalories: "2200", weeklyWorkouts: "3" },
        formGoal: "Fat loss + conditioning",
        weekDays,
        latestPlanByWeekday: { Monday: ["Squat"] }
      })
    );

    expect(result.current.workouts).toHaveLength(1);
    expect(result.current.last7Workouts).toHaveLength(1);
    expect(result.current.avgCalories).toBe(2150);
    expect(result.current.workoutProgress).toBe(33);
    expect(result.current.calorieGoal).toBe(2200);
    expect(result.current.calorieProgress).toBe(98);
    expect(result.current.todayRecommendation.weekday).toBe("Monday");
    expect(result.current.todayRecommendation.workoutLines).toEqual(["Squat"]);
    expect(result.current.weeklyTrends.latestWeight).toBe(170);
    expect(result.current.weeklyTrends.weightDelta).toBe(-2);
  });

  test("buildLinePath returns svg path for empty and populated values", () => {
    const { result } = renderHook(() =>
      useDashboardMetrics({
        dashboard: {
          workouts: [],
          workoutSessions: [],
          calories: [],
          mealLogs: [],
          progressMetrics: [],
          plans: [],
          goals: { targetWeight: 160, targetCalories: 2200, weeklyWorkouts: 3 }
        },
        goalForm: { targetCalories: "2200", weeklyWorkouts: "3" },
        formGoal: "",
        weekDays,
        latestPlanByWeekday: {}
      })
    );

    const emptyPath = result.current.buildLinePath([]);
    const linePath = result.current.buildLinePath([1, 3, 2], 100, 50, 5);

    expect(emptyPath).toMatch(/^M/);
    expect(linePath).toMatch(/^M/);
    expect(linePath).toContain("L");
  });

  // The two tests above cover the happy path on one day's data. These cover
  // the date handling, the deduplication, and the week-over-week deltas -- the
  // parts that decide what number the visitor is actually shown.

  const render = (overrides = {}) =>
    renderHook(() =>
      useDashboardMetrics({
        dashboard: {
          workouts: [],
          workoutSessions: [],
          calories: [],
          mealLogs: [],
          progressMetrics: [],
          plans: [],
          goals: {},
          ...overrides.dashboard
        },
        goalForm: {},
        formGoal: "",
        weekDays,
        latestPlanByWeekday: {},
        ...overrides
      })
    ).result.current;

  describe("date handling", () => {
    test("a plain YYYY-MM-DD date is read as local, not UTC", () => {
      // `new Date("2026-03-02")` is UTC midnight, which is the 1st in any
      // negative-offset zone -- so a workout logged today would land in
      // yesterday's bucket and drop out of the last-7-days window. The
      // explicit regex path is what avoids that.
      const metrics = render({
        dashboard: { workouts: [{ id: "w1", date: "2026-03-02", duration: 45 }] }
      });

      expect(metrics.last7Workouts).toHaveLength(1);
    });

    test("a full timestamp is parsed, but a time of day falls outside today", () => {
      // Pinning what it does rather than what it looks like it should. The
      // window's upper bound is `todayDate`, which is local *midnight*, and
      // the test is `<= todayDate` -- so any timestamp with a time of day on
      // today is excluded from the last-7-days window.
      //
      // Latent rather than live: `toDateOnly` on the server slices every date
      // to ten characters, so `date` is always a plain YYYY-MM-DD here and a
      // timestamp cannot arrive through the normal path. Worth knowing before
      // this hook is fed from anywhere else.
      //
      // This test also asserted the opposite at first and passed locally,
      // because 08:00Z happens to be local midnight in this machine's zone.
      // CI runs in UTC and caught it. Timestamps in these windows are
      // timezone-dependent; plain dates are not, which is the whole reason
      // parseDateValue has its own YYYY-MM-DD branch.
      const metrics = render({
        dashboard: {
          workouts: [
            { id: "w1", date: "2026-03-02T08:00:00.000Z", duration: 45 },
            { id: "w2", date: "2026-02-27T08:00:00.000Z", duration: 45 }
          ]
        }
      });

      // Both parse -- neither is discarded as unreadable. Only the older one
      // is asserted to be in the window: it is comfortably inside at any
      // offset, whereas today's timestamp lands on either side of local
      // midnight depending on the zone, which is exactly the fragility being
      // described. Asserting that one either way would re-introduce the bug
      // this comment exists to record.
      expect(metrics.workouts).toHaveLength(2);
      expect(metrics.last7Workouts.map((item) => item.id)).toContain("w2");
    });

    test("a plain date for today is included wherever the clock is", () => {
      // The contract the server actually provides, and the one that holds in
      // every timezone.
      const metrics = render({
        dashboard: { workouts: [{ id: "w1", date: "2026-03-02", duration: 45 }] }
      });

      expect(metrics.last7Workouts).toHaveLength(1);
    });

    // Two of parseDateValue's guards survive mutation testing, and both are
    // genuinely redundant rather than untested. Returning an Invalid Date
    // instead of null changes nothing observable: it buckets under the key
    // "NaN-NaN-NaN", which no range ever queries, and every window comparison
    // against it is false. Dropping the `!value` early return changes nothing
    // either: `new Date(undefined)` is invalid and falls to the NaN check,
    // while `new Date(null)` is the epoch, which is outside every window.
    test.each([
      ["absent", undefined],
      ["null", null],
      ["empty", ""],
      ["unparseable", "not a date"]
    ])("a %s date is skipped rather than bucketed", (_label, date) => {
      const metrics = render({
        dashboard: { workouts: [{ id: "w1", date, duration: 45 }] }
      });

      expect(metrics.last7Workouts).toHaveLength(0);
    });

    test("a date outside the window is excluded", () => {
      const metrics = render({
        dashboard: { workouts: [{ id: "w1", date: "2026-01-01", duration: 45 }] }
      });

      expect(metrics.last7Workouts).toHaveLength(0);
    });
  });

  describe("deduplication", () => {
    test("the same id from both sources counts once", () => {
      const row = { id: "w1", date: "2026-03-02", duration: 45 };
      const metrics = render({
        dashboard: { workoutSessions: [row], workouts: [{ ...row }] }
      });

      expect(metrics.workouts).toHaveLength(1);
    });

    test("two rows with no id but identical content count once", () => {
      // Older rows have no id, so the content is the key. A session logged
      // once but returned by both endpoints would otherwise double the count.
      const row = { date: "2026-03-02", focus: "Legs", duration: 45, notes: "Felt good" };
      const metrics = render({
        dashboard: { workoutSessions: [row], workouts: [{ ...row }] }
      });

      expect(metrics.workouts).toHaveLength(1);
    });

    test("two rows differing only in notes are kept apart", () => {
      const base = { date: "2026-03-02", focus: "Legs", duration: 45 };
      const metrics = render({
        dashboard: {
          workoutSessions: [{ ...base, notes: "Morning" }],
          workouts: [{ ...base, notes: "Evening" }]
        }
      });

      expect(metrics.workouts).toHaveLength(2);
    });

    test("rows differing only in their exercise list are kept apart", () => {
      const base = { date: "2026-03-02", focus: "Legs", duration: 45 };
      const metrics = render({
        dashboard: {
          workoutSessions: [{ ...base, exercises: ["Squat"] }],
          workouts: [{ ...base, exercises: ["Deadlift"] }]
        }
      });

      expect(metrics.workouts).toHaveLength(2);
    });

    test("rows with nothing to key on are all kept", () => {
      // Dropping them would hide data; keeping them is the safer failure.
      const metrics = render({
        dashboard: { workoutSessions: [{}, {}] }
      });

      expect(metrics.workouts).toHaveLength(2);
    });

    test("calorie, meal and metric rows dedupe too", () => {
      const metrics = render({
        dashboard: {
          calories: [
            { id: "c1", date: "2026-03-02", calories: 2200 },
            { id: "c1", date: "2026-03-02", calories: 2200 }
          ],
          mealLogs: [
            { id: "m1", date: "2026-03-02", name: "Oats" },
            { id: "m1", date: "2026-03-02", name: "Oats" }
          ],
          progressMetrics: [
            { id: "p1", date: "2026-03-02", weightLb: 170 },
            { id: "p1", date: "2026-03-02", weightLb: 170 }
          ]
        }
      });

      expect(metrics.calories).toHaveLength(1);
      expect(metrics.mealLogs).toHaveLength(1);
      expect(metrics.progressMetrics).toHaveLength(1);
    });

    test.each([
      ["workouts", "workouts"],
      ["calories", "calories"],
      ["mealLogs", "mealLogs"],
      ["progressMetrics", "progressMetrics"]
    ])("a non-array %s is treated as empty", (prop, key) => {
      const metrics = render({ dashboard: { [prop]: "nope" } });
      expect(metrics[key]).toEqual([]);
    });

    test("a non-array plans field is treated as empty", () => {
      expect(() => render({ dashboard: { plans: "nope" } })).not.toThrow();
    });
  });

  describe("week-over-week trends", () => {
    // Today is 2026-03-02, so the last window is Feb 24 to Mar 2 and the one
    // before it is Feb 17 to Feb 23.
    const thisWeek = "2026-03-01";
    const lastWeek = "2026-02-20";

    // The end of the previous window is not load-bearing. The two checks are
    // an if/else-if, so anything inside the current window is claimed before
    // the previous-window test runs, and extending that window forward
    // overlaps only territory the first branch already took.
    test("counts workouts against the week before", () => {
      const metrics = render({
        dashboard: {
          workouts: [
            { id: "a", date: thisWeek, duration: 45 },
            { id: "b", date: thisWeek, duration: 45 },
            { id: "c", date: lastWeek, duration: 45 }
          ]
        }
      });

      expect(metrics.weeklyTrends.workouts).toBe(1);
    });

    test("reports a decline as a negative", () => {
      const metrics = render({
        dashboard: {
          workouts: [
            { id: "a", date: lastWeek, duration: 45 },
            { id: "b", date: lastWeek, duration: 45 }
          ]
        }
      });

      expect(metrics.weeklyTrends.workouts).toBe(-2);
    });

    test("compares average calories, not totals", () => {
      // Two days at 2000 against one day at 1800 is a rise of 200, not 2200.
      const metrics = render({
        dashboard: {
          calories: [
            { id: "a", date: thisWeek, calories: 2000 },
            { id: "b", date: "2026-02-28", calories: 2000 },
            { id: "c", date: lastWeek, calories: 1800 }
          ]
        }
      });

      expect(metrics.weeklyTrends.calories).toBe(200);
    });

    test("reports the latest weight and its change", () => {
      const metrics = render({
        dashboard: {
          progressMetrics: [
            { id: "p1", date: "2026-03-01", weightLb: 168 },
            { id: "p2", date: "2026-02-20", weightLb: 172 }
          ]
        }
      });

      expect(metrics.weeklyTrends.latestWeight).toBe(168);
      expect(metrics.weeklyTrends.weightDelta).toBe(-4);
    });

    test("the latest weight is the newest logged, whatever order it arrives in", () => {
      const metrics = render({
        dashboard: {
          progressMetrics: [
            { id: "p2", date: "2026-02-20", weightLb: 172 },
            { id: "p1", date: "2026-03-01", weightLb: 168 }
          ]
        }
      });

      expect(metrics.weeklyTrends.latestWeight).toBe(168);
    });

    test("a single weight log has no delta to report", () => {
      const metrics = render({
        dashboard: { progressMetrics: [{ id: "p1", date: "2026-03-01", weightLb: 168 }] }
      });

      expect(metrics.weeklyTrends.latestWeight).toBe(168);
      expect(metrics.weeklyTrends.weightDelta).toBeNull();
    });

    test("no weight logs at all report nothing rather than zero", () => {
      // A zero would render as a real reading of 0 lb.
      const metrics = render();

      expect(metrics.weeklyTrends.latestWeight).toBeNull();
      expect(metrics.weeklyTrends.weightDelta).toBeNull();
    });

    test("rows with an unusable weight are ignored", () => {
      const metrics = render({
        dashboard: {
          progressMetrics: [
            { id: "p1", date: "2026-03-01", weightLb: "not a number" },
            { id: "p2", date: "2026-02-20", weightLb: 172 }
          ]
        }
      });

      expect(metrics.weeklyTrends.latestWeight).toBe(172);
    });
  });

  describe("goals and progress", () => {
    test("uses the account's goals when there are any", () => {
      const metrics = render({
        dashboard: { goals: { weeklyWorkouts: 5, targetCalories: 2500 } },
        goalForm: { weeklyWorkouts: 2, targetCalories: 1800 }
      });

      expect(metrics.weeklyGoal).toBe(5);
      expect(metrics.calorieGoal).toBe(2500);
    });

    test("falls back to the form while they are still being edited", () => {
      const metrics = render({
        dashboard: { goals: null },
        goalForm: { weeklyWorkouts: 2, targetCalories: 1800 }
      });

      expect(metrics.weeklyGoal).toBe(2);
      expect(metrics.calorieGoal).toBe(1800);
    });

    test("an empty week averages to zero rather than dividing by no days", () => {
      const metrics = render();

      expect(metrics.avgCalories).toBe(0);
      expect(Number.isFinite(metrics.calorieProgress)).toBe(true);
      expect(metrics.calorieProgress).toBe(0);
    });

    test("defaults when neither supplies one", () => {
      const metrics = render({ dashboard: { goals: {} }, goalForm: {} });

      expect(metrics.weeklyGoal).toBe(3);
      expect(metrics.calorieGoal).toBe(2200);
    });

    test("a zero weekly goal is read as no goal and takes the default", () => {
      // `Number(goals.weeklyWorkouts || 3)` -- the zero never reaches the
      // `Math.max(..., 1)` below it, so the floor guards a negative or an
      // unparseable value rather than a zero. A goal of no workouts is not a
      // goal, so defaulting is right; what matters is that it stays finite.
      const metrics = render({ dashboard: { goals: { weeklyWorkouts: 0 } } });

      expect(metrics.weeklyGoal).toBe(3);
      expect(Number.isFinite(metrics.workoutProgress)).toBe(true);
    });

    test("a negative weekly goal is floored at one rather than dividing by a negative", () => {
      const metrics = render({ dashboard: { goals: { weeklyWorkouts: -5 } } });

      expect(metrics.weeklyGoal).toBe(1);
      expect(Number.isFinite(metrics.workoutProgress)).toBe(true);
    });

    test("every goal the server can produce yields a finite progress", () => {
      // Scoped to the contract rather than to anything stronger. An
      // unparseable goal really does make `workoutProgress` NaN -- the
      // `|| 3` only catches falsy values, so "lots" survives to `Number()`
      // and the division below it. That is out of contract rather than a live
      // bug: the goal is clamped to 1-7 by the write route and re-clamped on
      // read in dashboardDataBuildersService, and the form field it comes from
      // is a number input, which yields "" rather than text. Worth knowing
      // before this hook is fed from anywhere else.
      [1, 3, 7, "3", null, undefined, ""].forEach((weeklyWorkouts) => {
        const metrics = render({ dashboard: { goals: { weeklyWorkouts } } });

        expect(Number.isFinite(metrics.weeklyGoal)).toBe(true);
        expect(Number.isFinite(metrics.workoutProgress)).toBe(true);
      });
    });

    test("progress is capped at a hundred percent", () => {
      const metrics = render({
        dashboard: {
          goals: { weeklyWorkouts: 1 },
          workouts: [
            { id: "a", date: "2026-03-01", duration: 45 },
            { id: "b", date: "2026-03-02", duration: 45 }
          ]
        }
      });

      expect(metrics.workoutProgress).toBe(100);
    });

    test.each([
      [0, "Weekly workout goal reached."],
      [1, "At this pace"],
      [3, "Log a workout to start your pace estimate."]
    ])("with %i workouts logged the pace text reports accordingly", (count, expected) => {
      // All three branches are reachable here, unlike the preview's copy of
      // this logic where the week is built to satisfy its own goal.
      const metrics = render({
        dashboard: {
          goals: { weeklyWorkouts: count === 0 ? 1 : 3 },
          workouts:
            count === 3
              ? []
              : Array.from({ length: count === 0 ? 2 : count }, (_, i) => ({
                  id: String(i),
                  date: "2026-03-01",
                  duration: 45
                }))
        }
      });

      expect(metrics.goalPaceText).toContain(expected);
    });
  });

  describe("buildLinePath", () => {
    test("an empty series still yields a path rather than nothing", () => {
      const metrics = render();
      expect(metrics.buildLinePath([])).toMatch(/^M/);
    });

    test("a single value yields a single usable point", () => {
      // "MNaN,NaN" matches /^M/ and contains no "L" either, so the shape alone
      // says nothing. A one-point series is what a brand-new account has, and
      // the step divides by length - 1.
      const metrics = render();
      const path = metrics.buildLinePath([5]);

      expect(path).toMatch(/^M[\d.]+,[\d.]+$/);
      expect(path).not.toContain("NaN");
    });

    test("a flat series does not divide by a zero range", () => {
      // The `|| 1` on the range is unreachable: `max` is taken against 1 and
      // `min` against 0, so the range is always at least 1. Swept and
      // confirmed, which is why removing it survives mutation testing.
      const metrics = render();
      const path = metrics.buildLinePath([2, 2, 2]);

      expect(path).not.toContain("NaN");
      expect(path).not.toContain("Infinity");
    });

    test("all zeroes stay finite too", () => {
      const metrics = render();
      expect(metrics.buildLinePath([0, 0, 0])).not.toContain("NaN");
    });
  });

  describe("the trend windows", () => {
    test("the week has seven points and the month thirty", () => {
      const metrics = render();

      expect(metrics.trendRanges.week.keys).toHaveLength(7);
      expect(metrics.trendRanges.month.keys).toHaveLength(30);
    });

    test("active days count only the days with a workout", () => {
      const metrics = render({
        dashboard: {
          workouts: [
            { id: "a", date: "2026-03-01", duration: 45 },
            { id: "b", date: "2026-03-01", duration: 30 },
            { id: "c", date: "2026-03-02", duration: 45 }
          ]
        }
      });

      // Two calendar days, three sessions.
      expect(metrics.trendRanges.week.activeDays).toBe(2);
    });

    test("an empty week averages calories to zero rather than NaN", () => {
      const metrics = render();
      expect(metrics.trendRanges.week.avgCalories).toBe(0);
    });

    test("an untracked day scores as rested rather than as zero recovery", () => {
      // With nothing logged the score is 78 with the 8-point rest bonus and no
      // penalties: 86. Zero would read as a week of total exhaustion, which is
      // the opposite of what no data means.
      const metrics = render();
      expect(metrics.trendRanges.week.avgRecovery).toBe(86);
    });

    test("a hard training day scores lower than a rest day", () => {
      const metrics = render({
        dashboard: {
          workouts: [{ id: "a", date: "2026-03-02", duration: 90 }]
        }
      });
      const keys = metrics.trendRanges.week.keys;
      const todayIndex = keys.indexOf("2026-03-02");

      expect(metrics.trendRanges.week.recoverySeries[todayIndex]).toBeLessThan(86);
    });

    test("a longer session scores lower than a short one", () => {
      // Two training days, so the rest bonus is absent from both and only the
      // training load can explain the difference. Comparing a session against
      // a rest day does not discriminate: losing the bonus alone is enough.
      const scoreFor = (duration) => {
        const metrics = render({
          dashboard: { workouts: [{ id: "a", date: "2026-03-02", duration }] }
        });
        const index = metrics.trendRanges.week.keys.indexOf("2026-03-02");
        return metrics.trendRanges.week.recoverySeries[index];
      };

      expect(scoreFor(90)).toBeLessThan(scoreFor(15));
    });

    test("the recovery score stays inside its own bounds", () => {
      const metrics = render({
        dashboard: {
          goals: { targetCalories: 2000 },
          calories: [{ id: "c", date: "2026-03-02", calories: 9000 }],
          workouts: [{ id: "a", date: "2026-03-02", duration: 600 }]
        }
      });

      metrics.trendRanges.week.recoverySeries.forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(30);
        expect(value).toBeLessThanOrEqual(95);
      });
    });
  });

  // The accumulation loop and the weekly average disagreed about the same input.
  // The loop guards with `Number.isNaN` before adding to caloriesByDate; the
  // average reduced `sum + Number(item?.calories || 0)` with no guard at all.
  //
  // One unparseable reading is enough: `sum + NaN` stays NaN for the rest of the
  // fold, so a single bad row takes the whole average with it -- and avgCalories
  // is rendered directly (`Math.round(avgCalories)`) and drives the progress bar
  // width (`width: ${calorieProgress}%`), so the UI shows "NaN" and an invalid
  // style rather than degrading.
  describe("an unparseable reading", () => {
    const buildMetrics = (dashboard) =>
      renderHook(() =>
        useDashboardMetrics({
          dashboard,
          goalForm: { targetCalories: "2200", weeklyWorkouts: "3" },
          formGoal: "Fat loss",
          weekDays,
          latestPlanByWeekday: {}
        })
      ).result.current;

    test("does not poison the weekly calorie average", () => {
      const metrics = buildMetrics({
        calories: [
          { id: "c1", date: "2026-03-01", calories: 2000 },
          { id: "c2", date: "2026-03-02", calories: "not a number" }
        ]
      });

      // It still counts as a day, contributing nothing -- which is what the
      // accumulation loop already did with the same row.
      expect(metrics.avgCalories).toBe(1000);
      expect(Number.isNaN(metrics.calorieProgress)).toBe(false);
    });

    // Only the calorie average was exposed: workout minutes are guarded in their
    // accumulation loop and every consumer reads them through `|| 0`, so there is
    // no unguarded fold over them to poison. Asserting on a `metrics.avg...` key
    // that does not exist would have passed while testing nothing.
    test("still leaves the weekly trend averages finite", () => {
      const metrics = buildMetrics({
        calories: [
          { id: "c1", date: "2026-03-01", calories: 2000 },
          { id: "c2", date: "2026-03-02", calories: "not a number" }
        ]
      });

      expect(Number.isNaN(metrics.trendRanges.week.avgCalories)).toBe(false);
      expect(Number.isNaN(metrics.trendRanges.month.avgCalories)).toBe(false);
    });

    // The counterpart: a real zero is a measurement and still counts as a logged
    // day, so it must keep pulling the average down rather than being skipped.
    test("is not confused with a measured zero", () => {
      const metrics = buildMetrics({
        calories: [
          { id: "c1", date: "2026-03-01", calories: 2000 },
          { id: "c2", date: "2026-03-02", calories: 0 }
        ]
      });

      expect(metrics.avgCalories).toBe(1000);
    });
  });
});
