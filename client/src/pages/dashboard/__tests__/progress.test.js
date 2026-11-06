import { describe, expect, test } from "vitest";
import { EXERCISES } from "../../../../../server/src/services/planning/exerciseLibrary.js";
import { GROUPS, e1rmOf, liftRecords, prSessions, weeklySets } from "../progress";

// Roadmap B2's arithmetic, against numbers worked by hand. "Today" is
// Wednesday 2026-11-04 throughout: this week starts Monday 2026-11-02, the four
// weeks before it start 2026-10-05, and four weeks before today is 2026-10-07.

const TODAY = "2026-11-04";

let saved = 0;
// A session as the dashboard holds it, saved after every session built before
// it unless `createdAt` says otherwise.
const session = (date, exerciseSets, fields = {}) => {
  saved += 1;
  return {
    id: `s-${saved}`,
    date,
    createdAt: new Date(Date.UTC(2026, 0, 1) + saved * 1000).toISOString(),
    exerciseSets,
    ...fields
  };
};
const exercise = (name, pattern, sets) => ({ name, pattern, sets });
const reps = (count, loadKg = null) => ({ reps: count, seconds: null, loadKg, rpe: null });
const hold = (seconds, loadKg = null) => ({ reps: null, seconds, loadKg, rpe: null });
const times = (count, set) => Array.from({ length: count }, () => set);

describe("GROUPS", () => {
  test("are the spec's six groups, in display order", () => {
    expect(GROUPS.map((group) => [group.label, group.patterns])).toEqual([
      ["Legs", ["squat", "single-leg"]],
      ["Posterior chain", ["hinge", "glutes-calves"]],
      ["Chest & shoulders", ["horizontal-push", "vertical-push"]],
      ["Back", ["horizontal-pull", "vertical-pull"]],
      ["Core", ["core"]],
      ["Arms", ["arms"]]
    ]);
  });
});

describe("e1rmOf", () => {
  test("is Epley's load × (1 + reps / 30)", () => {
    expect(e1rmOf(reps(5, 100))).toBeCloseTo(116.667, 3);
  });

  test("is the load itself for a single rep", () => {
    expect(e1rmOf(reps(1, 100))).toBe(100);
  });

  test("reaches 10 reps, and stops there", () => {
    expect(e1rmOf(reps(10, 100))).toBeCloseTo(133.333, 3);
    expect(e1rmOf(reps(11, 100))).toBeNull();
  });

  test("needs a load above 0", () => {
    expect(e1rmOf(reps(5, 0))).toBeNull();
    expect(e1rmOf(reps(5, null))).toBeNull();
  });

  test("needs at least one rep: a failed set and a hold have none", () => {
    expect(e1rmOf(reps(0, 100))).toBeNull();
    expect(e1rmOf(hold(30, 20))).toBeNull();
  });
});

