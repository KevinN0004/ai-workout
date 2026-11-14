import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SettingsStravaPanel from "../SettingsStravaPanel";
import { markUnanswered } from "../../../../app/connection";

// The Connected Apps tab's Strava panel (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "The client"): one state per
// answer from GET /api/integrations/strava, the connect, the sync, the
// disconnect behind a confirm, and the result Strava's return leaves in the
// query. apiFetch is faked per route; the server's answers are pinned in
// server/src/routes/integrations/__tests__.

const respond = (body, ok = true) => ({ ok, json: async () => body });

const CONNECTED = {
  available: true,
  connected: true,
  athleteName: "Jo S.",
  lastSyncedAt: null,
  lastSyncError: null,
  needsReconnect: false
};
const NOT_CONNECTED = { ...CONNECTED, connected: false, athleteName: "" };
const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize?client_id=1";

// A fake apiFetch: `routes` maps "METHOD path" to a function giving the
// response, so a test can change what a route answers between calls.
const fakeApi = (routes) =>
  vi.fn(async (path, options) => {
    const key = `${options?.method || "GET"} ${path}`;
    if (!routes[key]) throw new Error(`Unexpected request: ${key}`);
    return routes[key]();
  });

const stateRoute = (state) => ({ "GET /api/integrations/strava": () => respond(state) });

// `onImportsChange` is App's reloadDashboard: a sync that changed workouts, or
// a disconnect, leaves the dashboard's copy stale.
const renderPanel = (apiFetch) => {
  const onImportsChange = vi.fn();
  const utils = render(
    <SettingsStravaPanel apiFetch={apiFetch} onImportsChange={onImportsChange} />
  );
  return { ...utils, onImportsChange };
};

