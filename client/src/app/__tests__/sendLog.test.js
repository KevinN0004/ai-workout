/**
 * Pins postLog, which sends one log and throws with the answer's status, and
 * sendLog, which retries once with a fresh CSRF token when the guard refused it.
 */
import { describe, expect, test, vi } from "vitest";
import { postLog, sendLog } from "../sendLog.js";

const answer = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body === undefined) throw new Error("not json");
    return body;
  }
});

describe("postLog", () => {
  test("posts the body as JSON and resolves to the server's answer", async () => {
    const apiFetch = vi.fn(async () => answer(200, { dashboard: { workouts: [] } }));

    const data = await postLog(
      apiFetch,
      { url: "/api/dashboard/calories", body: { id: "k1" } },
      "x"
    );

    expect(data).toEqual({ dashboard: { workouts: [] } });
    const [url, options] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/dashboard/calories");
    expect(options).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    expect(JSON.parse(options.body)).toEqual({ id: "k1" });
  });

  test("throws the server's error with its status", async () => {
    const apiFetch = vi.fn(async () => answer(400, { error: "Date and duration are required." }));

    const error = await postLog(apiFetch, { url: "/u", body: {} }, "Unable to save workout.").catch(
      (thrown) => thrown
    );

    expect(error.message).toBe("Date and duration are required.");
    expect(error.status).toBe(400);
  });

  test("falls back to its own message when the refusal has none, or is not JSON", async () => {
    const empty = await postLog(
      vi.fn(async () => answer(500, {})),
      { url: "/u", body: {} },
      "Fallback."
    ).catch((thrown) => thrown);
    const html = await postLog(
      vi.fn(async () => answer(502)),
      { url: "/u", body: {} },
      "Fallback."
    ).catch((thrown) => thrown);

    expect([empty.message, empty.status]).toEqual(["Fallback.", 500]);
    expect([html.message, html.status]).toEqual(["Fallback.", 502]);
  });

  test("lets a request that got no answer reject untouched, with no status", async () => {
    const failure = new TypeError("Failed to fetch");

    const error = await postLog(
      vi.fn(async () => Promise.reject(failure)),
      { url: "/u", body: {} },
      "x"
    ).catch((thrown) => thrown);

    expect(error).toBe(failure);
    expect(error.status).toBeUndefined();
  });
});

describe("sendLog", () => {
  const csrfRefusal = () =>
    Object.assign(new Error("Invalid or missing CSRF token."), { status: 403 });

  test("hands back the data of a send that worked", async () => {
    const ensureCsrfToken = vi.fn();

    const outcome = await sendLog(async () => ({ dashboard: {} }), ensureCsrfToken);

    expect(outcome).toEqual({ data: { dashboard: {} } });
    expect(ensureCsrfToken).not.toHaveBeenCalled();
  });

  test("hands back the error of a send that failed, without a retry", async () => {
    const failure = Object.assign(new Error("Bad body."), { status: 400 });
    const send = vi.fn(async () => Promise.reject(failure));
    const ensureCsrfToken = vi.fn();

    expect(await sendLog(send, ensureCsrfToken)).toEqual({ error: failure });
    expect(send).toHaveBeenCalledTimes(1);
    expect(ensureCsrfToken).not.toHaveBeenCalled();
  });

  test("after a CSRF refusal, fetches a fresh token and sends once more", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(csrfRefusal())
      .mockResolvedValueOnce({ dashboard: { ok: true } });
    const ensureCsrfToken = vi.fn(async () => "fresh");

    const outcome = await sendLog(send, ensureCsrfToken);

    expect(ensureCsrfToken).toHaveBeenCalledWith({ refresh: true });
    expect(send).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ data: { dashboard: { ok: true } } });
  });

  test("a second refusal is handed back, with no third send", async () => {
    const second = csrfRefusal();
    const send = vi.fn().mockRejectedValueOnce(csrfRefusal()).mockRejectedValueOnce(second);

    const outcome = await sendLog(
      send,
      vi.fn(async () => "fresh")
    );

    expect(outcome).toEqual({ error: second });
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("a token that cannot be fetched is handed back as the error", async () => {
    const noToken = new TypeError("Failed to fetch");
    const send = vi.fn().mockRejectedValueOnce(csrfRefusal());

    const outcome = await sendLog(
      send,
      vi.fn(async () => Promise.reject(noToken))
    );

    expect(outcome).toEqual({ error: noToken });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
