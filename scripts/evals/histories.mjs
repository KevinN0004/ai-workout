/**
 * The plan gate's history fixtures (roadmap B4): each logs a generated plan's
 * week before the week under test, the way a user would against its days, so
 * the gate can score the week's progression for every plan it generates.
 */

const DAY_MS = 86_400_000;

// The loads each lift is logged at, in turn: one step, a load that rounds
// differently in each unit, and plain ones.
const LOADS = [2.5, 10, 41.3, 60, 100];

const addDays = (key, days) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

let saveOrder = 0;

/**
 * One session per training day of `week`, the generator's days, in the week
 * starting `monday`. `setsFor(prescription, loadKg)` gives a rep prescription's
 * logged sets; a prescription in seconds is logged as its time, with no load.
 */
const logWeek = (week, monday, setsFor) =>
  week.flatMap((day, dayIndex) => {
    if (!day.prescriptions.length) return [];
    const date = addDays(monday, dayIndex);
    saveOrder += 1;
    return [
      {
        date,
        createdAt: new Date(Date.parse(`${date}T18:00:00Z`) + saveOrder).toISOString(),
        exerciseSets: day.prescriptions.map((prescription, index) => ({
          name: prescription.name,
          pattern: null,
          sets: prescription.reps
            ? setsFor(prescription, LOADS[index % LOADS.length])
            : Array.from({ length: prescription.sets }, () => ({
                reps: null,
                seconds: prescription.seconds.max,
                loadKg: null,
                rpe: null
              }))
        }))
      }
    ];
  });

const set = (reps, loadKg, rpe) => ({ reps, seconds: null, loadKg, rpe });

// Every prescribed set at the top of the range, at `rpe`.
const atTop =
  (rpe) =>
  ({ sets, reps }, loadKg) =>
    Array.from({ length: sets }, () => set(reps.max, loadKg, rpe));

/**
 * Each history: a name, and a function from a generated plan's week and the
 * Monday of the week under test to the sessions logged before it.
 */
export const HISTORIES = [
  {
    name: "every set at the top at RPE 8",
    log: (week, weekStart) => logWeek(week, addDays(weekStart, -7), atTop(8))
  },
  {
    name: "every set at the top at RPE 8.5",
    log: (week, weekStart) => logWeek(week, addDays(weekStart, -7), atTop(8.5))
  },
  {
    name: "one set a rep short",
    log: (week, weekStart) =>
      logWeek(week, addDays(weekStart, -7), ({ sets, reps }, loadKg) =>
        Array.from({ length: sets }, (_, index) =>
          set(index === sets - 1 ? reps.max - 1 : reps.max, loadKg, 8)
        )
      )
  },
  {
    name: "one set without an RPE",
    log: (week, weekStart) =>
      logWeek(week, addDays(weekStart, -7), ({ sets, reps }, loadKg) =>
        Array.from({ length: sets }, (_, index) => set(reps.max, loadKg, index === 0 ? null : 8))
      )
  },
  {
    name: "three sessions of rising RPE",
    log: (week, weekStart) =>
      [7, 7.5, 8.5].flatMap((rpe, index) =>
        logWeek(week, addDays(weekStart, -7 * (3 - index)), atTop(rpe))
      )
  },
  {
    name: "a missed week",
    log: (week, weekStart) => logWeek(week, addDays(weekStart, -14), atTop(8))
  },
  {
    name: "five counted weeks",
    log: (week, weekStart) =>
      [5, 4, 3, 2, 1].flatMap((weeksBack) =>
        logWeek(week, addDays(weekStart, -7 * weeksBack), atTop(8))
      )
  },
  {
    name: "seven counted weeks",
    log: (week, weekStart) =>
      [7, 6, 5, 4, 3, 2, 1].flatMap((weeksBack) =>
        logWeek(week, addDays(weekStart, -7 * weeksBack), atTop(8))
      )
  }
];
