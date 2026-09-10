import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildScopedCacheKey, readCookie, readJsonCache, writeJsonCache } from "./cache.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("buildScopedCacheKey", () => {
  test("prefers the user id", () => {
    expect(buildScopedCacheKey("cache", { userId: "u1", email: "a@b.c" })).toBe("cache:u1");
  });

  test("falls back to the email when there is no id", () => {
    expect(buildScopedCacheKey("cache", { email: "a@b.c" })).toBe("cache:a@b.c");
  });

  test.each([[null], [undefined], [{}], [{ userId: "", email: "" }]])(
    "scopes to anonymous for %s",
    (user) => {
      // Two signed-out visitors must share a key, and a signed-in user must
      // never read a cache written under a different scope.
      expect(buildScopedCacheKey("cache", user)).toBe("cache:anonymous");
    }
  );
});

describe("readJsonCache", () => {
  test("returns the parsed value that was stored", () => {
    window.localStorage.setItem("k", JSON.stringify({ a: 1 }));
    expect(readJsonCache("k")).toEqual({ a: 1 });
  });

  test.each([[""], [null], [undefined]])("returns null for the key %s", (key) => {
    expect(readJsonCache(key)).toBeNull();
  });

  test("returns null when nothing is stored", () => {
    expect(readJsonCache("missing")).toBeNull();
  });

  test("returns null rather than throwing on corrupt JSON", () => {
    window.localStorage.setItem("k", "{not json");
    expect(readJsonCache("k")).toBeNull();
  });

  test("returns null when localStorage is unavailable", () => {
    // Private browsing and some embedded webviews have no localStorage.
    vi.spyOn(window, "localStorage", "get").mockReturnValue(undefined);
    expect(readJsonCache("k")).toBeNull();
  });
});

describe("writeJsonCache", () => {
  test("stores the value as JSON", () => {
    writeJsonCache("k", { a: 1 });
    expect(JSON.parse(window.localStorage.getItem("k"))).toEqual({ a: 1 });
  });

  test("does nothing without a key", () => {
    writeJsonCache("", { a: 1 });
    expect(window.localStorage.length).toBe(0);
  });

  test("swallows a write failure instead of breaking the caller", () => {
    // Quota exceeded, or storage disabled mid-session.
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeJsonCache("k", { a: 1 })).not.toThrow();
  });
});

describe("readCookie", () => {
  const setCookie = (value) => {
    vi.spyOn(document, "cookie", "get").mockReturnValue(value);
  };

  beforeEach(() => {
    setCookie("");
  });

  test("returns the value of a named cookie", () => {
    setCookie("a=1; token=abc123; b=2");
    expect(readCookie("token")).toBe("abc123");
  });

  test("finds a cookie that is first in the list", () => {
    setCookie("token=abc123; b=2");
    expect(readCookie("token")).toBe("abc123");
  });

  test("decodes a percent-encoded value", () => {
    setCookie("token=a%20b%2Bc");
    expect(readCookie("token")).toBe("a b+c");
  });

  test("returns the raw value when it is not decodable", () => {
    // A stray % is not valid percent-encoding; decodeURIComponent throws.
    setCookie("token=100%");
    expect(readCookie("token")).toBe("100%");
  });

  test("returns an empty string when the cookie is absent", () => {
    setCookie("other=1");
    expect(readCookie("token")).toBe("");
  });

  test("returns an empty string when there are no cookies at all", () => {
    setCookie("");
    expect(readCookie("token")).toBe("");
  });

  test.each([[""], [null], [undefined]])("returns an empty string for the name %s", (name) => {
    setCookie("token=abc");
    expect(readCookie(name)).toBe("");
  });

  test("does not match a cookie whose name merely starts the same", () => {
    // "token_backup" must not satisfy a lookup for "token".
    setCookie("token_backup=wrong");
    expect(readCookie("token")).toBe("");
  });

  test("does not match a cookie whose name merely ends the same", () => {
    // The discriminating case for how the name is matched. "xsrftoken=..."
    // *contains* "token=" while not starting with it, so a substring match
    // would find it and then slice at the wrong offset, returning
    // "token=wrong". Only an anchored match rejects it.
    setCookie("xsrftoken=wrong");
    expect(readCookie("token")).toBe("");
  });
});
