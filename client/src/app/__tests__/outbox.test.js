/**
 * Pins the outbox: per-account storage of the logs the server has not
 * confirmed, oldest first, one entry per replay key, and a write that reports
 * whether storage took it.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { addToOutbox, clearOutbox, readOutbox, removeFromOutbox } from "../outbox.js";
import { OUTBOX_CACHE_PREFIX } from "../constants.js";

const ada = { email: "ada@example.com" };
const grace = { email: "grace@example.com" };
const entry = (clientId, extra = {}) => ({
  clientId,
  type: "workout",
  url: "/api/dashboard/workout-sessions",
  body: { id: clientId, date: "2026-11-07" },
  item: { id: `optimistic-workout-${clientId}` },
  queuedAt: 1,
  ...extra
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("the outbox", () => {
  test("is empty to begin with", () => {
    expect(readOutbox(ada)).toEqual([]);
  });

  test("keeps entries in the order they were added", () => {
    expect(addToOutbox(ada, entry("k1"))).toBe(true);
    expect(addToOutbox(ada, entry("k2"))).toBe(true);

    expect(readOutbox(ada).map((kept) => kept.clientId)).toEqual(["k1", "k2"]);
  });

  test("is kept per account, under the outbox prefix", () => {
    addToOutbox(ada, entry("k1"));

    expect(readOutbox(grace)).toEqual([]);
    expect(window.localStorage.getItem(`${OUTBOX_CACHE_PREFIX}:ada@example.com`)).toContain("k1");
  });

  test("holds one entry per replay key, the later replacing the earlier in place", () => {
    addToOutbox(ada, entry("k1", { queuedAt: 1 }));
    addToOutbox(ada, entry("k2"));
    addToOutbox(ada, entry("k1", { queuedAt: 2 }));

    expect(readOutbox(ada).map((kept) => [kept.clientId, kept.queuedAt])).toEqual([
      ["k1", 2],
      ["k2", 1]
    ]);
  });

  test("removes one entry by its key, and clears the rest", () => {
    addToOutbox(ada, entry("k1"));
    addToOutbox(ada, entry("k2"));

    removeFromOutbox(ada, "k1");
    expect(readOutbox(ada).map((kept) => kept.clientId)).toEqual(["k2"]);

    clearOutbox(ada);
    expect(readOutbox(ada)).toEqual([]);
  });

  test("reads anything that is not a list as empty", () => {
    window.localStorage.setItem(`${OUTBOX_CACHE_PREFIX}:ada@example.com`, "{not json");
    expect(readOutbox(ada)).toEqual([]);

    window.localStorage.setItem(`${OUTBOX_CACHE_PREFIX}:ada@example.com`, '{"a":1}');
    expect(readOutbox(ada)).toEqual([]);
  });

  test("says so when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(addToOutbox(ada, entry("k1"))).toBe(false);
  });

  test("a removal storage refuses leaves the entry, to be sent again, and does not throw", () => {
    addToOutbox(ada, entry("k1"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => removeFromOutbox(ada, "k1")).not.toThrow();
    expect(readOutbox(ada).map((kept) => kept.clientId)).toEqual(["k1"]);
  });

  // Restored here, before the afterEach clears storage through the getter.
  test("says so when storage cannot be reached at all", () => {
    const getter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    try {
      expect(addToOutbox(ada, entry("k1"))).toBe(false);
    } finally {
      getter.mockRestore();
    }
  });
});