describe("weeklySets", () => {
  test("a Monday and the Sunday before it fall in different weeks", () => {
    const sessions = [
      session("2026-11-02", [exercise("Barbell back squat", "squat", times(3, reps(5, 100)))]),
      session("2026-11-01", [exercise("Barbell back squat", "squat", times(2, reps(5, 100)))])
    ];

    expect(weeklySets(sessions, TODAY)).toEqual([
      { id: "legs", label: "Legs", thisWeek: 3, average: 0.5 }
    ]);
  });

  test("averages the four weeks before this one, to one decimal", () => {
    const back = (date, count) =>
      session(date, [exercise("Pull-up", "vertical-pull", times(count, reps(8)))]);
    const sessions = [
      back("2026-11-03", 12),
      back("2026-10-27", 10),
      back("2026-10-20", 11),
      back("2026-10-13", 9),
      back("2026-10-05", 11),
      // Five weeks back, and next week: neither is in the window.
      back("2026-10-04", 100),
      back("2026-11-09", 100)
    ];

    // (10 + 11 + 9 + 11) / 4 = 10.25, which is 10.3 to one decimal.
    expect(weeklySets(sessions, TODAY)).toEqual([
      { id: "back", label: "Back", thisWeek: 12, average: 10.3 }
    ]);
  });

  test("counts every set: holds, and sets with no load or RPE", () => {
    const sessions = [
      session("2026-11-03", [exercise("Plank", "core", [hold(30), hold(45), reps(0)])])
    ];

    expect(weeklySets(sessions, TODAY)).toEqual([
      { id: "core", label: "Core", thisWeek: 3, average: 0 }
    ]);
  });

  test("conditioning, mobility and balance count toward no group", () => {
    const sessions = [
      session("2026-11-03", [
        exercise("Brisk walk", "conditioning", [hold(600)]),
        exercise("Cat-cow", "mobility", [reps(10)]),
        exercise("Single-leg stand", "balance", [hold(30)])
      ])
    ];

    expect(weeklySets(sessions, TODAY)).toEqual([]);
  });

  // A typed name has a null pattern, an entry not yet saved has none at all,
  // and a pattern this module does not know is shown rather than dropped.
  test("a set with no known pattern counts as Not sorted, listed last", () => {
    const sessions = [
      session("2026-11-03", [
        exercise("My cable thing", null, [reps(10)]),
        { name: "Not saved yet", sets: [reps(10)] },
        exercise("Box jump", "plyometric", [reps(5)]),
        exercise("Curl", "arms", [reps(12, 10)])
      ])
    ];

    expect(weeklySets(sessions, TODAY)).toEqual([
      { id: "arms", label: "Arms", thisWeek: 1, average: 0 },
      { id: "not-sorted", label: "Not sorted", thisWeek: 3, average: 0 }
    ]);
  });

  test("rows follow GROUPS, and a group with no sets is left out", () => {
    const sessions = [
      session("2026-11-03", [
        exercise("Curl", "arms", [reps(12, 10)]),
        exercise("Romanian deadlift", "hinge", []),
        exercise("Bench press", "horizontal-push", [reps(8, 60)])
      ]),
      session("2026-10-28", [exercise("Lunge", "single-leg", [reps(10)])])
    ];

    expect(weeklySets(sessions, TODAY).map((row) => row.label)).toEqual([
      "Legs",
      "Chest & shoulders",
      "Arms"
    ]);
  });

  test("every library pattern is in one group or deliberately uncounted", () => {
    const uncounted = ["balance", "conditioning", "mobility"];
    const grouped = GROUPS.flatMap((group) => group.patterns);
    const patterns = [...new Set(EXERCISES.map((entry) => entry.pattern))].sort();

    expect([...grouped, ...uncounted].sort()).toEqual(patterns);
    for (const pattern of patterns) {
      const rows = weeklySets([session("2026-11-03", [exercise("x", pattern, [reps(1)])])], TODAY);
      expect(rows.map((row) => row.id)).not.toContain("not-sorted");
    }
  });

  test("gives no rows for no sessions, and skips a session without a date", () => {
    expect(weeklySets([], TODAY)).toEqual([]);
    expect(weeklySets(undefined, TODAY)).toEqual([]);
    expect(weeklySets([session(null, [exercise("Squat", "squat", [reps(5)])])], TODAY)).toEqual([]);
  });

  test("reads a session without exerciseSets as one with none", () => {
    expect(weeklySets([session("2026-11-03", undefined)], TODAY)).toEqual([]);
  });
});

