import argon2 from "argon2";
import crypto from "crypto";
import { promisify } from "util";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createAuthUserService } from "../authUserService.js";
import { cleanText } from "../../dashboard/dashboardDataBuildersService.js";

const pbkdf2Async = promisify(crypto.pbkdf2);

// Password verification and the pbkdf2 -> argon2id migration. The integration
// suite drives signup and login end to end, so the happy paths were already
// covered; this file was at 31.7% branch, and what was missing was every way
// those paths fail.
//
// Real argon2 and real pbkdf2 throughout. Stubbing the hashing would leave the
// tests asserting on stubs, and the questions here -- does a pbkdf2 hash get
// recognised, does a malformed hash throw or return false -- only have answers
// against the real primitives. Cost parameters are the lowest argon2 accepts so
// the suite stays quick; they change the hash, not the branch under test.
const argon2Options = { timeCost: 2, memoryCost: 8192, parallelism: 1, hashLength: 32 };

let updatePasswordHash;
let findUserWithDashboard;
let findUserWithDashboardByEmail;
let createUserWithDashboard;

const build = (overrides = {}) =>
  createAuthUserService({
    cleanText,
    argon2Options,
    updatePasswordHash,
    findUserWithDashboard,
    findUserWithDashboardByEmail,
    createUserWithDashboard,
    ...overrides
  });

// A real legacy record, hashed the way the pre-argon2 code did it.
const legacyPbkdf2User = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await pbkdf2Async(password, salt, 120000, 64, "sha512")).toString("hex");
  return { salt, hash, passwordAlgo: "pbkdf2" };
};

beforeEach(() => {
  updatePasswordHash = vi.fn(async () => {});
  findUserWithDashboard = vi.fn(async () => null);
  findUserWithDashboardByEmail = vi.fn(async () => null);
  createUserWithDashboard = vi.fn(async (doc) => doc);
});

describe("hashPassword", () => {
  test("produces an argon2id hash with no separate salt", async () => {
    const record = await build().hashPassword("StrongPass123!");

    expect(record.passwordAlgo).toBe("argon2id");
    expect(record.hash.startsWith("$argon2id$")).toBe(true);
    // argon2 embeds its own salt in the encoded hash; the column is vestigial.
    expect(record.salt).toBe("");
  });

  test("never returns the password itself", async () => {
    const record = await build().hashPassword("StrongPass123!");

    expect(record.hash).not.toContain("StrongPass123!");
  });

  test("salts, so the same password hashes differently twice", async () => {
    const service = build();
    const [a, b] = await Promise.all([
      service.hashPassword("StrongPass123!"),
      service.hashPassword("StrongPass123!")
    ]);

    expect(a.hash).not.toBe(b.hash);
  });
});

