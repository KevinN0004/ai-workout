/**
 * Pins what happens to a log whose send failed, one row per outcome in the
 * spec's table (docs/specs/2026-11-06-offline-ready-pwa-design.md).
 */
import { describe, expect, test } from "vitest";
import { classifySendFailure } from "../classifySendFailure.js";

const failure = (status, message = "Something went wrong.") =>
  Object.assign(new Error(message), status === undefined ? {} : { status });

describe("classifySendFailure", () => {
  test("no answer at all is kept for later", () => {
    expect(classifySendFailure(new TypeError("Failed to fetch"))).toBe("queue");
  });

  test.each([500, 502, 503, 429])("a %i is kept for later", (status) => {
    expect(classifySendFailure(failure(status))).toBe("queue");
  });

  test("a 401 is kept for later: the body is fine, the session is not", () => {
    expect(classifySendFailure(failure(401))).toBe("queue");
  });

  test("a 403 from the CSRF guard asks for a fresh token", () => {
    expect(classifySendFailure(failure(403, "Invalid or missing CSRF token."))).toBe("refresh");
  });

  test.each([
    [400, "Date and duration are required."],
    [403, "Forbidden."],
    [404, "User not found."],
    [413, "Payload too large."]
  ])("a %i is dropped: resending the same body cannot fix it", (status, message) => {
    expect(classifySendFailure(failure(status, message))).toBe("drop");
  });

  test("a missing error is kept for later", () => {
    expect(classifySendFailure(undefined)).toBe("queue");
  });
});