describe("liftRecords", () => {
  test("groups a lift's names in any case and surrounding space, under the latest", () => {
    const sessions = [
      session("2026-10-20", [exercise("Pull-up", "vertical-pull", [reps(8)])]),
      session("2026-11-03", [exercise("  pull-UP ", "vertical-pull", [reps(10)])])
    ];

    expect(liftRecords(sessions, TODAY)).toEqual([
      {
        name: "pull-UP",
        lastDate: "2026-11-03",
        e1rm: null,
        heaviest: null,
        mostReps: { reps: 10, date: "2026-11-03", change: null }
      }
    ]);
  });

  test("the heaviest set is the heavier load, and more reps break a tie", () => {
    const [heavier] = liftRecords(
      [session("2026-11-03", [exercise("Squat", "squat", [reps(8, 90), reps(3, 100)])])],
      TODAY
    );
    const [tied] = liftRecords(
      [
        session("2026-11-03", [
          exercise("Squat", "squat", [reps(3, 100), reps(5, 100), reps(4, 100)])
        ])
      ],
      TODAY
    );

    expect(heavier.heaviest).toEqual({ loadKg: 100, reps: 3, date: "2026-11-03", change: null });
    expect(tied.heaviest).toEqual({ loadKg: 100, reps: 5, date: "2026-11-03", change: null });
  });

  test("the best e1RM is the highest of any set", () => {
    // 90 × 8 is 114, 100 × 3 is 110.
    const [record] = liftRecords(
      [session("2026-11-03", [exercise("Squat", "squat", [reps(3, 100), reps(8, 90)])])],
      TODAY
    );

    expect(record.e1rm.value).toBeCloseTo(114, 6);
    expect(record.e1rm).toMatchObject({ date: "2026-11-03", change: null });
  });

  test("a lift with no load above 0 is a bodyweight lift, with most reps", () => {
    const [record] = liftRecords(
      [
        session("2026-11-03", [
          exercise("Push-up", "horizontal-push", [reps(15, 0), reps(20), reps(18)])
        ])
      ],
      TODAY
    );

    expect(record).toMatchObject({
      e1rm: null,
      heaviest: null,
      mostReps: { reps: 20, date: "2026-11-03", change: null }
    });
  });

  test("a loaded lift has no most-reps record, and past 10 reps no e1RM", () => {
    // 30 lb, the E2E's first squat set, is 13.61 kg.
    const [record] = liftRecords(
      [
        session("2026-11-03", [
          exercise("Dumbbell box squat", "squat", [reps(12, 13.61), reps(11), reps(10)])
        ])
      ],
      TODAY
    );

    expect(record).toEqual({
      name: "Dumbbell box squat",
      lastDate: "2026-11-03",
      e1rm: null,
      heaviest: { loadKg: 13.61, reps: 12, date: "2026-11-03", change: null },
      mostReps: null
    });
  });

  test("a record keeps the date of the first session to reach it", () => {
    const [record] = liftRecords(
      [
        session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])]),
        session("2026-10-27", [exercise("Squat", "squat", [reps(5, 100)])])
      ],
      TODAY
    );

    expect(record.e1rm.date).toBe("2026-10-20");
    expect(record.heaviest.date).toBe("2026-10-20");
    expect(record.lastDate).toBe("2026-10-27");
  });

  test("the change is the record now against the record four weeks before today", () => {
    const [record] = liftRecords(
      [
        // On the cutoff, so it is the record then.
        session("2026-10-07", [exercise("Squat", "squat", [reps(5, 100)])]),
        // A day after it: part of the record now, not then.
        session("2026-10-08", [exercise("Squat", "squat", [reps(5, 102)])]),
        session("2026-11-03", [exercise("Squat", "squat", [reps(5, 105)])])
      ],
      TODAY
    );

    // 105 × 7/6 = 122.5 against 100 × 7/6 = 116.67.
    expect(record.e1rm.value).toBeCloseTo(122.5, 3);
    expect(record.e1rm.change).toBeCloseTo(5.833, 3);
    expect(record.heaviest.change).toBe(5);
  });

  test("a bodyweight lift's change is in reps", () => {
    const [record] = liftRecords(
      [
        session("2026-10-01", [exercise("Pull-up", "vertical-pull", [reps(8)])]),
        session("2026-11-03", [exercise("Pull-up", "vertical-pull", [reps(11)])])
      ],
      TODAY
    );

    expect(record.mostReps).toEqual({ reps: 11, date: "2026-11-03", change: 3 });
  });

  test("there is no change when the record then is missing, or the same", () => {
    const [lateStart] = liftRecords(
      [session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])])],
      TODAY
    );
    const [unbeaten] = liftRecords(
      [
        session("2026-10-01", [exercise("Squat", "squat", [reps(5, 100)])]),
        session("2026-11-02", [exercise("Squat", "squat", [reps(5, 90)])])
      ],
      TODAY
    );

    expect(lateStart.e1rm.change).toBeNull();
    expect(lateStart.heaviest.change).toBeNull();
    expect(unbeaten.e1rm.change).toBeNull();
    expect(unbeaten.heaviest.change).toBeNull();
  });

  // A heavier set at fewer reps is a new heaviest set but the same load would
  // read "up 0 kg", so the heaviest set's change is its load's alone.
  test("the heaviest set's change is in load, and none when the load is the same", () => {
    const [record] = liftRecords(
      [
        session("2026-10-01", [exercise("Squat", "squat", [reps(3, 100)])]),
        session("2026-11-03", [exercise("Squat", "squat", [reps(5, 100)])])
      ],
      TODAY
    );

    expect(record.heaviest).toEqual({ loadKg: 100, reps: 5, date: "2026-11-03", change: null });
  });

  test("lifts come most recently trained first, and holds alone set no record", () => {
    const records = liftRecords(
      [
        session("2026-11-03", [exercise("Bench press", "horizontal-push", [reps(5, 60)])]),
        session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])]),
        session("2026-10-27", [
          exercise("Deadlift", "hinge", [reps(5, 140)]),
          exercise("Plank", "core", [hold(30), hold(60, 10)])
        ])
      ],
      TODAY
    );

    expect(records.map((record) => record.name)).toEqual(["Bench press", "Deadlift", "Squat"]);
  });

  test("gives none for no sessions", () => {
    expect(liftRecords([], TODAY)).toEqual([]);
  });

  // A count that is not a finite number is no count, as toNumberOrNull reads
  // it: Number() would pass Infinity through the at-least-one-rep gate.
  test("a rep count that is not finite reaches no record", () => {
    const sessions = [
      session("2026-11-03", [exercise("Pull-up", "vertical-pull", [reps(Infinity)])])
    ];

    expect(liftRecords(sessions, TODAY)).toEqual([]);
  });
});