describe("verifyPassword", () => {
  describe("argon2id", () => {
    test("accepts the right password and rejects a wrong one", async () => {
      const service = build();
      const user = await service.hashPassword("StrongPass123!");

      expect(await service.verifyPassword("StrongPass123!", user)).toBe(true);
      expect(await service.verifyPassword("StrongPass123?", user)).toBe(false);
    });

    // A corrupt or truncated hash makes argon2.verify throw. Answering false is
    // the only safe reading, and it must not surface as a 500 on the login route.
    test.each([
      ["truncated", "$argon2id$v=19$m=8192,t=1,p=1$abc"],
      ["not a hash at all", "$argon2id$nonsense"],
      ["empty", ""]
    ])("returns false rather than throwing for a %s hash", async (_label, hash) => {
      const service = build();

      await expect(
        service.verifyPassword("StrongPass123!", { hash, passwordAlgo: "argon2id" })
      ).resolves.toBe(false);
    });

    test("rejects a user record with no hash", async () => {
      expect(await build().verifyPassword("StrongPass123!", { passwordAlgo: "argon2id" })).toBe(
        false
      );
    });
  });

  describe("legacy pbkdf2", () => {
    test("still accepts a correct legacy password", async () => {
      const user = await legacyPbkdf2User("StrongPass123!");

      expect(await build().verifyPassword("StrongPass123!", user)).toBe(true);
    });

    test("rejects a wrong legacy password", async () => {
      const user = await legacyPbkdf2User("StrongPass123!");

      expect(await build().verifyPassword("StrongPass123?", user)).toBe(false);
    });

    test.each([
      ["no salt", { hash: "aa".repeat(64), passwordAlgo: "pbkdf2" }],
      ["no hash", { salt: "abc", passwordAlgo: "pbkdf2" }],
      ["neither", { passwordAlgo: "pbkdf2" }]
    ])("rejects a record with %s", async (_label, user) => {
      expect(await build().verifyPassword("StrongPass123!", user)).toBe(false);
    });

    // crypto.timingSafeEqual throws when the two buffers differ in length, so
    // the length check ahead of it is what keeps a short stored hash from
    // becoming a 500 instead of a failed login.
    test("returns false rather than throwing when the stored hash is the wrong length", async () => {
      const user = { salt: "abc123", hash: "aabb", passwordAlgo: "pbkdf2" };

      await expect(build().verifyPassword("StrongPass123!", user)).resolves.toBe(false);
    });
  });

  // Which verifier runs is decided per user. Choosing wrong locks out everyone
  // whose row was written by the other scheme.
  describe("choosing the verifier", () => {
    test("infers argon2id from the hash when the column is missing", async () => {
      const service = build();
      const { hash } = await service.hashPassword("StrongPass123!");

      expect(await service.verifyPassword("StrongPass123!", { hash })).toBe(true);
    });

    test("infers pbkdf2 from a hash that is not argon2", async () => {
      const { salt, hash } = await legacyPbkdf2User("StrongPass123!");

      expect(await build().verifyPassword("StrongPass123!", { salt, hash })).toBe(true);
    });

    test("ignores an unrecognised algo and infers from the hash instead", async () => {
      const service = build();
      const { hash } = await service.hashPassword("StrongPass123!");

      expect(await service.verifyPassword("StrongPass123!", { hash, passwordAlgo: "bcrypt" })).toBe(
        true
      );
    });

    // The inference is `$argon2`, not `$`. Other schemes are also $-prefixed --
    // a bcrypt hash is $2b$ -- and matching on the sigil alone would call one
    // argon2id. Both verifiers reject such a row either way, so the damage
    // shows up in the upgrade path instead: see shouldUpgradePasswordToArgon2id.
    test.each([
      ["argon2i", "$argon2i$v=19$m=8192,t=2,p=1$c29tZXNhbHQ$aaaa"],
      ["argon2d", "$argon2d$v=19$m=8192,t=2,p=1$c29tZXNhbHQ$aaaa"]
    ])("treats a %s hash as argon2", async (_label, hash) => {
      // Not a valid pair, so the answer is false either way -- what is being
      // pinned is that it takes the argon2 branch and does not throw.
      await expect(build().verifyPassword("StrongPass123!", { hash })).resolves.toBe(false);
    });
  });
});

describe("shouldUpgradePasswordToArgon2id", () => {
  test("is true for a legacy pbkdf2 record", async () => {
    const user = await legacyPbkdf2User("StrongPass123!");

    expect(build().shouldUpgradePasswordToArgon2id(user)).toBe(true);
  });

  test("is false for a record already on argon2id", async () => {
    const service = build();
    const user = await service.hashPassword("StrongPass123!");

    expect(service.shouldUpgradePasswordToArgon2id(user)).toBe(false);
  });

  test("reads the hash when the algo column is absent", async () => {
    const service = build();
    const { hash } = await service.hashPassword("StrongPass123!");

    expect(service.shouldUpgradePasswordToArgon2id({ hash })).toBe(false);
    expect(service.shouldUpgradePasswordToArgon2id({ hash: "deadbeef" })).toBe(true);
  });

  // This is where mistaking any $-prefixed hash for argon2 would do its damage:
  // the row would be declared already-migrated and never upgraded, leaving a
  // password that no verifier accepts.
  test("still wants to upgrade a hash from some other $-prefixed scheme", () => {
    const bcryptish = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9v3jYcAG9lZ0kzYQ3sZ0eXAKzS0Lm7q";

    expect(build().shouldUpgradePasswordToArgon2id({ hash: bcryptish })).toBe(true);
  });
});

