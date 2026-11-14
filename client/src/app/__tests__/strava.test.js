/**
 * Pins the Strava requests Settings makes (roadmap C2): each one's path, method
 * and body over apiFetch, what each returns, and the message a refusal throws.
 */
import { describe, expect, test, vi } from "vitest";
import {
  disconnectStrava,
  fetchStravaState,
  readStravaResult,
  startStravaConnect,
  syncStrava
} from "../strava";

const respond = (body, ok = true) => ({ ok, json: async () => body });
const STATE = {
  available: true,
  connected: true,
  athleteName: "Jo S.",
  lastSyncedAt: null,
  lastSyncError: null,
  needsReconnect: false
};

describe("the Strava requests", () => {
  test("each calls its route, and returns what the server answers", async () => {
    const answers = [
      STATE,
      { url: "https://www.strava.com/oauth/authorize?x=1" },
      { skipped: true }
    ];
    const apiFetch = vi.fn(async () => respond(answers.shift()));

    expect(await fetchStravaState(apiFetch)).toEqual(STATE);
    expect(await startStravaConnect(apiFetch)).toBe("https://www.strava.com/oauth/authorize?x=1");
    expect(await syncStrava(apiFetch, { manual: true })).toEqual({ skipped: true });

    expect(apiFetch.mock.calls).toEqual([
      ["/api/integrations/strava", undefined],
      ["/api/integrations/strava/connect", { method: "POST" }],
      [
        "/api/integrations/strava/sync",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manual: true })
        }
      ]
    ]);
  });

  test("the quiet sync says it is not manual", async () => {
    const apiFetch = vi.fn(async () => respond({ imported: 0, updated: 0, removed: 0 }));

    await syncStrava(apiFetch, { manual: false });

    expect(apiFetch.mock.calls[0][1].body).toBe(JSON.stringify({ manual: false }));
  });

  test("disconnecting deletes the connection", async () => {
    const apiFetch = vi.fn(async () => respond({ ok: true }));

    expect(await disconnectStrava(apiFetch)).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith("/api/integrations/strava", { method: "DELETE" });
  });
});

describe("a refused request", () => {
  test("throws the server's message", async () => {
    const apiFetch = vi.fn(async () => respond({ error: "Strava is not available." }, false));

    await expect(fetchStravaState(apiFetch)).rejects.toThrow("Strava is not available.");
    await expect(startStravaConnect(apiFetch)).rejects.toThrow("Strava is not available.");
    await expect(syncStrava(apiFetch, { manual: true })).rejects.toThrow(
      "Strava is not available."
    );
    await expect(disconnectStrava(apiFetch)).rejects.toThrow("Strava is not available.");
  });

  test("throws a fixed message when the refusal says nothing readable", async () => {
    const apiFetch = vi.fn(async () => ({
      ok: false,
      json: async () => {
        throw new SyntaxError("not JSON");
      }
    }));

    await expect(fetchStravaState(apiFetch)).rejects.toThrow(
      "Could not load your Strava connection. Try again."
    );
    await expect(startStravaConnect(apiFetch)).rejects.toThrow(
      "Could not start connecting Strava. Try again."
    );
    await expect(syncStrava(apiFetch, { manual: true })).rejects.toThrow(
      "Could not sync with Strava. Try again."
    );
    await expect(disconnectStrava(apiFetch)).rejects.toThrow(
      "Could not disconnect Strava. Try again."
    );
  });
});

describe("readStravaResult", () => {
  test("reads the result Strava's return left in the query", () => {
    expect(readStravaResult("?strava=connected")).toBe("connected");
    expect(readStravaResult("?tab=x&strava=no-access")).toBe("no-access");
  });

  test("is empty without one", () => {
    expect(readStravaResult("")).toBe("");
    expect(readStravaResult("?strava=")).toBe("");
    expect(readStravaResult("?other=1")).toBe("");
  });
});
