import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../../db/prisma.js";
import { createProgressionDecisionRepository } from "../progressionDecisionRepository.js";

// Pins the answers to a week's progression (roadmap B4) against real Postgres:
// the repository's reads and writes, and the rules the table itself enforces
// (server/db/postgres/007_progression_decisions.sql).

const { listWeekDecisions, saveDecision, removeDecision } = createProgressionDecisionRepository({
  prisma
});

const EMAILS = ["progression-a@example.com", "progression-b@example.com"];
const WEEK = "2026-11-09";
const NEXT_WEEK = "2026-11-16";

const createUser = (email, legacyUserId = null) =>
  prisma.appUser.create({ data: { email, passwordHash: "x", legacyUserId } });

// Rows of this file's users only, so another file's leftovers never count.
const countOurs = () =>
  prisma.progressionDecision.count({ where: { user: { email: { in: EMAILS } } } });

const cleanUp = () => prisma.appUser.deleteMany({ where: { email: { in: EMAILS } } });

beforeEach(cleanUp);
afterAll(cleanUp);

describe("progressionDecisionRepository", () => {
  test("a save then a list reads the week's answers back", async () => {
    const user = await createUser(EMAILS[0]);
    await saveDecision({
      userId: user.id,
      weekStart: WEEK,
      liftKey: "seated cable row",
      decision: "undo"
    });
    await saveDecision({ userId: user.id, weekStart: WEEK, liftKey: "", decision: "normal" });

    expect(await listWeekDecisions({ userId: user.id, weekStart: WEEK })).toEqual({
      "seated cable row": "undo",
      "": "normal"
    });
  });

  test("a second save of the same key replaces the first", async () => {
    const user = await createUser(EMAILS[0]);
    const key = { userId: user.id, weekStart: WEEK, liftKey: "dumbbell box squat" };
    await saveDecision({ ...key, decision: "accept" });
    await saveDecision({ ...key, decision: "decline" });

    expect(await listWeekDecisions({ userId: user.id, weekStart: WEEK })).toEqual({
      "dumbbell box squat": "decline"
    });
    expect(await countOurs()).toBe(1);
  });

  test("the same lift in two weeks keeps two answers, and a list reads one week", async () => {
    const user = await createUser(EMAILS[0]);
    await saveDecision({
      userId: user.id,
      weekStart: WEEK,
      liftKey: "leg press",
      decision: "undo"
    });
    await saveDecision({
      userId: user.id,
      weekStart: NEXT_WEEK,
      liftKey: "leg press",
      decision: "accept"
    });

    expect(await listWeekDecisions({ userId: user.id, weekStart: WEEK })).toEqual({
      "leg press": "undo"
    });
    expect(await listWeekDecisions({ userId: user.id, weekStart: NEXT_WEEK })).toEqual({
      "leg press": "accept"
    });
  });

  test("a remove takes one answer back and leaves the others", async () => {
    const user = await createUser(EMAILS[0]);
    await saveDecision({
      userId: user.id,
      weekStart: WEEK,
      liftKey: "leg press",
      decision: "undo"
    });
    await saveDecision({ userId: user.id, weekStart: WEEK, liftKey: "", decision: "normal" });

    expect(await removeDecision({ userId: user.id, weekStart: WEEK, liftKey: "leg press" })).toBe(
      1
    );
    expect(await removeDecision({ userId: user.id, weekStart: WEEK, liftKey: "leg press" })).toBe(
      0
    );
    expect(await listWeekDecisions({ userId: user.id, weekStart: WEEK })).toEqual({ "": "normal" });
  });

  test("one user's answers are not in another's week, and a remove reaches only its own", async () => {
    const owner = await createUser(EMAILS[0]);
    const other = await createUser(EMAILS[1]);
    await saveDecision({
      userId: owner.id,
      weekStart: WEEK,
      liftKey: "leg press",
      decision: "undo"
    });

    expect(await listWeekDecisions({ userId: other.id, weekStart: WEEK })).toEqual({});
    expect(await removeDecision({ userId: other.id, weekStart: WEEK, liftKey: "leg press" })).toBe(
      0
    );
    expect(await listWeekDecisions({ userId: owner.id, weekStart: WEEK })).toEqual({
      "leg press": "undo"
    });
  });

  test("a user held by the legacy id resolves too", async () => {
    await createUser(EMAILS[0], "legacy-progression-user");
    await saveDecision({
      userId: "legacy-progression-user",
      weekStart: WEEK,
      liftKey: "leg press",
      decision: "undo"
    });

    expect(await listWeekDecisions({ userId: "legacy-progression-user", weekStart: WEEK })).toEqual(
      { "leg press": "undo" }
    );
  });

  test("an unknown user lists nothing, saves nothing and removes nothing", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect(await listWeekDecisions({ userId: unknown, weekStart: WEEK })).toEqual({});
    expect(
      await saveDecision({
        userId: unknown,
        weekStart: WEEK,
        liftKey: "leg press",
        decision: "undo"
      })
    ).toBeNull();
    expect(await removeDecision({ userId: unknown, weekStart: WEEK, liftKey: "leg press" })).toBe(
      0
    );
    expect(await countOurs()).toBe(0);
  });
});

describe("the progression_decisions table", () => {
  // Raw SQL, so the test exercises the database's own rules rather than the
  // Prisma model's.
  const insert = (userId, weekStart, liftKey, decision) =>
    prisma.$executeRaw`
      insert into progression_decisions (user_id, week_start, lift_key, decision)
      values (${userId}::uuid, ${weekStart}::date, ${liftKey}, ${decision})
    `;

  test.each([
    ["a week that does not start on a Monday", "2026-11-10", "leg press", "undo"],
    ["a decision it does not know", WEEK, "leg press", "maybe"],
    ["normal on a lift", WEEK, "leg press", "normal"],
    ["a lift's answer on the week", WEEK, "", "undo"],
    ["a lift key past 140 characters", WEEK, "x".repeat(141), "undo"]
  ])("refuses %s", async (_label, weekStart, liftKey, decision) => {
    const user = await createUser(EMAILS[0]);
    await expect(insert(user.id, weekStart, liftKey, decision)).rejects.toThrow();
  });

  test("refuses a second answer for the same user, week and lift", async () => {
    const user = await createUser(EMAILS[0]);
    await insert(user.id, WEEK, "leg press", "undo");
    await expect(insert(user.id, WEEK, "leg press", "undo")).rejects.toThrow(
      /progression_decisions_user_week_lift_key/
    );
  });

  test("goes with its user", async () => {
    const user = await createUser(EMAILS[0]);
    await insert(user.id, WEEK, "leg press", "undo");
    await prisma.appUser.delete({ where: { id: user.id } });
    expect(await countOurs()).toBe(0);
  });
});