// A promise the test settles when it chooses.
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  window.history.replaceState(null, "", "/dashboard/settings");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("loading the connection", () => {
  test("says it is checking until the state arrives", async () => {
    const pending = deferred();
    renderPanel(fakeApi({ "GET /api/integrations/strava": () => pending.promise }));

    expect(screen.getByText("Checking your Strava connection...")).toBeInTheDocument();
    await act(async () => pending.resolve(respond(NOT_CONNECTED)));
    expect(screen.queryByText("Checking your Strava connection...")).toBeNull();
  });

  test("shows the error when the state cannot be read", async () => {
    renderPanel(
      fakeApi({
        "GET /api/integrations/strava": () => respond({ error: "Session expired." }, false)
      })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Session expired.");
  });

  test("without Strava on the server, says it is not available, with nothing to press", async () => {
    renderPanel(fakeApi(stateRoute({ ...NOT_CONNECTED, available: false })));

    expect(await screen.findByText("Not available")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("connecting", () => {
  test("shows Strava's own button, which leaves for Strava's authorize page", async () => {
    const assign = vi.fn();
    const connect = deferred();
    const apiFetch = fakeApi({
      ...stateRoute(NOT_CONNECTED),
      "POST /api/integrations/strava/connect": () => connect.promise
    });
    renderPanel(apiFetch);

    const button = await screen.findByRole("button", { name: "Connect with Strava" });
    expect(button.querySelector("img")).toHaveAttribute("src", expect.stringContaining("strava"));
    vi.stubGlobal("location", { ...window.location, assign });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    await act(async () => connect.resolve(respond({ url: AUTHORIZE_URL })));
    expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL);
  });

  test("a refused connect shows why, and the button works again", async () => {
    renderPanel(
      fakeApi({
        ...stateRoute(NOT_CONNECTED),
        "POST /api/integrations/strava/connect": () =>
          respond({ error: "Strava is not available." }, false)
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Connect with Strava" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Strava is not available.");
    expect(screen.getByRole("button", { name: "Connect with Strava" })).toBeEnabled();
  });
});

describe("connected", () => {
  test("names the athlete, and says it has not synced yet", async () => {
    renderPanel(fakeApi(stateRoute(CONNECTED)));

    expect(await screen.findByText("Connected as Jo S.")).toBeInTheDocument();
    expect(screen.getByText("Not synced yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Connect with Strava" })).toBeNull();
  });

  test("without a name, says it is connected to Strava", async () => {
    renderPanel(fakeApi(stateRoute({ ...CONNECTED, athleteName: "" })));

    expect(await screen.findByText("Connected to Strava")).toBeInTheDocument();
  });

  test("says how long ago it last synced", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
    renderPanel(fakeApi(stateRoute({ ...CONNECTED, lastSyncedAt: "2026-11-13T11:55:00Z" })));

    expect(await screen.findByText("Last synced 5 min ago")).toBeInTheDocument();
  });

  // The server's clock can run ahead of the device's.
  test("a sync time ahead of this device's clock reads as just now", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
    renderPanel(fakeApi(stateRoute({ ...CONNECTED, lastSyncedAt: "2026-11-13T12:00:30Z" })));

    expect(await screen.findByText("Last synced just now")).toBeInTheDocument();
  });

  test("after a sync that did not finish, says it will try again", async () => {
    renderPanel(fakeApi(stateRoute({ ...CONNECTED, lastSyncError: "unavailable" })));

    expect(
      await screen.findByText("The last sync didn't finish. It will try again.")
    ).toBeInTheDocument();
  });

  test("when Strava needs connecting again, offers Reconnect in place of Sync now", async () => {
    const assign = vi.fn();
    renderPanel(
      fakeApi({
        ...stateRoute({ ...CONNECTED, needsReconnect: true, lastSyncError: "reconnect" }),
        "POST /api/integrations/strava/connect": () => respond({ url: AUTHORIZE_URL })
      })
    );

    const reconnect = await screen.findByRole("button", { name: "Reconnect Strava" });
    expect(
      screen.getByText("Strava needs you to connect again before it can sync.")
    ).toBeInTheDocument();
    // It will not try again on its own, so the retry line would be wrong.
    expect(screen.queryByText("The last sync didn't finish. It will try again.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();

    vi.stubGlobal("location", { ...window.location, assign });
    await userEvent.click(reconnect);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL));
  });
});

describe("Sync now", () => {
  // The panel reads the state again after a sync, so the route answers the
  // second state from then on.
  const syncing = (answer, after = CONNECTED) => {
    let state = CONNECTED;
    const sync = deferred();
    const apiFetch = fakeApi({
      "GET /api/integrations/strava": () => respond(state),
      "POST /api/integrations/strava/sync": () => {
        state = after;
        return sync.promise;
      }
    });
    return { apiFetch, finish: () => act(async () => sync.resolve(respond(answer))) };
  };

  test("runs a manual sync, disabled while it runs, then shows the counts and the new time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
    const { apiFetch, finish } = syncing(
      { imported: 2, updated: 1, removed: 1, lastSyncedAt: "2026-11-13T12:00:00Z" },
      { ...CONNECTED, lastSyncedAt: "2026-11-13T12:00:00Z" }
    );
    const { onImportsChange } = renderPanel(apiFetch);

    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));

    expect(screen.getByRole("button", { name: "Syncing..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeDisabled();
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/integrations/strava/sync",
      expect.objectContaining({ body: JSON.stringify({ manual: true }) })
    );
    await finish();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Sync finished: 2 new, 1 updated, 1 removed."
    );
    expect(onImportsChange).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Last synced just now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
  });

  test("a sync that changed nothing says so", async () => {
    const { apiFetch, finish } = syncing({ imported: 0, updated: 0, removed: 0 });
    const { onImportsChange } = renderPanel(apiFetch);

    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    await finish();

    expect(screen.getByRole("status")).toHaveTextContent("Sync finished. Nothing new.");
    expect(onImportsChange).not.toHaveBeenCalled();
  });

  test("a sync inside the throttle says to wait a minute", async () => {
    const { apiFetch, finish } = syncing({ skipped: true });
    const { onImportsChange } = renderPanel(apiFetch);

    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    await finish();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Synced a moment ago. Try again in a minute."
    );
    expect(onImportsChange).not.toHaveBeenCalled();
  });

  test("a sync that did not finish says so, and the state read after it shows why", async () => {
    const { apiFetch, finish } = syncing(
      { error: "unavailable" },
      { ...CONNECTED, lastSyncError: "unavailable" }
    );
    const { onImportsChange } = renderPanel(apiFetch);

    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));
    await finish();

    expect(screen.getByRole("status")).toHaveTextContent(
      "The sync didn't finish. Try again later."
    );
    expect(onImportsChange).not.toHaveBeenCalled();
    expect(
      await screen.findByText("The last sync didn't finish. It will try again.")
    ).toBeInTheDocument();
  });

  test("a refused sync shows the server's message", async () => {
    renderPanel(
      fakeApi({
        ...stateRoute(CONNECTED),
        "POST /api/integrations/strava/sync": () =>
          respond({ error: "Strava is not available." }, false)
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Strava is not available.");
    expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
  });

  test("when the state cannot be read again after a sync, the panel stays as it was", async () => {
    let reads = 0;
    renderPanel(
      fakeApi({
        "GET /api/integrations/strava": () => {
          reads += 1;
          return reads === 1 ? respond(CONNECTED) : respond({ error: "Busy." }, false);
        },
        "POST /api/integrations/strava/sync": () =>
          respond({ imported: 1, updated: 0, removed: 0, lastSyncedAt: "2026-11-13T12:00:00Z" })
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Sync now" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Sync finished: 1 new, 0 updated, 0 removed."
    );
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByText("Connected as Jo S.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("disconnecting", () => {
  test("asks first, saying what goes, and puts focus on Cancel", async () => {
    renderPanel(fakeApi(stateRoute(CONNECTED)));

    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

    expect(
      screen.getByText("Your workouts imported from Strava will be removed.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Sync now" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Your workouts imported from Strava will be removed.")).toBeNull();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeInTheDocument();
  });

  test("on confirming, disconnects, says so, and shows the Connect button", async () => {
    let state = CONNECTED;
    const done = deferred();
    const apiFetch = fakeApi({
      "GET /api/integrations/strava": () => respond(state),
      "DELETE /api/integrations/strava": () => {
        state = NOT_CONNECTED;
        return done.promise;
      }
    });
    const { onImportsChange } = renderPanel(apiFetch);

    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm disconnect" }));

    expect(screen.getByRole("button", { name: "Disconnecting..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => done.resolve(respond({ ok: true })));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Strava is disconnected, and the workouts imported from it are removed."
    );
    expect(onImportsChange).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Connect with Strava" })).toBeEnabled();
  });

  test("a refused disconnect shows why, and keeps the confirm open", async () => {
    const { onImportsChange } = renderPanel(
      fakeApi({
        ...stateRoute(CONNECTED),
        "DELETE /api/integrations/strava": () => respond({ error: "Try again." }, false)
      })
    );

    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm disconnect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Try again.");
    expect(screen.getByRole("button", { name: "Confirm disconnect" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(onImportsChange).not.toHaveBeenCalled();
  });
});

describe("the result Strava's return leaves", () => {
  test.each([
    ["connected", "Strava is connected. New activities will arrive here."],
    ["cancelled", "Connecting Strava was cancelled."],
    ["no-access", "Strava did not share your activities. Connect again, and allow access to them."],
    ["limit", "Strava isn't accepting more connections for this app yet."],
    ["taken", "That Strava account is already connected to another account here."],
    ["unavailable", "Strava could not be reached. Try again in a few minutes."],
    ["failed", "Connecting Strava did not finish. Try again."]
  ])("%s is shown, and leaves the address", async (result, message) => {
    window.history.replaceState(null, "", `/dashboard/settings?strava=${result}`);
    renderPanel(fakeApi(stateRoute(CONNECTED)));

    expect(screen.getByRole("status")).toHaveTextContent(message);
    expect(window.location.pathname).toBe("/dashboard/settings");
    expect(window.location.search).toBe("");
    await screen.findByText("Connected as Jo S.");
  });

  test("is shown once: opening the panel again shows nothing", async () => {
    window.history.replaceState(null, "", "/dashboard/settings?strava=connected");
    const apiFetch = fakeApi(stateRoute(CONNECTED));
    const first = renderPanel(apiFetch);
    await screen.findByText("Connected as Jo S.");
    first.unmount();

    renderPanel(apiFetch);

    await screen.findByText("Connected as Jo S.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("keeps the rest of the address", async () => {
    window.history.replaceState(null, "", "/dashboard/settings?keep=1&strava=cancelled#top");
    renderPanel(fakeApi(stateRoute(CONNECTED)));

    expect(window.location.search).toBe("?keep=1");
    expect(window.location.hash).toBe("#top");
    await screen.findByText("Connected as Jo S.");
  });

  // "constructor" is a member every object inherits, never a result.
  test.each(["xyz", "constructor", ""])(
    "an unknown result %j shows nothing, and still leaves the address",
    async (result) => {
      window.history.replaceState(null, "", `/dashboard/settings?strava=${result}`);
      renderPanel(fakeApi(stateRoute(CONNECTED)));

      await screen.findByText("Connected as Jo S.");
      expect(screen.queryByRole("status")).toBeNull();
      expect(window.location.search).toBe("");
    }
  );
});

// Connecting, syncing and disconnecting all need the server
// (docs/specs/2026-11-06-offline-ready-pwa-design.md).
describe("offline", () => {
  test("Connect is disabled, and says why", async () => {
    renderPanel(fakeApi(stateRoute(NOT_CONNECTED)));
    const button = await screen.findByRole("button", { name: "Connect with Strava" });

    act(() => markUnanswered());

    expect(button).toBeDisabled();
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });

  test("Sync now, Disconnect, Reconnect and Confirm disconnect are disabled", async () => {
    const { unmount } = renderPanel(fakeApi(stateRoute(CONNECTED)));
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));

    act(() => markUnanswered());

    expect(screen.getByRole("button", { name: "Confirm disconnect" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeDisabled();
    unmount();

    renderPanel(fakeApi(stateRoute({ ...CONNECTED, needsReconnect: true })));
    expect(await screen.findByRole("button", { name: "Reconnect Strava" })).toBeDisabled();
  });
});
