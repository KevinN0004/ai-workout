import { describe, expect, test, vi } from "vitest";
import { StravaError, createStravaClient } from "../stravaClient.js";

// The only code that calls Strava (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "The Strava client"): each
// request's shape, the error kinds its answers become, and that no error ever
// carries the secret, a token or the code. fetch is the boundary stubbed here.

const CONFIG = {
  clientId: "12345",
  clientSecret: "test-client-secret",
  key: Buffer.alloc(32),
  webBase: "http://strava.test",
  verifyToken: null,
  subscriptionId: null
};

const SECRETS = ["test-client-secret", "access-xyz", "refresh-xyz", "code-xyz"];

const answer = (status, body = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

// A client over a fetch that answers `responses` in turn, and the calls it saw.
const clientWith = (...responses) => {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  return { client: createStravaClient({ config: CONFIG, fetchImpl }), fetchImpl };
};

const TOKENS = {
  token_type: "Bearer",
  access_token: "access-xyz",
  refresh_token: "refresh-xyz",
  expires_at: 1794600000,
  expires_in: 21600
};

// The call `index` as { url, method, headers, form }.
const callOf = (fetchImpl, index = 0) => {
  const [url, init = {}] = fetchImpl.mock.calls[index];
  const body = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : null;
  return {
    url: String(url),
    method: init.method || "GET",
    headers: init.headers || {},
    form: body
  };
};

describe("the requests", () => {
  test("exchangeCode posts the code with the app's credentials, and reads the athlete", async () => {
    const { client, fetchImpl } = clientWith(
      answer(200, { ...TOKENS, athlete: { id: 4242, firstname: "Jo", lastname: "Smith" } })
    );

    const result = await client.exchangeCode("code-xyz");

    expect(callOf(fetchImpl)).toMatchObject({
      url: "http://strava.test/oauth/token",
      method: "POST",
      form: {
        client_id: "12345",
        client_secret: "test-client-secret",
        code: "code-xyz",
        grant_type: "authorization_code"
      }
    });
    expect(result).toEqual({
      accessToken: "access-xyz",
      refreshToken: "refresh-xyz",
      expiresAt: new Date(1794600000 * 1000),
      athleteId: 4242,
      athleteName: "Jo S."
    });
  });

  test.each([
    [{ id: 1, firstname: "Jo", lastname: "" }, "Jo"],
    [{ id: 1, firstname: "", lastname: "Smith" }, "S."],
    [{ id: 1, firstname: " Jo ", lastname: " smith " }, "Jo S."],
    [{ id: 1 }, ""]
  ])("the athlete %j is named %j", async (athlete, name) => {
    const { client } = clientWith(answer(200, { ...TOKENS, athlete }));
    expect((await client.exchangeCode("code-xyz")).athleteName).toBe(name);
  });

  test("an exchange without an athlete id is unavailable", async () => {
    const { client } = clientWith(answer(200, { ...TOKENS, athlete: {} }));
    await expect(client.exchangeCode("code-xyz")).rejects.toMatchObject({ kind: "unavailable" });
  });

  test("refresh posts the refresh token, and reads the new pair", async () => {
    const { client, fetchImpl } = clientWith(answer(200, TOKENS));

    expect(await client.refresh("refresh-old")).toEqual({
      accessToken: "access-xyz",
      refreshToken: "refresh-xyz",
      expiresAt: new Date(1794600000 * 1000)
    });
    expect(callOf(fetchImpl)).toMatchObject({
      url: "http://strava.test/oauth/token",
      method: "POST",
      form: {
        client_id: "12345",
        client_secret: "test-client-secret",
        grant_type: "refresh_token",
        refresh_token: "refresh-old"
      }
    });
  });

  test("a token answer missing a token or its expiry is unavailable", async () => {
    for (const missing of ["access_token", "refresh_token", "expires_at"]) {
      const { [missing]: _dropped, ...rest } = TOKENS;
      const { client } = clientWith(answer(200, rest));
      await expect(client.refresh("refresh-old")).rejects.toMatchObject({ kind: "unavailable" });
    }
  });

  test("revoke posts the refresh token to /oauth/revoke, with the app as Basic auth", async () => {
    const { client, fetchImpl } = clientWith(answer(200, ""));

    await client.revoke("refresh-xyz");

    const call = callOf(fetchImpl);
    expect(call).toMatchObject({
      url: "http://strava.test/oauth/revoke",
      method: "POST",
      form: { token: "refresh-xyz", token_type_hint: "refresh_token" }
    });
    expect(call.headers.Authorization).toBe(
      `Basic ${Buffer.from("12345:test-client-secret").toString("base64")}`
    );
  });

  test("listActivities asks for a page after a time, with the access token", async () => {
    const { client, fetchImpl } = clientWith(answer(200, [{ id: 1 }, { id: 2 }]));

    expect(
      await client.listActivities("access-xyz", { after: 1794000000, page: 2, perPage: 100 })
    ).toEqual([{ id: 1 }, { id: 2 }]);

    const call = callOf(fetchImpl);
    expect(call.url).toBe(
      "http://strava.test/api/v3/athlete/activities?after=1794000000&page=2&per_page=100"
    );
    expect(call.headers.Authorization).toBe("Bearer access-xyz");
  });

  test("a list that is not an array is unavailable", async () => {
    const { client } = clientWith(answer(200, { message: "odd" }));
    await expect(
      client.listActivities("access-xyz", { after: 1, page: 1, perPage: 100 })
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  test("getActivity fetches one activity by id", async () => {
    const { client, fetchImpl } = clientWith(answer(200, { id: 9001, name: "Run" }));

    expect(await client.getActivity("access-xyz", "9001")).toEqual({ id: 9001, name: "Run" });
    expect(callOf(fetchImpl).url).toBe("http://strava.test/api/v3/activities/9001");
    expect(callOf(fetchImpl).headers.Authorization).toBe("Bearer access-xyz");
  });

  test("an activity id is encoded into the path", async () => {
    const { client, fetchImpl } = clientWith(answer(200, { id: 1 }));
    await client.getActivity("access-xyz", "1/../athlete");
    expect(callOf(fetchImpl).url).toBe("http://strava.test/api/v3/activities/1%2F..%2Fathlete");
  });

  test("an activity that is not an object is unavailable", async () => {
    const { client } = clientWith(answer(200, "[]"));
    await expect(client.getActivity("access-xyz", "1")).rejects.toMatchObject({
      kind: "unavailable"
    });
  });
});

describe("the error kinds", () => {
  test.each([
    [401, "unauthorized"],
    [400, "unauthorized"],
    [403, "unauthorized"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "unavailable"],
    [503, "unavailable"]
  ])("an API answer of %i is %s", async (status, kind) => {
    const { client } = clientWith(answer(status, { message: "Bad", errors: [] }));
    await expect(client.getActivity("access-xyz", "1")).rejects.toMatchObject({ kind, status });
  });

  test("a 403 from the code exchange is the athlete limit", async () => {
    const { client } = clientWith(answer(403, { message: "Forbidden" }));
    await expect(client.exchangeCode("code-xyz")).rejects.toMatchObject({ kind: "capacity" });
  });

  test("a refused refresh is unauthorized", async () => {
    const { client } = clientWith(answer(400, { message: "Bad Request" }));
    await expect(client.refresh("refresh-old")).rejects.toMatchObject({ kind: "unauthorized" });
  });

  test("a fetch that throws is unavailable", async () => {
    const { client } = clientWith(new TypeError("fetch failed"));
    await expect(client.getActivity("access-xyz", "1")).rejects.toMatchObject({
      kind: "unavailable",
      status: null
    });
  });

  test("a 200 that is not JSON is unavailable", async () => {
    const { client } = clientWith(answer(200, "<html>"));
    await expect(client.getActivity("access-xyz", "1")).rejects.toMatchObject({
      kind: "unavailable"
    });
  });

  test("a request past the timeout is aborted, and unavailable", async () => {
    const fetchImpl = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    const client = createStravaClient({ config: CONFIG, fetchImpl, timeoutMs: 20 });

    await expect(client.getActivity("access-xyz", "1")).rejects.toMatchObject({
      kind: "unavailable"
    });
  });

  test("every error is a StravaError whose text holds no secret, token or code", async () => {
    const failures = [
      () => clientWith(answer(403, { message: "access-xyz" })).client.exchangeCode("code-xyz"),
      () => clientWith(answer(400, { message: "refresh-xyz" })).client.refresh("refresh-xyz"),
      () => clientWith(answer(401)).client.getActivity("access-xyz", "1"),
      () => clientWith(new TypeError("refresh-xyz")).client.revoke("refresh-xyz"),
      () =>
        clientWith(answer(429)).client.listActivities("access-xyz", {
          after: 1,
          page: 1,
          perPage: 100
        })
    ];
    for (const fail of failures) {
      const error = await fail().catch((caught) => caught);
      expect(error).toBeInstanceOf(StravaError);
      expect(error.message).toBe(`Strava answered ${error.kind}.`);
      const text = [JSON.stringify(error), error.message, String(error.stack)].join("\n");
      for (const secret of SECRETS) expect(text).not.toContain(secret);
    }
  });
});
