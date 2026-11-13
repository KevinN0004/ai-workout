import { describe, expect, test, vi } from "vitest";
import { runWebhookCommand } from "../stravaSubscriptions.js";

// The owner's webhook subscription command (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "The webhook"), behind
// server/scripts/strava-webhook.js: create, view and delete Strava's one
// subscription, with fetch stubbed. What it prints never holds the secret.

const ENV = {
  STRAVA_CLIENT_ID: "12345",
  STRAVA_CLIENT_SECRET: "script-test-secret",
  STRAVA_WEBHOOK_VERIFY_TOKEN: "verify-script",
  STRAVA_BASE_URL: "http://strava.test"
};

const answer = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

const run = async (argv, { env = ENV, responses = [] } = {}) => {
  const printed = [];
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  const code = await runWebhookCommand({
    argv,
    env,
    fetchImpl,
    print: (line) => printed.push(line)
  });
  return { code, printed, fetchImpl, text: printed.join("\n") };
};

const callOf = (fetchImpl) => {
  const [url, init = {}] = fetchImpl.mock.calls[0];
  return {
    url: new URL(String(url)),
    method: init.method || "GET",
    form: new URLSearchParams(String(init.body || ""))
  };
};

describe("create", () => {
  test("posts the callback and verify token, and prints the id to set", async () => {
    const { code, text, fetchImpl } = await run(
      ["create", "--callback", "https://app.test/webhooks/strava"],
      { responses: [answer(201, { id: 99 })] }
    );

    expect(code).toBe(0);
    const call = callOf(fetchImpl);
    expect(call.url.href).toBe("http://strava.test/api/v3/push_subscriptions");
    expect(call.method).toBe("POST");
    expect(Object.fromEntries(call.form)).toEqual({
      client_id: "12345",
      client_secret: "script-test-secret",
      callback_url: "https://app.test/webhooks/strava",
      verify_token: "verify-script"
    });
    expect(text).toContain("STRAVA_WEBHOOK_SUBSCRIPTION_ID=99");
  });

  test("a created answer without an id says to view it", async () => {
    const { code, text } = await run(["create", "--callback", "https://app.test/webhooks/strava"], {
      responses: [answer(201)]
    });
    expect(code).toBe(0);
    expect(text).toContain("Run view");
  });

  test("Strava's refusal is printed by field and code", async () => {
    const { code, text } = await run(["create", "--callback", "https://app.test/webhooks/strava"], {
      responses: [
        answer(400, {
          message: "Bad Request",
          errors: [{ resource: "PushSubscription", field: "callback url", code: "not verifiable" }]
        })
      ]
    });

    expect(code).toBe(1);
    expect(text).toContain("Strava answered 400");
    expect(text).toContain("callback url: not verifiable");
  });

  test("a callback that is not an https URL is refused before Strava is asked", async () => {
    const { code, fetchImpl, text } = await run(["create", "--callback", "http://app.test/x"]);
    expect(code).toBe(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(text).toContain("https");
  });

  test("no verify token is refused, naming what is missing", async () => {
    const { code, text } = await run(["create", "--callback", "https://app.test/webhooks/strava"], {
      env: { ...ENV, STRAVA_WEBHOOK_VERIFY_TOKEN: "" }
    });
    expect(code).toBe(2);
    expect(text).toContain("STRAVA_WEBHOOK_VERIFY_TOKEN");
  });
});

describe("view", () => {
  test("lists the subscription with its callback", async () => {
    const { code, text, fetchImpl } = await run(["view"], {
      responses: [answer(200, [{ id: 99, callback_url: "https://app.test/webhooks/strava" }])]
    });

    expect(code).toBe(0);
    const call = callOf(fetchImpl);
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe("/api/v3/push_subscriptions");
    expect(call.url.searchParams.get("client_id")).toBe("12345");
    expect(text).toContain("99");
    expect(text).toContain("https://app.test/webhooks/strava");
  });

  test("says when there is none", async () => {
    const { code, text } = await run(["view"], { responses: [answer(200, [])] });
    expect(code).toBe(0);
    expect(text).toContain("No subscription");
  });

  test("an answer that is not a list reads as none", async () => {
    const { code, text } = await run(["view"], { responses: [answer(200, { id: 99 })] });
    expect(code).toBe(0);
    expect(text).toContain("No subscription");
  });

  test("needs no verify token", async () => {
    const { code } = await run(["view"], {
      env: { ...ENV, STRAVA_WEBHOOK_VERIFY_TOKEN: "" },
      responses: [answer(200, [])]
    });
    expect(code).toBe(0);
  });
});

describe("delete", () => {
  test("deletes the subscription by id", async () => {
    const { code, text, fetchImpl } = await run(["delete", "99"], { responses: [answer(204)] });

    expect(code).toBe(0);
    const call = callOf(fetchImpl);
    expect(call.method).toBe("DELETE");
    expect(call.url.pathname).toBe("/api/v3/push_subscriptions/99");
    expect(text).toContain("Deleted subscription 99");
  });

  test("an id that is not a number is refused", async () => {
    const { code, fetchImpl } = await run(["delete", "../x"]);
    expect(code).toBe(2);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("the command", () => {
  test.each([[[]], [["subscribe"]], [["create"]], [["delete"]]])(
    "%j prints how to use it",
    async (argv) => {
      const { code, text } = await run(argv);
      expect(code).toBe(2);
      expect(text).toContain("Usage");
    }
  );

  test("no client id or secret is refused, naming them", async () => {
    const { code, text } = await run(["view"], { env: {} });
    expect(code).toBe(2);
    expect(text).toContain("STRAVA_CLIENT_ID");
    expect(text).toContain("STRAVA_CLIENT_SECRET");
  });

  test("Strava's own host when no base URL is set", async () => {
    const { fetchImpl } = await run(["view"], {
      env: { ...ENV, STRAVA_BASE_URL: "" },
      responses: [answer(200, [])]
    });
    expect(callOf(fetchImpl).url.origin).toBe("https://www.strava.com");
  });

  test("an unreachable Strava is reported, not thrown", async () => {
    const { code, text } = await run(["view"], { responses: [new TypeError("fetch failed")] });
    expect(code).toBe(1);
    expect(text).toContain("could not reach Strava");
  });

  test("nothing printed ever holds the secret", async () => {
    const outputs = await Promise.all([
      run(["view"], { responses: [answer(401, { message: "script-test-secret" })] }),
      run(["create", "--callback", "https://app.test/webhooks/strava"], {
        responses: [answer(500, { errors: [{ field: "script-test-secret", code: "x" }] })]
      }),
      run(["delete", "99"], { responses: [answer(404)] })
    ]);
    for (const { text } of outputs) expect(text).not.toContain("script-test-secret");
  });
});
