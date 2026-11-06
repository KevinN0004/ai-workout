import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../../db/prisma.js";
import { createWorkoutSessionRepository, mapWorkoutSession } from "../workoutSessionRepository.js";

// Pins a session's sets against real Postgres: they are saved with the
// session in one transaction, read back grouped and in order, replaced only
// when sent, and removed with the session or the user. The table's own checks
// are pinned too, because the database is the last guard on every number.

const { saveWorkoutSession } = createWorkoutSessionRepository({ prisma });

const createUser = (email) =>
  prisma.appUser.create({ data: { email, passwordHash: "x", legacyUserId: email } });

const bench = {
  name: "Dumbbell bench press",
  sets: [
    { reps: 10, seconds: null, loadKg: 22.5, rpe: 7 },
    { reps: 8, seconds: null, loadKg: 22.5, rpe: 8.5 }
  ]
};
const plank = { name: "Plank", sets: [{ reps: null, seconds: 30, loadKg: null, rpe: null }] };

// An exercise as a read returns it: tagged with its library pattern, or null.
const tagged = (exercise, pattern = null) => ({ ...exercise, pattern });
const benchRead = tagged(bench, "horizontal-push");
const plankRead = tagged(plank);

const save = (userId, session) =>
  saveWorkoutSession({
    userId,
    session: { id: "w-1", date: "2026-11-05", focus: "Push", duration: 45, ...session }
  });

const setRowsOf = (userId) =>
  prisma.exerciseSet.findMany({
    where: { userId },
    orderBy: [{ exerciseOrder: "asc" }, { setNumber: "asc" }]
  });

describe("a session's sets", () => {
  let user;

  beforeEach(async () => {
    await prisma.appUser.deleteMany({});
    user = await createUser("sets@example.com");
  });

  afterAll(async () => {
    await prisma.appUser.deleteMany({});
    await prisma.$disconnect();
  });

  test("are saved with the session and read back grouped, in order", async () => {
    const saved = await save(user.id, { exerciseSets: [bench, plank] });

    expect(saved.exerciseSets).toEqual([benchRead, plankRead]);
    const rows = await setRowsOf(user.id);
    expect(rows.map((row) => [row.exerciseOrder, row.exerciseName, row.setNumber])).toEqual([
      [0, "Dumbbell bench press", 1],
      [0, "Dumbbell bench press", 2],
      [1, "Plank", 1]
    ]);
  });

  // Postgres returns rows in no promised order, and usually in the order they
  // went in, so these are written last set first: only the read's own order
  // puts them back.
  test("read back in exercise and set order, however they were stored", async () => {
    const saved = await save(user.id, {});
    const sessionId = (await prisma.workoutSession.findFirst({ where: { userId: user.id } })).id;
    const row = (exerciseOrder, setNumber, reps) => ({
      sessionId,
      userId: user.id,
      exerciseOrder,
      exerciseName: exerciseOrder === 0 ? "Squat" : "Row",
      setNumber,
      reps
    });
    await prisma.exerciseSet.createMany({
      data: [row(1, 2, 12), row(1, 1, 11), row(0, 2, 6), row(0, 1, 5)]
    });

    const read = await save(user.id, { id: saved.id });

    expect(read.exerciseSets.map((e) => [e.name, e.sets.map((s) => s.reps)])).toEqual([
      ["Squat", [5, 6]],
      ["Row", [11, 12]]
    ]);
  });

  // A warm-up card and a working card can share a name; each stays its own.
  test("two cards with the same name stay two exercises", async () => {
    const warmUp = { name: "Squat", sets: [{ reps: 10, seconds: null, loadKg: 40, rpe: null }] };
    const working = { name: "Squat", sets: [{ reps: 5, seconds: null, loadKg: 100, rpe: 8 }] };

    const saved = await save(user.id, { exerciseSets: [warmUp, working] });

    expect(saved.exerciseSets).toEqual([tagged(warmUp), tagged(working)]);
  });

  test("a session saved without sets reads back with none", async () => {
    const saved = await save(user.id, {});

    expect(saved.exerciseSets).toEqual([]);
  });

  test("saving the session again with sets replaces them", async () => {
    await save(user.id, { exerciseSets: [bench, plank] });

    const saved = await save(user.id, { exerciseSets: [plank] });

    expect(saved.exerciseSets).toEqual([plankRead]);
    expect(await setRowsOf(user.id)).toHaveLength(1);
  });

  // The old bundle sends no exerciseSets, so an update from it must not wipe
  // the sets a newer client saved.
  test("saving the session again without sets keeps the stored ones", async () => {
    await save(user.id, { exerciseSets: [bench] });

    const saved = await save(user.id, { notes: "edited" });

    expect(saved.notes).toBe("edited");
    expect(saved.exerciseSets).toEqual([benchRead]);
  });

  test("0 reps and 0 kg are kept as measurements, and blanks read as null", async () => {
    const failed = { name: "Pull-up", sets: [{ reps: 0, seconds: null, loadKg: 0, rpe: 10 }] };
    const blank = { name: "Push-up", sets: [{ reps: 12, seconds: null, loadKg: null, rpe: null }] };

    const saved = await save(user.id, { exerciseSets: [failed, blank] });

    expect(saved.exerciseSets).toEqual([
      tagged(failed, "vertical-pull"),
      tagged(blank, "horizontal-push")
    ]);
  });

  // A set the table refuses must take the session row down with it: half a
  // workout is worse than none.
  test("a set the table refuses leaves neither the session nor any set", async () => {
    const tooHeavy = { name: "Squat", sets: [{ reps: 5, seconds: null, loadKg: 1500, rpe: null }] };

    await expect(save(user.id, { exerciseSets: [bench, tooHeavy] })).rejects.toThrow();

    expect(await prisma.workoutSession.count({ where: { userId: user.id } })).toBe(0);
    expect(await setRowsOf(user.id)).toHaveLength(0);
  });

  test("each set belongs to the session's user, whatever the input says", async () => {
    const other = await createUser("other@example.com");

    await save(user.id, { userId: other.id, exerciseSets: [bench] });

    expect(await setRowsOf(user.id)).toHaveLength(2);
    expect(await setRowsOf(other.id)).toHaveLength(0);
  });

  test("are removed with their session, and with their user", async () => {
    await save(user.id, { exerciseSets: [bench] });

    await prisma.workoutSession.deleteMany({ where: { userId: user.id } });
    expect(await setRowsOf(user.id)).toHaveLength(0);

    await save(user.id, { id: "w-2", exerciseSets: [bench] });
    await prisma.appUser.delete({ where: { id: user.id } });
    expect(await prisma.exerciseSet.count()).toBe(0);
  });
});

