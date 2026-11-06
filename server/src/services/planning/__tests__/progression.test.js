import { describe, expect, test } from "vitest";
import {
  STEPS,
  allowedWeekStarts,
  buildProgression,
  clientToday,
  deloadSets,
  liftKeyOf,
  readSet,
  weekStartOf
} from "../progression.js";

// The week's progression (roadmap B4, docs/specs/2026-11-06-adaptive-progression-design.md,
// "The rules"), against hand-worked histories. Each is built from a small plan
// payload and dated sessions, never from generatePlan, so a fixture cannot
// drift with the generator. "Today" is Wednesday 11 Nov 2026: the week starts
// on Monday 9 Nov, the week before runs from 2 to 8 Nov, and the four weeks
// before the week start on 12 Oct.

const TODAY = "2026-11-11";
const ROW = "Seated cable row";

const rx = (name, sets = 3, min = 8, max = 10) => ({
  name,
  sets,
  reps: { min, max },
  seconds: null,
  perSide: false,
  targetRpe: { min: 7, max: 8 }
});

const plank = {
  name: "Plank",
  sets: 3,
  reps: null,
  seconds: { min: 20, max: 30 },
  perSide: false,
  targetRpe: null
};

const planOf = (prescriptions, { level = "Intermediate", injuries = "None" } = {}) => ({
  level,
  injuries,
  payload: {
    version: 1,
    days: [
      { index: 0, weekday: "Monday", title: "Monday - Full body A", lines: [], prescriptions }
    ],
    notes: []
  }
});

// A session on `date`, each exercise's sets given as [reps, loadKg, rpe].
let saveOrder = 0;
const session = (date, exercises = {}) => {
  saveOrder += 1;
  return {
    date,
    createdAt: new Date(Date.parse(`${date}T00:00:00Z`) + saveOrder * 1000).toISOString(),
    exerciseSets: Object.entries(exercises).map(([name, sets]) => ({
      name,
      pattern: null,
      sets: sets.map(([reps, loadKg, rpe]) => ({ reps, seconds: null, loadKg, rpe }))
    }))
  };
};

// Three sets of `reps` at `loadKg` and `rpe`.
const three = (loadKg, rpe = 8, reps = 10) => [
  [reps, loadKg, rpe],
  [reps, loadKg, rpe],
  [reps, loadKg, rpe]
];

const build = (overrides = {}) =>
  buildProgression({
    plan: planOf([rx(ROW)]),
    sessions: [],
    decisions: {},
    today: TODAY,
    notes: "",
    ...overrides
  });

const liftOf = (progression, name = ROW) => progression.lifts.find((lift) => lift.name === name);

