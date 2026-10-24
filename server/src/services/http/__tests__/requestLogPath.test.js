import { describe, expect, test } from "vitest";
import { requestLogPath } from "../requestLogPath.js";

// The path every log line and error report records for a request. Pins that the
// query string never reaches it: the weather and air-quality routes take the
// visitor's coordinates as query parameters, so a logged query is a logged
// location. Plain request objects, no stubs.

describe("requestLogPath", () => {
  test("drops the query string, where the visitor's coordinates travel", () => {
    const req = {
      originalUrl: "/api/weather/recommendation?latitude=40.712776&longitude=-74.005974"
    };

    expect(requestLogPath(req)).toBe("/api/weather/recommendation");
  });

  test("keeps a path that has no query string as it is", () => {
    expect(requestLogPath({ originalUrl: "/api/health" })).toBe("/api/health");
  });

  // Inside a mounted middleware `url` is relative to the mount point, while
  // `originalUrl` is the whole path the caller asked for.
  test("prefers originalUrl over url", () => {
    expect(requestLogPath({ originalUrl: "/api/health?x=1", url: "/health?x=1" })).toBe(
      "/api/health"
    );
  });

  test("falls back to url, and strips its query string too", () => {
    expect(requestLogPath({ url: "/api/air-quality/current?latitude=1&longitude=2" })).toBe(
      "/api/air-quality/current"
    );
  });

  // An empty query is still a query: the "?" goes with it.
  test("drops a bare question mark", () => {
    expect(requestLogPath({ originalUrl: "/dashboard?" })).toBe("/dashboard");
  });

  test("records nothing for a request that carries no URL", () => {
    expect(requestLogPath({})).toBeUndefined();
    expect(requestLogPath(undefined)).toBeUndefined();
  });
});