describe("upgradeUserPasswordToArgon2id", () => {
  test("persists a new argon2id hash for the user", async () => {
    const next = await build().upgradeUserPasswordToArgon2id("user-1", "StrongPass123!");

    expect(next.passwordAlgo).toBe("argon2id");
    expect(updatePasswordHash).toHaveBeenCalledWith({
      userId: "user-1",
      salt: "",
      hash: next.hash,
      passwordAlgo: "argon2id"
    });
  });

  // The upgrade is pointless if the new hash does not accept the password the
  // user just logged in with.
  test("returns a hash that verifies against the same password", async () => {
    const service = build();
    const next = await service.upgradeUserPasswordToArgon2id("user-1", "StrongPass123!");

    expect(await service.verifyPassword("StrongPass123!", next)).toBe(true);
  });

  test("clears the legacy salt", async () => {
    await build().upgradeUserPasswordToArgon2id("user-1", "StrongPass123!");

    expect(updatePasswordHash.mock.calls[0][0].salt).toBe("");
  });
});

// Login verifies an unknown email against this record so that a missing account
// costs the same time as a wrong password. If it were cheap, or cached per
// call, response time would tell an attacker which emails exist.
describe("getDummyPasswordRecord", () => {
  test("is a real argon2id record", async () => {
    const record = await build().getDummyPasswordRecord();

    expect(record.passwordAlgo).toBe("argon2id");
    expect(record.hash.startsWith("$argon2id$")).toBe(true);
  });

  test("is computed once and reused", async () => {
    const service = build();
    const [first, second] = await Promise.all([
      service.getDummyPasswordRecord(),
      service.getDummyPasswordRecord()
    ]);

    expect(first).toBe(second);
  });

  test("does not accept a password", async () => {
    const service = build();
    const record = await service.getDummyPasswordRecord();

    expect(await service.verifyPassword("invalid-password ", record)).toBe(false);
    expect(await service.verifyPassword("StrongPass123!", record)).toBe(false);
  });
});

describe("mapDbDocToUser", () => {
  test("returns null for a missing row", () => {
    expect(build().mapDbDocToUser(null)).toBeNull();
    expect(build().mapDbDocToUser(undefined)).toBeNull();
  });

  test("maps userId onto id and keeps the rest", () => {
    const user = build().mapDbDocToUser({
      userId: "u-1",
      email: "a@b.com",
      salt: "s",
      hash: "h",
      passwordAlgo: "pbkdf2",
      createdAt: "2026-01-01",
      profile: { firstName: "Jo" },
      dashboard: { workouts: [] }
    });

    expect(user).toMatchObject({
      id: "u-1",
      email: "a@b.com",
      passwordAlgo: "pbkdf2",
      profile: { firstName: "Jo" }
    });
  });

  test("infers argon2id from the hash when the column is empty", () => {
    const user = build().mapDbDocToUser({ userId: "u-1", hash: "$argon2id$v=19$..." });

    expect(user.passwordAlgo).toBe("argon2id");
  });

  test("infers pbkdf2 when the hash is not argon2", () => {
    const user = build().mapDbDocToUser({ userId: "u-1", hash: "deadbeef" });

    expect(user.passwordAlgo).toBe("pbkdf2");
  });

  test("does not call another $-prefixed scheme argon2id", () => {
    const user = build().mapDbDocToUser({
      userId: "u-1",
      hash: "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9v3jYcAG9lZ0kzYQ3sZ0eXAKzS0Lm7q"
    });

    expect(user.passwordAlgo).toBe("pbkdf2");
  });

  test("prefers a stored algo over what the hash looks like", () => {
    const user = build().mapDbDocToUser({
      userId: "u-1",
      hash: "deadbeef",
      passwordAlgo: "argon2id"
    });

    expect(user.passwordAlgo).toBe("argon2id");
  });
});