// The Mondays of `count` weeks in a row, the last on `last`.
const mondays = (count, last = "2026-11-02") =>
  Array.from({ length: count }, (_, index) => {
    const date = new Date(`${last}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 7 * (count - 1 - index));
    return date.toISOString().slice(0, 10);
  });

describe("the small helpers", () => {
  test("STEPS are 2.5 kg and 5 lb", () => {
    expect(STEPS).toEqual({ kg: 2.5, lb: 5 });
  });

  test("liftKeyOf trims and lower-cases a name", () => {
    expect(liftKeyOf("  Seated CABLE Row ")).toBe("seated cable row");
  });

  test("liftKeyOf reads a missing name as empty, never as the text null", () => {
    expect(liftKeyOf(undefined)).toBe("");
    expect(liftKeyOf(null)).toBe("");
  });

  test.each([
    ["a Monday is its own", "2026-11-09", "2026-11-09"],
    ["a Sunday is the Monday six days before", "2026-11-15", "2026-11-09"],
    ["across a month boundary", "2026-11-01", "2026-10-26"],
    ["across a year boundary", "2026-01-01", "2025-12-29"]
  ])("weekStartOf: %s", (_label, key, monday) => {
    expect(weekStartOf(key)).toBe(monday);
  });

  const NOW = new Date("2026-11-11T12:00:00Z");
  test.each([
    ["the server's own date", "2026-11-11", "2026-11-11"],
    ["a day behind", "2026-11-10", "2026-11-10"],
    ["a day ahead", "2026-11-12", "2026-11-12"],
    ["two days behind", "2026-11-09", "2026-11-11"],
    ["two days ahead", "2026-11-13", "2026-11-11"],
    ["a word", "tomorrow", "2026-11-11"],
    ["a date that does not exist", "2026-02-30", "2026-11-11"],
    ["a missing value", undefined, "2026-11-11"]
  ])("clientToday keeps or replaces %s", (_label, today, expected) => {
    expect(clientToday(today, NOW)).toBe(expected);
  });

  // Date.parse rolls 31 Nov over to 1 Dec, a day the tolerance would accept.
  test("clientToday replaces a date that does not exist, even next to the server's", () => {
    expect(clientToday("2026-11-31", new Date("2026-12-01T12:00:00Z"))).toBe("2026-12-01");
  });

  test.each([
    ["a Wednesday", "2026-11-11T12:00:00Z", ["2026-11-09"]],
    ["a Monday", "2026-11-09T12:00:00Z", ["2026-11-02", "2026-11-09"]],
    ["a Sunday", "2026-11-15T12:00:00Z", ["2026-11-09", "2026-11-16"]]
  ])("allowedWeekStarts on %s", (_label, now, weeks) => {
    expect(allowedWeekStarts(new Date(now))).toEqual(weeks);
  });

  test.each([
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3]
  ])("deloadSets(%i) is %i", (sets, halved) => {
    expect(deloadSets(sets)).toBe(halved);
  });

  test("readSet reads each number, keeping a measured 0 and making nothing of a missing one", () => {
    expect(readSet({ reps: "10", loadKg: 0, rpe: null })).toEqual({
      reps: 10,
      loadKg: 0,
      rpe: null
    });
    expect(readSet({})).toEqual({ reps: null, loadKg: null, rpe: null });
  });
});

describe("buildProgression: the plan and its lifts", () => {
  test("a plan with no saved structure has no progression", () => {
    expect(build({ plan: { ...planOf([]), payload: null } })).toBeNull();
    expect(build({ plan: null })).toBeNull();
  });

  test("answers the week's shape", () => {
    const progression = build({ sessions: [session("2026-11-02", { [ROW]: three(60) })] });
    expect(progression).toEqual({
      weekStart: "2026-11-09",
      deloadWeek: { active: false, count: 1, reason: null, decision: null },
      lifts: [
        {
          name: ROW,
          key: "seated cable row",
          change: "up",
          kg: { from: 60, target: 62.5 },
          lb: { from: 130, target: 135 },
          sets: 3,
          why: "Every set reached 10 reps at RPE 8 or below on Mon 2 Nov",
          decision: null
        }
      ]
    });
  });

  test("a plan saved before prescriptions has a week but no lifts", () => {
    const plan = planOf([]);
    delete plan.payload.days[0].prescriptions;
    expect(build({ plan })).toMatchObject({ weekStart: "2026-11-09", lifts: [] });
  });

  test("a prescription in seconds is not a lift", () => {
    const progression = build({ plan: planOf([rx(ROW), plank]) });
    expect(progression.lifts.map((lift) => lift.name)).toEqual([ROW]);
  });

  test("a lift prescribed twice appears once, under its first prescription", () => {
    const progression = build({ plan: planOf([rx(ROW, 3), rx("seated cable row", 4)]) });
    expect(progression.lifts).toHaveLength(1);
    expect(progression.lifts[0]).toMatchObject({ name: ROW, sets: 3 });
  });

  test("a lift with no load above 0 in the four weeks is none, Pick a load", () => {
    const lift = liftOf(build({ sessions: [session("2026-11-02", { [ROW]: three(0) })] }));
    expect(lift).toMatchObject({
      change: "none",
      kg: null,
      lb: null,
      why: "Pick a load: none logged in the last four weeks"
    });
  });

  test("a missing load is no load, never 0 kg", () => {
    const lift = liftOf(build({ sessions: [session("2026-11-02", { [ROW]: three(null) })] }));
    expect(lift.change).toBe("none");
  });

  test("a bodyweight lift gets no target, even when logged with a load", () => {
    const progression = build({
      plan: planOf([rx("Push-up")]),
      sessions: [session("2026-11-02", { "Push-up": three(10) })]
    });
    expect(liftOf(progression, "Push-up")).toMatchObject({
      change: "none",
      kg: null,
      lb: null,
      why: "Bodyweight: no load to set"
    });
  });

  test("an inverted row is bodyweight, though it needs a barbell to hang from", () => {
    const name = "Inverted row under a racked barbell";
    const progression = build({
      plan: planOf([rx(name)]),
      sessions: [session("2026-11-02", { [name]: three(10) })]
    });
    expect(liftOf(progression, name)).toMatchObject({ change: "none", kg: null });
  });

  // A workout in the week before keeps the missed-week deload out of these.
  const weekBefore = session("2026-11-03", { "Leg press": three(80) });

  test("a load 28 days before the week counts, and one 29 days before does not", () => {
    const counted = build({ sessions: [session("2026-10-12", { [ROW]: three(60) }), weekBefore] });
    const past = build({ sessions: [session("2026-10-11", { [ROW]: three(60) }), weekBefore] });
    expect(liftOf(counted).change).toBe("up");
    expect(liftOf(past).change).toBe("none");
  });

  test("a session in this week does not count yet", () => {
    const lift = liftOf(build({ sessions: [session("2026-11-09", { [ROW]: three(60) })] }));
    expect(lift.change).toBe("none");
  });

  test("logged names match in any case and spacing", () => {
    const lift = liftOf(
      build({ sessions: [session("2026-11-02", { "  seated CABLE row ": three(60) })] })
    );
    expect(lift.change).toBe("up");
  });
});

describe("buildProgression: the working load and the step up", () => {
  test("the working load is the heaviest of the most recent session, not of the window", () => {
    const lift = liftOf(
      build({
        sessions: [
          session("2026-10-26", { [ROW]: three(70, 9, 8) }),
          session("2026-11-02", {
            [ROW]: [
              [10, 57.5, 8],
              [8, 60, 9],
              [10, 50, 7]
            ]
          })
        ]
      })
    );
    expect(lift).toMatchObject({ change: "hold", kg: { from: 60, target: 60 } });
  });

  test("the most recent session is the later save on the same date", () => {
    const first = session("2026-11-02", { [ROW]: three(70, 9, 8) });
    const second = session("2026-11-02", { [ROW]: three(60) });
    const lift = liftOf(build({ sessions: [second, first] }));
    expect(lift).toMatchObject({ change: "up", kg: { from: 60, target: 62.5 } });
  });

  test.each([
    ["three sets of 10 at RPE 8 on 3 x 8-10 goes up", three(60), "up"],
    [
      "one set at 9 reps holds",
      [
        [10, 60, 8],
        [10, 60, 8],
        [9, 60, 8]
      ],
      "hold"
    ],
    [
      "RPE 8.5 holds",
      [
        [10, 60, 8],
        [10, 60, 8],
        [10, 60, 8.5]
      ],
      "hold"
    ],
    [
      "a set with no RPE holds",
      [
        [10, 60, 8],
        [10, 60, 8],
        [10, 60, null]
      ],
      "hold"
    ],
    [
      "two qualifying sets on a 3-set prescription hold",
      [
        [10, 60, 8],
        [10, 60, 8]
      ],
      "hold"
    ],
    ["a lighter back-off set does not block it", [...three(60), [6, 50, 9]], "up"],
    [
      "more reps than the top still go up",
      [
        [12, 60, 7],
        [11, 60, 7.5],
        [10, 60, 8]
      ],
      "up"
    ],
    ["RPE 7 goes up", three(60, 7), "up"]
  ])("%s", (_label, sets, change) => {
    const lift = liftOf(build({ sessions: [session("2026-11-02", { [ROW]: sets })] }));
    expect(lift.change).toBe(change);
  });

  test("a hold says what it waits for", () => {
    const lift = liftOf(build({ sessions: [session("2026-11-02", { [ROW]: three(60, 8, 9) })] }));
    expect(lift.why).toBe(
      "Same load until every set reaches 10 reps at RPE 8 or below (last logged Mon 2 Nov)"
    );
  });
});

describe("buildProgression: the lift deload", () => {
  test("no workout in the week before deloads every lift", () => {
    const progression = build({
      plan: planOf([rx(ROW), rx("Leg press")]),
      sessions: [session("2026-10-26", { [ROW]: three(60), "Leg press": three(100, 9, 8) })]
    });
    for (const lift of progression.lifts) {
      expect(lift.change).toBe("deload");
      expect(lift.why).toBe("No workout logged last week; about 10% lighter to rebuild");
    }
    expect(liftOf(progression).kg).toEqual({ from: 60, target: 55 });
  });

  test("the Sunday before the week counts as the week before", () => {
    const earlier = session("2026-10-26", { [ROW]: three(60) });
    const sunday = build({
      sessions: [earlier, session("2026-11-08", { "Leg press": three(80) })]
    });
    const monday = build({
      sessions: [earlier, session("2026-11-09", { "Leg press": three(80) })]
    });
    expect(liftOf(sunday).change).toBe("up");
    expect(liftOf(monday).change).toBe("deload");
  });

  // Nine reps, short of the top, so that no session of a run could step up.
  const run = (...sessions) =>
    liftOf(
      build({
        sessions: sessions.map(([date, loadKg, rpe]) =>
          session(date, { [ROW]: three(loadKg, rpe, 9) })
        )
      })
    );

  test("RPE 7, 7.5 and 8.5 at one load deloads", () => {
    const lift = run(["2026-10-19", 60, 7], ["2026-10-26", 60, 7.5], ["2026-11-02", 60, 8.5]);
    expect(lift).toMatchObject({
      change: "deload",
      kg: { from: 60, target: 55 },
      why: "RPE rose three sessions in a row, to 8.5 on Mon 2 Nov; about 10% lighter to recover"
    });
  });

  test("RPE 7, 7.5 and 8 holds: the last must be above 8", () => {
    expect(run(["2026-10-19", 60, 7], ["2026-10-26", 60, 7.5], ["2026-11-02", 60, 8]).change).toBe(
      "hold"
    );
  });

  test("two rising sessions hold", () => {
    expect(run(["2026-10-26", 60, 7.5], ["2026-11-02", 60, 8.5]).change).toBe("hold");
  });

  test("a level RPE in the run holds", () => {
    expect(
      run(["2026-10-19", 60, 7.5], ["2026-10-26", 60, 7.5], ["2026-11-02", 60, 9]).change
    ).toBe("hold");
  });

  test("a session with no RPE breaks the run", () => {
    expect(
      run(["2026-10-19", 60, 7], ["2026-10-26", 60, null], ["2026-11-02", 60, 8.5]).change
    ).toBe("hold");
  });

  // A missing RPE compared as a number is 0, which is below anything after it.
  test("a session with no RPE first in the run breaks it too", () => {
    expect(
      run(["2026-10-19", 60, null], ["2026-10-26", 60, 7.5], ["2026-11-02", 60, 8.5]).change
    ).toBe("hold");
  });

  test("a load change breaks the run", () => {
    expect(
      run(["2026-10-19", 57.5, 7], ["2026-10-26", 60, 7.5], ["2026-11-02", 60, 8.5]).change
    ).toBe("hold");
  });

  test("the average RPE of the sets at the load is what rises", () => {
    const lift = liftOf(
      build({
        sessions: [
          session("2026-10-19", { [ROW]: three(60, 7, 9) }),
          session("2026-10-26", { [ROW]: three(60, 7.5, 9) }),
          session("2026-11-02", {
            [ROW]: [
              [9, 60, 8],
              [9, 60, 9],
              [9, 60, null],
              [9, 50, 6]
            ]
          })
        ]
      })
    );
    expect(lift.change).toBe("deload");
    expect(lift.why).toContain("to 8.5 on Mon 2 Nov");
  });
});

describe("buildProgression: rounding in each unit", () => {
  const lastWeek = (sets) => liftOf(build({ sessions: [session("2026-11-02", { [ROW]: sets })] }));
  const missed = (loadKg) =>
    liftOf(build({ sessions: [session("2026-10-26", { [ROW]: three(loadKg, 8, 9) })] }));

  test("60 kg goes up to 62.5 kg, and from 130 lb to 135 lb", () => {
    expect(lastWeek(three(60))).toMatchObject({
      kg: { from: 60, target: 62.5 },
      lb: { from: 130, target: 135 }
    });
  });

  test("each unit rounds to its nearest step, not the step below", () => {
    expect(lastWeek(three(61.3, 8, 9))).toMatchObject({
      kg: { from: 62.5, target: 62.5 },
      lb: { from: 135, target: 135 }
    });
  });

  test("a load under half a step still reads as one step", () => {
    expect(lastWeek(three(1, 8, 9))).toMatchObject({
      kg: { from: 2.5, target: 2.5 },
      lb: { from: 5, target: 5 }
    });
  });

  test("60 kg deloads to 55 kg, and 130 lb to 115 lb", () => {
    expect(missed(60)).toMatchObject({
      kg: { from: 60, target: 55 },
      lb: { from: 130, target: 115 }
    });
  });

  test("10 kg deloads to 7.5 kg: always at least one step lighter", () => {
    expect(missed(10)).toMatchObject({
      kg: { from: 10, target: 7.5 },
      lb: { from: 20, target: 15 }
    });
  });

  test("a lift already at one step holds instead of going lighter", () => {
    expect(missed(2.5)).toMatchObject({
      change: "hold",
      kg: { from: 2.5, target: 2.5 },
      lb: { from: 5, target: 5 },
      why: "Already at the lightest step, so it holds instead of going lighter"
    });
  });
});

describe("buildProgression: the deload week", () => {
  // One workout each Monday of `count` weeks in a row, the last in the week
  // before; the last one steps the row up if the lift rules apply.
  const weeks = (count, last = "2026-11-02") =>
    mondays(count, last).map((date) => session(date, { [ROW]: three(60) }));
  const deloadWeekOf = (sessions, level = "Intermediate") =>
    build({ plan: planOf([rx(ROW)], { level }), sessions }).deloadWeek;

  test("five counted weeks before this one make it a deload week, four do not", () => {
    expect(deloadWeekOf(weeks(5))).toEqual({
      active: true,
      count: 5,
      reason: "Your 6th week in a row: same loads, half the sets",
      decision: null
    });
    expect(deloadWeekOf(weeks(4))).toMatchObject({ active: false, count: 4, reason: null });
  });

  test("a beginner's first comes after seven, then every sixth", () => {
    expect(deloadWeekOf(weeks(7), "Beginner")).toMatchObject({
      active: true,
      count: 7,
      reason: "Your 8th week in a row: same loads, half the sets"
    });
    expect(deloadWeekOf(weeks(6), "Beginner").active).toBe(false);
    expect(deloadWeekOf(weeks(13), "Beginner")).toMatchObject({ active: true, count: 5 });
    expect(deloadWeekOf(weeks(12), "Beginner").active).toBe(false);
  });

  test("the level is read in any case, and an unknown one as intermediate", () => {
    expect(deloadWeekOf(weeks(5), " BEGINNER ").active).toBe(false);
    expect(deloadWeekOf(weeks(5), "Elite").active).toBe(true);
    expect(deloadWeekOf(weeks(5), "").active).toBe(true);
  });

  test("a missed week resets the count", () => {
    const sessions = [...weeks(3, "2026-09-28"), ...weeks(4)];
    expect(deloadWeekOf(sessions)).toMatchObject({ active: false, count: 4 });
  });

  test("a deload week resets the count, trained or not", () => {
    expect(deloadWeekOf(weeks(10))).toMatchObject({ active: false, count: 4 });
    expect(deloadWeekOf(weeks(11)).active).toBe(true);
    // 24 Aug to 21 Sep, then 28 Sep is the deload week and is not trained.
    const untrained = [...weeks(5, "2026-09-21"), ...weeks(5)];
    expect(deloadWeekOf(untrained).active).toBe(true);
  });

  test("several workouts in a week count it once", () => {
    const sessions = [...weeks(4), session("2026-11-04", { "Leg press": three(80) })];
    expect(deloadWeekOf(sessions)).toMatchObject({ active: false, count: 4 });
  });

  test("no workouts at all is no deload week", () => {
    expect(deloadWeekOf([])).toEqual({ active: false, count: 0, reason: null, decision: null });
  });

  test("in a deload week each lift holds at its load, at half the sets", () => {
    const progression = build({
      plan: planOf([rx(ROW), rx("Leg press", 5)]),
      sessions: weeks(5)
    });
    expect(liftOf(progression)).toMatchObject({
      change: "hold",
      kg: { from: 60, target: 60 },
      sets: 2,
      why: "Deload week: same load, half the sets"
    });
    expect(liftOf(progression, "Leg press")).toMatchObject({ change: "none", sets: 3 });
  });

  test("a deload week comes before a lift deload", () => {
    const rising = mondays(5).map((date, index) =>
      session(date, { [ROW]: three(60, [7, 7, 7, 7.5, 8.5][index], 9) })
    );
    expect(liftOf(build({ sessions: rising }))).toMatchObject({
      change: "hold",
      why: "Deload week: same load, half the sets"
    });
  });

  test("a lift deload comes before a step up", () => {
    const lift = liftOf(build({ sessions: [session("2026-10-26", { [ROW]: three(60) })] }));
    expect(lift.change).toBe("deload");
  });
});

describe("buildProgression: asked first", () => {
  const BOX = "Dumbbell box squat";
  const GOBLET = "Dumbbell goblet squat";
  const lastWeek = (name, sets, plan) =>
    liftOf(build({ plan, sessions: [session("2026-11-02", { [name]: sets })] }), name);

  test("a step up on the knee regression is asked when the injury answer names the knee", () => {
    expect(lastWeek(BOX, three(20), planOf([rx(BOX)], { injuries: "Knee" }))).toMatchObject({
      change: "ask",
      kg: { from: 20, target: 22.5 },
      why: "Every set reached 10 reps at RPE 8 or below on Mon 2 Nov. It asks first because your injury answer or note names your knee",
      decision: null
    });
  });

  test("a step up on a lift tagged for the knee is asked when the profile note names it", () => {
    const lift = liftOf(
      build({
        plan: planOf([rx(GOBLET)]),
        notes: "sore knee",
        sessions: [session("2026-11-02", { [GOBLET]: three(20) })]
      }),
      GOBLET
    );
    expect(lift.change).toBe("ask");
  });

  test("a hold and a deload on a flagged lift stay automatic", () => {
    const plan = planOf([rx(BOX)], { injuries: "Knee" });
    expect(lastWeek(BOX, three(20, 8, 9), plan).change).toBe("hold");
    const missed = liftOf(
      build({ plan, sessions: [session("2026-10-26", { [BOX]: three(20) })] }),
      BOX
    );
    expect(missed.change).toBe("deload");
  });

  test("a lift flagged for an area nobody named is not asked", () => {
    expect(lastWeek(GOBLET, three(20), planOf([rx(GOBLET)])).change).toBe("up");
    expect(lastWeek(BOX, three(20), planOf([rx(BOX)], { injuries: "Shoulder" })).change).toBe("up");
  });
});

describe("buildProgression: answers", () => {
  const lastWeek = { sessions: [session("2026-11-02", { [ROW]: three(60) })] };
  const missed = { sessions: [session("2026-10-26", { [ROW]: three(60) })] };
  const BOX = "Dumbbell box squat";
  const asked = {
    plan: planOf([rx(BOX)], { injuries: "Knee" }),
    sessions: [session("2026-11-02", { [BOX]: three(20) })]
  };
  const answer = (setup, decision, name = ROW) =>
    liftOf(build({ ...setup, decisions: { [liftKeyOf(name)]: decision } }), name);

  test("undo turns a step up into a hold", () => {
    expect(answer(lastWeek, "undo")).toMatchObject({
      change: "hold",
      kg: { from: 60, target: 60 },
      lb: { from: 130, target: 130 },
      why: "Every set reached 10 reps at RPE 8 or below on Mon 2 Nov",
      decision: "undo"
    });
  });

  test("undo turns a lift deload into a hold", () => {
    expect(answer(missed, "undo")).toMatchObject({
      change: "hold",
      kg: { from: 60, target: 60 },
      decision: "undo"
    });
  });

  test("accept turns an ask into a step up, and decline into a hold", () => {
    expect(answer(asked, "accept", BOX)).toMatchObject({
      change: "up",
      kg: { from: 20, target: 22.5 },
      decision: "accept"
    });
    expect(answer(asked, "decline", BOX)).toMatchObject({
      change: "hold",
      kg: { from: 20, target: 20 },
      decision: "decline"
    });
  });

  test.each([
    [
      "undo on a hold",
      { sessions: [session("2026-11-02", { [ROW]: three(60, 8, 9) })] },
      "undo",
      ROW,
      "hold"
    ],
    ["accept on an automatic step up", lastWeek, "accept", ROW, "up"],
    ["decline on a deload", missed, "decline", ROW, "deload"],
    ["undo on an ask", asked, "undo", BOX, "ask"],
    ["normal on a lift", lastWeek, "normal", ROW, "up"]
  ])("%s is ignored", (_label, setup, decision, name, change) => {
    expect(answer(setup, decision, name)).toMatchObject({ change, decision: null });
  });

  test("normal turns a deload week into a usual one, on the lift rules", () => {
    const sessions = mondays(5).map((date) => session(date, { [ROW]: three(60) }));
    const progression = build({ sessions, decisions: { "": "normal" } });
    expect(progression.deloadWeek).toMatchObject({ active: true, decision: "normal" });
    expect(liftOf(progression)).toMatchObject({ change: "up", sets: 3 });
  });

  test("normal outside a deload week is ignored", () => {
    expect(build({ ...lastWeek, decisions: { "": "normal" } }).deloadWeek.decision).toBeNull();
  });
});
