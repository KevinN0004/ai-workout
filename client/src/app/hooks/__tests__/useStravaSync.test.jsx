import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import useStravaSync from "../useStravaSync";
import { markAnswered, markUnanswered } from "../../connection";

// The quiet Strava catch-up on entering the dashboard (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "The client"): once per entry,
// a reload only when something changed, and never a word when it fails.

// Each answer holds only ok and json, which is all the hook reads.
/** @typedef {import("../../network.js").ApiFetch} ApiFetch */
/**
 * @param {unknown} body
 * @param {boolean} [ok]
 */
const respond = (body, ok = true) =>
  /** @type {Response} */ (/** @type {unknown} */ ({ ok, json: async () => body }));

const ACCOUNT = "dashboard:a@b.c";

/** @param {{ answer?: unknown, accountKey?: string, isDashboardRoute?: boolean }} [options] */
const renderSync = ({ answer = { imported: 0, updated: 0, removed: 0 }, ...props } = {}) => {
  /** @type {import("vitest").Mock<ApiFetch>} */
  const apiFetch = vi.fn(async () => (typeof answer === "function" ? answer() : respond(answer)));
  const reloadDashboard = vi.fn();
  const initial = { accountKey: ACCOUNT, isDashboardRoute: true, ...props };
  const hook = renderHook((current) => useStravaSync({ ...current, apiFetch, reloadDashboard }), {
    initialProps: initial
  });
  return { ...hook, apiFetch, reloadDashboard, initial };
};

/** @param {import("vitest").Mock<ApiFetch>} apiFetch */
const syncCalls = (apiFetch) =>
  apiFetch.mock.calls.filter(([path]) => path === "/api/integrations/strava/sync");

describe("when it syncs", () => {
  test("once on entering the dashboard, as the quiet sync", async () => {
    const { apiFetch } = renderSync();

    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(1));
    // Each sync passes its options.
    expect(/** @type {RequestInit} */ (apiFetch.mock.calls[0][1]).body).toBe(
      JSON.stringify({ manual: false })
    );
  });

  test("not again while moving between dashboard views", async () => {
    const { apiFetch, rerender, initial } = renderSync();
    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(1));

    rerender({ ...initial });
    rerender({ ...initial });
    await act(async () => {});

    expect(syncCalls(apiFetch)).toHaveLength(1);
  });

  test("again on entering the dashboard after leaving it", async () => {
    const { apiFetch, rerender, initial } = renderSync();
    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(1));

    rerender({ ...initial, isDashboardRoute: false });
    rerender({ ...initial });

    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(2));
  });

  test("not off the dashboard, nor signed out", async () => {
    const away = renderSync({ isDashboardRoute: false });
    const signedOut = renderSync({ accountKey: "" });
    await act(async () => {});

    expect(away.apiFetch).not.toHaveBeenCalled();
    expect(signedOut.apiFetch).not.toHaveBeenCalled();
  });

  test("for each account that signs in", async () => {
    const { apiFetch, rerender, initial } = renderSync();
    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(1));

    rerender({ ...initial, accountKey: "" });
    rerender({ ...initial, accountKey: "dashboard:other@b.c" });

    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(2));
  });

  // The sync needs the server; it waits for a connection rather than failing.
  test("offline, not at all, and once the connection is back", async () => {
    markUnanswered();
    const { apiFetch } = renderSync();
    await act(async () => {});
    expect(apiFetch).not.toHaveBeenCalled();

    act(() => markAnswered());

    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(1));
  });

  test("not again when the connection drops and returns after it synced", async () => {
    const { apiFetch } = renderSync();
    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(1));

    act(() => markUnanswered());
    act(() => markAnswered());
    await act(async () => {});

    expect(syncCalls(apiFetch)).toHaveLength(1);
  });
});

describe("after it syncs", () => {
  test.each([
    ["imported", { imported: 1, updated: 0, removed: 0 }],
    ["updated", { imported: 0, updated: 2, removed: 0 }],
    ["removed", { imported: 0, updated: 0, removed: 1 }]
  ])("reloads the dashboard when it %s a workout", async (_label, answer) => {
    const { reloadDashboard } = renderSync({ answer });

    await waitFor(() => expect(reloadDashboard).toHaveBeenCalledTimes(1));
  });

  test.each([
    ["changed nothing", { imported: 0, updated: 0, removed: 0 }],
    ["was skipped inside the throttle", { skipped: true }],
    ["did not finish", { error: "unavailable" }]
  ])("does not reload when it %s", async (_label, answer) => {
    const { apiFetch, reloadDashboard } = renderSync({ answer });
    await waitFor(() => expect(syncCalls(apiFetch)).toHaveLength(1));
    await act(async () => {});

    expect(reloadDashboard).not.toHaveBeenCalled();
  });

  // Without Strava on the server the route answers 404, which is expected.
  test("swallows a refused or failed request, and reloads nothing", async () => {
    const refused = renderSync({
      answer: () => respond({ error: "Strava is not available." }, false)
    });
    const failed = renderSync({
      answer: () => {
        throw new TypeError("Failed to fetch");
      }
    });
    await waitFor(() => expect(refused.apiFetch).toHaveBeenCalled());
    await waitFor(() => expect(failed.apiFetch).toHaveBeenCalled());
    await act(async () => {});

    expect(refused.reloadDashboard).not.toHaveBeenCalled();
    expect(failed.reloadDashboard).not.toHaveBeenCalled();
  });
});