describe("lookups", () => {
  test("findUserById maps the row it gets back", async () => {
    findUserWithDashboard = vi.fn(async () => ({ userId: "u-1", hash: "deadbeef" }));

    const user = await build().findUserById("u-1");

    expect(findUserWithDashboard).toHaveBeenCalledWith("u-1");
    expect(user.id).toBe("u-1");
  });

  test("findUserById returns null when there is no row", async () => {
    expect(await build().findUserById("nobody")).toBeNull();
  });

  // Email is the login identifier, so it has to match regardless of how the
  // user typed it.
  test("findUserByEmail lowercases and trims before looking up", async () => {
    findUserWithDashboardByEmail = vi.fn(async () => ({ userId: "u-1", hash: "deadbeef" }));

    await build().findUserByEmail("  Person@Example.COM  ");

    expect(findUserWithDashboardByEmail).toHaveBeenCalledWith("person@example.com");
  });

  test("findUserByEmail returns null when there is no row", async () => {
    expect(await build().findUserByEmail("nobody@example.com")).toBeNull();
  });
});

describe("createUser", () => {
  const doc = () => createUserWithDashboard.mock.calls[0][0];

  test("stores the email lowercased", async () => {
    await build().createUser({ id: "u-1", email: "Person@Example.COM", hash: "h" });

    expect(doc().email).toBe("person@example.com");
  });

  test("defaults a missing salt to an empty string", async () => {
    await build().createUser({ id: "u-1", email: "a@b.com", hash: "h" });

    expect(doc().salt).toBe("");
  });

  test("defaults a missing algo to pbkdf2", async () => {
    await build().createUser({ id: "u-1", email: "a@b.com", hash: "h" });

    expect(doc().passwordAlgo).toBe("pbkdf2");
  });

  test("stamps createdAt when the caller gives none", async () => {
    await build().createUser({ id: "u-1", email: "a@b.com", hash: "h" });

    expect(Number.isNaN(Date.parse(doc().createdAt))).toBe(false);
  });

  test("keeps a createdAt the caller supplied", async () => {
    await build().createUser({
      id: "u-1",
      email: "a@b.com",
      hash: "h",
      createdAt: "2020-05-05T00:00:00.000Z"
    });

    expect(doc().createdAt).toBe("2020-05-05T00:00:00.000Z");
  });

  // Omitted rather than written as undefined, so a partial signup does not
  // overwrite a column with nothing.
  test("omits profile and dashboard when they were not supplied", async () => {
    await build().createUser({ id: "u-1", email: "a@b.com", hash: "h" });

    expect("profile" in doc()).toBe(false);
    expect("dashboard" in doc()).toBe(false);
  });

  test("includes profile and dashboard when they were", async () => {
    await build().createUser({
      id: "u-1",
      email: "a@b.com",
      hash: "h",
      profile: { firstName: "Jo" },
      dashboard: { workouts: [] }
    });

    expect(doc().profile).toEqual({ firstName: "Jo" });
    expect(doc().dashboard).toEqual({ workouts: [] });
  });
});

describe("argon2 options", () => {
  // The cost parameters are env-driven. If they stopped reaching argon2 the
  // hashes would still verify, so nothing else here would notice.
  test("are passed through to argon2", async () => {
    const spy = vi.spyOn(argon2, "hash");

    await build().hashPassword("StrongPass123!");

    expect(spy).toHaveBeenCalledWith(
      "StrongPass123!",
      expect.objectContaining({
        type: argon2.argon2id,
        timeCost: 2,
        memoryCost: 8192,
        parallelism: 1,
        hashLength: 32
      })
    );
    spy.mockRestore();
  });

  test("fall back to defaults when none are given", async () => {
    const spy = vi.spyOn(argon2, "hash");

    await createAuthUserService({
      cleanText,
      updatePasswordHash,
      findUserWithDashboard,
      findUserWithDashboardByEmail,
      createUserWithDashboard
    }).hashPassword("StrongPass123!");

    expect(spy).toHaveBeenCalledWith(
      "StrongPass123!",
      expect.objectContaining({ timeCost: 3, memoryCost: 19456, parallelism: 1, hashLength: 32 })
    );
    spy.mockRestore();
  });
});
