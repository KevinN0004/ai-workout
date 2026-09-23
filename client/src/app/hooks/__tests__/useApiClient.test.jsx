import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useApiClient from "../useApiClient";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../../constants";

// Every request the app makes goes through here. It was at 44% statements and
// 9% branch -- the thinnest branch coverage left -- and the branches are the
// CSRF guard and the credentials default, so a regression is either a request
// the server refuses or one that arrives without the session cookie.

const setCookie = (value) => {
  document.cookie = `${CSRF_COOKIE_NAME}=${value}`;
};

const clearCookies = () => {
  for (const pair of document.cookie.split(";")) {
    const name = pair.trim().split("=")[0];
    if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
};

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

const render = () => renderHook(() => useApiClient()).result;

// The Headers instance the hook built, from a given fetch call.
const headersOf = (fetchMock, call = 0) => fetchMock.mock.calls[call][1].headers;

let fetchMock;

beforeEach(() => {
  clearCookies();
  fetchMock = vi.fn(async () => jsonResponse({}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  clearCookies();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ensureCsrfToken", () => {
  test("uses the cookie when one is already set", async () => {
    setCookie("cookie-token");
    const { current } = render();

    await expect(current.ensureCsrfToken()).resolves.toBe("cookie-token");
    // No point asking the server for a token we already hold.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("asks the server when there is no cookie", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ csrfToken: "issued-token" }));
    const { current } = render();

    await expect(current.ensureCsrfToken()).resolves.toBe("issued-token");
    expect(fetchMock).toHaveBeenCalledWith("/api/csrf-token", { credentials: "include" });
  });

  // The endpoint sets the cookie as well as returning the token; the cookie is
  // the more authoritative of the two.
  test("prefers the freshly set cookie over the response body", async () => {
    fetchMock.mockImplementation(async () => {
      setCookie("from-cookie");
      return jsonResponse({ csrfToken: "from-body" });
    });
    const { current } = render();

    await expect(current.ensureCsrfToken()).resolves.toBe("from-cookie");
  });

  test("trims the token out of the response body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ csrfToken: "  padded-token  " }));
    const { current } = render();

    await expect(current.ensureCsrfToken()).resolves.toBe("padded-token");
  });

  test("throws when the endpoint fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    const { current } = render();

    await expect(current.ensureCsrfToken()).rejects.toThrow(/security token/i);
  });

  // A 200 with an unreadable body is not a reason to blow up here; the caller
  // that needs a token will fail on the empty string instead.
  test("survives a response that is not json", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("not json");
      }
    });
    const { current } = render();

    await expect(current.ensureCsrfToken()).resolves.toBe("");
  });

  test.each([
    ["the field is missing", {}],
    ["the field is not a string", { csrfToken: 42 }],
    ["the field is empty", { csrfToken: "" }]
  ])("returns an empty string when %s", async (_label, body) => {
    fetchMock.mockResolvedValue(jsonResponse(body));
    const { current } = render();

    await expect(current.ensureCsrfToken()).resolves.toBe("");
  });
});

describe("apiFetch", () => {
  describe("safe methods", () => {
    test.each(["GET", "HEAD", "OPTIONS", "get", "head", "options"])(
      "sends %s without a csrf token",
      async (method) => {
        const { current } = render();

        await current.apiFetch("/api/dashboard", { method });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(headersOf(fetchMock).has(CSRF_HEADER_NAME)).toBe(false);
      }
    );

    test("defaults to GET when no method is given", async () => {
      const { current } = render();

      await current.apiFetch("/api/dashboard");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(headersOf(fetchMock).has(CSRF_HEADER_NAME)).toBe(false);
    });

    // A read must not trigger a token round trip it has no use for.
    test("does not fetch a token for a read", async () => {
      const { current } = render();

      await current.apiFetch("/api/dashboard");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/dashboard");
    });
  });

  describe("state-changing methods", () => {
    test.each(["POST", "PUT", "PATCH", "DELETE", "post", "delete"])(
      "attaches the csrf token to %s",
      async (method) => {
        setCookie("cookie-token");
        const { current } = render();

        await current.apiFetch("/api/dashboard/meal-logs", { method });

        expect(headersOf(fetchMock).get(CSRF_HEADER_NAME)).toBe("cookie-token");
      }
    );

    test("fetches a token first when there is no cookie", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ csrfToken: "issued-token" }));
      const { current } = render();

      await current.apiFetch("/api/dashboard/meal-logs", { method: "POST" });

      expect(fetchMock.mock.calls[0][0]).toBe("/api/csrf-token");
      expect(fetchMock.mock.calls[1][0]).toBe("/api/dashboard/meal-logs");
      expect(headersOf(fetchMock, 1).get(CSRF_HEADER_NAME)).toBe("issued-token");
    });

    // The guard that matters. A write without a token must not leave the
    // browser at all -- sending it anyway would be a request the server is
    // obliged to reject, and the failure would surface as a confusing 403.
    test("refuses to send a write when no token can be obtained", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ csrfToken: "" }));
      const { current } = render();

      await expect(
        current.apiFetch("/api/dashboard/meal-logs", { method: "POST" })
      ).rejects.toThrow(/security token unavailable/i);

      // Only the token attempt happened; the write did not.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/csrf-token");
    });

    test("propagates a failure to obtain the token", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false));
      const { current } = render();

      await expect(
        current.apiFetch("/api/dashboard/meal-logs", { method: "POST" })
      ).rejects.toThrow(/unable to initialize security token/i);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // Once a token has been issued it is remembered, so a burst of writes does
    // not each pay for a round trip.
    test("reuses a token across later writes", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ csrfToken: "issued-token" }));
      const { current } = render();

      await current.apiFetch("/api/a", { method: "POST" });
      setCookie("issued-token");
      await current.apiFetch("/api/b", { method: "POST" });

      const tokenCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/csrf-token");
      expect(tokenCalls).toHaveLength(1);
    });
  });

  describe("request options", () => {
    // Without this the session cookie is not sent and every call is anonymous.
    test("sends credentials by default", async () => {
      const { current } = render();

      await current.apiFetch("/api/dashboard");

      expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
    });

    test("respects an explicit credentials mode", async () => {
      const { current } = render();

      await current.apiFetch("/api/dashboard", { credentials: "omit" });

      expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
    });

    test("keeps the caller's own headers", async () => {
      setCookie("cookie-token");
      const { current } = render();

      await current.apiFetch("/api/dashboard/meal-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      const headers = headersOf(fetchMock);
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get(CSRF_HEADER_NAME)).toBe("cookie-token");
    });

    test("passes the rest of the options through", async () => {
      setCookie("cookie-token");
      const body = JSON.stringify({ title: "Porridge" });
      const { current } = render();

      await current.apiFetch("/api/dashboard/meal-logs", { method: "POST", body });

      expect(fetchMock.mock.calls[0][1].body).toBe(body);
    });

    test("returns the response untouched", async () => {
      const response = jsonResponse({ dashboard: {} });
      fetchMock.mockResolvedValue(response);
      const { current } = render();

      await expect(current.apiFetch("/api/dashboard")).resolves.toBe(response);
    });

    test("lets a network failure reach the caller", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const { current } = render();

      await expect(current.apiFetch("/api/dashboard")).rejects.toThrow("network down");
    });
  });
});
