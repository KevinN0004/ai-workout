/**
 * Pins the open in-gym session's storage on the device: per account, a refused
 * write reported, and anything that is not a session of this version read as
 * none.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { clearActiveSession, readActiveSession, writeActiveSession } from "../activeSession.js";
import { ACTIVE_SESSION_PREFIX } from "../constants.js";

const ada = { email: "ada@example.com" };
const grace = { email: "grace@example.com" };
const session = { version: 1, clientId: "k1", exercises: [] };
const KEY = `${ACTIVE_SESSION_PREFIX}:ada@example.com`;

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("the open session on the device", () => {
  test("is none to begin with", () => {
    expect(readActiveSession(ada)).toBeNull();
  });

  test("reads back as written, per account", () => {
    expect(writeActiveSession(ada, session)).toBe(true);

    expect(readActiveSession(ada)).toEqual(session);
    expect(readActiveSession(grace)).toBeNull();
  });

  test.each([
    ["bad JSON", "{not json"],
    ["another version", JSON.stringify({ ...session, version: 2 })],
    ["no exercises list", JSON.stringify({ version: 1 })]
  ])("reads %s as none", (_label, stored) => {
    window.localStorage.setItem(KEY, stored);

    expect(readActiveSession(ada)).toBeNull();
  });

  test("says so when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(writeActiveSession(ada, session)).toBe(false);
  });

  test("is gone once cleared", () => {
    writeActiveSession(ada, session);

    clearActiveSession(ada);

    expect(readActiveSession(ada)).toBeNull();
  });
});