// The checks in 006_exercise_sets.sql, one refused value each. Raw inserts,
// because the repository is not the only thing that could ever write here.
describe("the exercise_sets checks", () => {
  let sessionId;
  let userId;

  beforeEach(async () => {
    await prisma.appUser.deleteMany({});
    const user = await createUser("checks@example.com");
    userId = user.id;
    sessionId = (await prisma.workoutSession.create({ data: { userId } })).id;
  });

  const insert = (fields) =>
    prisma.exerciseSet.create({
      data: {
        sessionId,
        userId,
        exerciseOrder: 0,
        exerciseName: "Squat",
        setNumber: 1,
        reps: 5,
        ...fields
      }
    });

  test("accepts a set at the edge of every range", async () => {
    await expect(
      insert({ exerciseOrder: 17, setNumber: 20, reps: 200, loadKg: 1000, rpe: 10 })
    ).resolves.toBeTruthy();
  });

  test.each([
    ["an exercise past the 18th", { exerciseOrder: 18 }],
    ["a set past the 20th", { setNumber: 21 }],
    ["set number 0", { setNumber: 0 }],
    ["reps past 200", { reps: 201 }],
    ["negative reps", { reps: -1 }],
    ["a hold of 0 seconds", { reps: null, seconds: 0 }],
    ["a hold past an hour", { reps: null, seconds: 3601 }],
    ["a load past 1000 kg", { loadKg: 1000.01 }],
    ["a negative load", { loadKg: -1 }],
    ["an RPE past 10", { rpe: 10.5 }],
    ["an RPE below 1", { rpe: 0.5 }],
    ["both reps and seconds", { reps: 5, seconds: 30 }],
    ["neither reps nor seconds", { reps: null, seconds: null }],
    ["an empty name", { exerciseName: "" }],
    ["a name past 140 characters", { exerciseName: "x".repeat(141) }]
  ])("refuses %s", async (_label, fields) => {
    await expect(insert(fields)).rejects.toThrow();
  });

  test("refuses a second row for the same exercise and set number", async () => {
    await insert({});

    await expect(insert({})).rejects.toThrow();
  });
});

// Roadmap B2: each logged exercise carries its library pattern, worked out on
// every read, so the client can count sets per muscle group. A name typed by
// hand, which the library does not hold, carries null.
describe("each exercise's pattern", () => {
  const rows = (...names) =>
    names.map((name, exerciseOrder) => ({
      exerciseOrder,
      exerciseName: name,
      setNumber: 1,
      reps: 5
    }));
  const patternsOf = (...names) =>
    mapWorkoutSession({ exerciseSets: rows(...names) }).exerciseSets.map((e) => e.pattern);

  test("a library name carries its pattern", () => {
    expect(patternsOf("Dumbbell box squat")).toEqual(["squat"]);
  });

  test("in any case, and with space around it", () => {
    expect(patternsOf("  dumbbell BOX Squat ")).toEqual(["squat"]);
  });

  test("a name the library does not hold carries null", () => {
    expect(patternsOf("My cable thing", "Plank")).toEqual([null, null]);
  });

  test("each exercise in a session carries its own", () => {
    expect(patternsOf("Dumbbell bench press", "Pull-up", "Brisk walk")).toEqual([
      "horizontal-push",
      "vertical-pull",
      "conditioning"
    ]);
  });
});