describe("prSessions", () => {
  test("a lift's first session sets no record: there is nothing to beat", () => {
    expect(
      prSessions([session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])])])
    ).toEqual(new Map());
  });

  test("a later session that beats the best e1RM and the heaviest set is marked with both", () => {
    const later = session("2026-10-27", [exercise("Squat", "squat", [reps(6, 100)])]);
    const marks = prSessions([
      later,
      session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])])
    ]);

    expect(marks).toEqual(
      new Map([
        [
          later.id,
          [
            { name: "Squat", record: "e1rm" },
            { name: "Squat", record: "heaviest" }
          ]
        ]
      ])
    );
  });

  test("a heavier set past 10 reps is a heaviest-set record alone", () => {
    const later = session("2026-10-27", [exercise("Squat", "squat", [reps(12, 110)])]);
    const marks = prSessions([
      session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])]),
      later
    ]);

    expect(marks.get(later.id)).toEqual([{ name: "Squat", record: "heaviest" }]);
  });

  test("more reps are a record for a bodyweight lift only", () => {
    const pullUps = session("2026-10-27", [exercise("Pull-up", "vertical-pull", [reps(10)])]);
    const marks = prSessions([
      session("2026-10-20", [
        exercise("Pull-up", "vertical-pull", [reps(8)]),
        exercise("Bench press", "horizontal-push", [reps(5, 60)])
      ]),
      pullUps,
      session("2026-10-28", [exercise("Bench press", "horizontal-push", [reps(15)])])
    ]);

    expect(marks).toEqual(new Map([[pullUps.id, [{ name: "Pull-up", record: "reps" }]]]));
  });

  test("matching a record is not beating it", () => {
    const marks = prSessions([
      session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])]),
      session("2026-10-27", [exercise("Squat", "squat", [reps(5, 100)])])
    ]);

    expect(marks).toEqual(new Map());
  });

  test("a first e1RM, after sessions past 10 reps, beats nothing", () => {
    const marks = prSessions([
      session("2026-10-20", [exercise("Squat", "squat", [reps(12, 60)])]),
      session("2026-10-27", [exercise("Squat", "squat", [reps(5, 60)])])
    ]);

    expect(marks).toEqual(new Map());
  });

  test("sessions are walked in date order, then in save order", () => {
    // Saved second on the same day, listed first: only its save time says it
    // came after the 100 kg session.
    const second = session("2026-10-20", [exercise("Squat", "squat", [reps(5, 110)])], {
      createdAt: "2026-10-20T18:00:00.000Z"
    });
    const first = session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])], {
      createdAt: "2026-10-20T08:00:00.000Z"
    });

    expect([...prSessions([second, first]).keys()]).toEqual([second.id]);
  });

  // The record is in the first card and the second is spelled differently, so
  // a lookup that missed the first would drop the set that beat 100 kg.
  test("two cards of one lift in a session count as one, in any case", () => {
    const later = session("2026-10-27", [
      exercise("Squat", "squat", [reps(5, 110)]),
      exercise("SQUAT", "squat", [reps(5, 60)])
    ]);
    const marks = prSessions([
      session("2026-10-20", [exercise("Squat", "squat", [reps(5, 100)])]),
      later
    ]);

    expect(marks.get(later.id)).toEqual([
      { name: "Squat", record: "e1rm" },
      { name: "Squat", record: "heaviest" }
    ]);
  });
});
