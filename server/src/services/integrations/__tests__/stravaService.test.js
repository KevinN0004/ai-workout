import { describe, expect, test, vi } from "vitest";
import { createStravaService } from "../stravaService.js";
import { createTokenCipher } from "../tokenCipher.js";

// The Strava service's token handling and single-activity import (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "Tokens", "The import rules").
// The repositories are in-memory fakes, fetch is stubbed, and the clock is fixed.

const NOW = new Date("2026-11-13T10:00:00Z");
const KEY = Buffer.alloc(32);
const cipher = createTokenCipher(KEY);
const CONFIG = {
  clientId: "12345",
  clientSecret: "test-client-secret",
  key: KEY,
  webBase: "http://strava.test",
  verifyToken: null,
  subscriptionId: null
};
const minutesFromNow = (minutes) => new Date(NOW.getTime() + minutes * 60000);

const answer = (status, body = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

const NEW_TOKENS = {
  access_token: "access-new",
  refresh_token: "refresh-new",
  expires_at: Math.floor(minutesFromNow(360).getTime() / 1000)
};

const ACTIVITY = {
  id: 9001,
  name: "Morning run",
  sport_type: "Run",
  start_date_local: "2026-11-12T07:15:00Z",
  moving_time: 1800,
  distance: 5000,
  has_heartrate: false
};

const connectionRow = (overrides = {}) => ({
  userPk: "pk-1",
  athleteId: 4242,
  athleteName: "Jo S.",
  accessToken: cipher.seal("access-old"),
  refreshToken: cipher.seal("refresh-old"),
  expiresAt: minutesFromNow(120),
  connectedAt: new Date("2026-11-01T00:00:00Z"),
  lastSyncedAt: null,
  lastSyncError: null,
  needsReconnect: false,
  ...overrides
});

// The connection store over one row. `underLock` replaces the row the lock reads,
// to stage a refresh another request finished first.
const fakeConnections = (row, { underLock } = {}) => {
  const state = { row, locks: 0, updates: [], reconnects: 0 };
  return {
    state,
    findConnection: async () => (state.row ? { ...state.row } : null),
    withRefreshLock: async (_args, fn) => {
      state.locks += 1;
      const locked = underLock === undefined ? state.row : underLock;
      return locked ? fn("tx", { ...locked }) : null;
    },
    updateTokens: async (tx, { accessToken, refreshToken, expiresAt }) => {
      state.updates.push({ tx, accessToken, refreshToken, expiresAt });
      state.row = { ...state.row, accessToken, refreshToken, expiresAt, needsReconnect: false };
    },
    markNeedsReconnect: async () => {
      state.reconnects += 1;
      state.row = { ...state.row, needsReconnect: true };
      return 1;
    },
    // `holder` is the user another account's link to the same athlete belongs to.
    saveConnection: async (args) => {
      if (state.holder && state.holder !== args.userId) return { conflict: true };
      if (state.unknownUser) return null;
      state.saved = args;
      state.row = connectionRow({ ...args, userPk: args.userId });
      return state.row;
    },
    markSynced: async ({ at }) => {
      state.synced = at;
      return 1;
    },
    markSyncFailed: async ({ error }) => {
      state.failed = error;
      return 1;
    },
    findConnectionByAthlete: async ({ athleteId }) =>
      state.row && state.row.athleteId === athleteId ? { ...state.row } : null,
    removeConnectionAndImports: async () => {
      state.removedAll = (state.removedAll || 0) + 1;
      state.row = null;
      return { removed: 2 };
    }
  };
};

// `unchanged` lists the imports a save finds already up to date, and `held`
// the imports a listing since a date answers.
const fakeImports = ({
  deleted = [],
  existing = [],
  appDays = [],
  unchanged = [],
  held = []
} = {}) => {
  const state = { saved: [], removed: [], dayChecks: [], since: [] };
  return {
    state,
    isDeletedHere: async ({ externalId }) => deleted.includes(externalId),
    hasImport: async ({ externalId }) => existing.includes(externalId),
    hasAppWorkoutOn: async ({ date }) => {
      state.dayChecks.push(date);
      return appDays.includes(date);
    },
    saveImport: async ({ workout }) => {
      state.saved.push(workout);
      if (unchanged.includes(workout.externalId)) return "unchanged";
      return existing.includes(workout.externalId) ? "updated" : "created";
    },
    listImportsSince: async ({ since }) => {
      state.since.push(since);
      return held;
    },
    removeImport: async ({ externalId }) => {
      state.removed.push(externalId);
      return 1;
    }
  };
};

const serviceWith = ({
  row = connectionRow(),
  underLock,
  imports = fakeImports(),
  responses = [],
  config = CONFIG
} = {}) => {
  const connections = fakeConnections(row, { underLock });
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected Strava call");
    return next;
  });
  const service = createStravaService({
    connections,
    imports,
    getConfig: () => config,
    fetchImpl,
    now: () => NOW
  });
  return { service, connections, imports, fetchImpl };
};

describe("accessTokenFor", () => {
  test("a token with time left is opened, and Strava is not called", async () => {
    const { service, connections, fetchImpl } = serviceWith();

    expect(await service.accessTokenFor("u-1")).toBe("access-old");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(connections.state.locks).toBe(0);
  });

  test("a token within five minutes of expiry is refreshed under the lock, and stored sealed", async () => {
    const { service, connections, fetchImpl } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(4) }),
      responses: [answer(200, NEW_TOKENS)]
    });

    expect(await service.accessTokenFor("u-1")).toBe("access-new");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(connections.state.updates).toHaveLength(1);
    const [stored] = connections.state.updates;
    expect(stored.tx).toBe("tx");
    expect(stored.accessToken).not.toContain("access-new");
    expect(cipher.open(stored.accessToken)).toBe("access-new");
    expect(cipher.open(stored.refreshToken)).toBe("refresh-new");
    expect(stored.expiresAt).toEqual(new Date(NEW_TOKENS.expires_at * 1000));
    const form = new URLSearchParams(String(fetchImpl.mock.calls[0][1].body));
    expect(form.get("refresh_token")).toBe("refresh-old");
  });

  test("a token exactly five minutes from expiry is refreshed", async () => {
    const { service } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(5) }),
      responses: [answer(200, NEW_TOKENS)]
    });
    expect(await service.accessTokenFor("u-1")).toBe("access-new");
  });

  test("when another request refreshed first, the token read under the lock is used", async () => {
    const { service, fetchImpl, connections } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(1) }),
      underLock: connectionRow({
        accessToken: cipher.seal("access-theirs"),
        expiresAt: minutesFromNow(360)
      })
    });

    expect(await service.accessTokenFor("u-1")).toBe("access-theirs");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(connections.state.updates).toHaveLength(0);
  });

  test("an access token that will not open under the lock marks the connection for reconnecting", async () => {
    const { service, connections, fetchImpl } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(1) }),
      underLock: connectionRow({ accessToken: "garbage", expiresAt: minutesFromNow(360) })
    });

    await expect(service.accessTokenFor("u-1")).rejects.toMatchObject({ kind: "reconnect" });
    expect(connections.state.reconnects).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("a refused refresh marks the connection for reconnecting, and deletes nothing", async () => {
    const { service, connections } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(1) }),
      responses: [answer(400, { message: "Bad Request" })]
    });

    await expect(service.accessTokenFor("u-1")).rejects.toMatchObject({ kind: "reconnect" });
    expect(connections.state.reconnects).toBe(1);
    expect(connections.state.row).not.toBeNull();
    expect(connections.state.updates).toHaveLength(0);
  });

  test("a refresh token that will not open marks the connection for reconnecting", async () => {
    const { service, connections, fetchImpl } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(1), refreshToken: "v1.not.sealed.here" })
    });

    await expect(service.accessTokenFor("u-1")).rejects.toMatchObject({ kind: "reconnect" });
    expect(connections.state.reconnects).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("an access token that will not open marks the connection for reconnecting", async () => {
    const { service, connections } = serviceWith({
      row: connectionRow({ accessToken: "garbage" })
    });

    await expect(service.accessTokenFor("u-1")).rejects.toMatchObject({ kind: "reconnect" });
    expect(connections.state.reconnects).toBe(1);
  });

  test("a Strava outage during a refresh is passed on, and marks nothing", async () => {
    const { service, connections } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(1) }),
      responses: [answer(503)]
    });

    await expect(service.accessTokenFor("u-1")).rejects.toMatchObject({ kind: "unavailable" });
    expect(connections.state.reconnects).toBe(0);
  });

  test("a store failure while saving refreshed tokens is passed on, and marks nothing", async () => {
    const { service, connections } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(1) }),
      responses: [answer(200, NEW_TOKENS)]
    });
    connections.updateTokens = async () => {
      throw new Error("database down");
    };

    await expect(service.accessTokenFor("u-1")).rejects.toThrow("database down");
    expect(connections.state.reconnects).toBe(0);
  });

  test("a connection already marked for reconnecting calls Strava for nothing", async () => {
    const { service, fetchImpl } = serviceWith({ row: connectionRow({ needsReconnect: true }) });

    await expect(service.accessTokenFor("u-1")).rejects.toMatchObject({ kind: "reconnect" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("no connection, before or under the lock, is not connected", async () => {
    await expect(serviceWith({ row: null }).service.accessTokenFor("u-1")).rejects.toMatchObject({
      kind: "not_connected"
    });
    await expect(
      serviceWith({
        row: connectionRow({ expiresAt: minutesFromNow(1) }),
        underLock: null
      }).service.accessTokenFor("u-1")
    ).rejects.toMatchObject({ kind: "not_connected" });
  });

  test("with no Strava configured, it is not configured", async () => {
    await expect(serviceWith({ config: null }).service.accessTokenFor("u-1")).rejects.toMatchObject(
      {
        kind: "not_configured"
      }
    );
  });
});

// A revoke event is unsigned, so only Strava refusing the refresh token
// confirms it; a token here that will not open is this server's fault, not
// proof (docs/specs/2026-11-12-strava-import-design.md, "The webhook").
describe("confirmRevoked", () => {
  test("Strava refusing a refresh confirms it, and nothing is marked", async () => {
    const { service, connections } = serviceWith({ responses: [answer(401)] });

    expect(await service.confirmRevoked("u-1")).toBe(true);
    expect(connections.state.reconnects).toBe(0);
  });

  test("a refresh Strava accepts refutes it, and its new tokens are kept", async () => {
    const { service, connections, fetchImpl } = serviceWith({
      responses: [answer(200, NEW_TOKENS)]
    });

    expect(await service.confirmRevoked("u-1")).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cipher.open(connections.state.row.refreshToken)).toBe("refresh-new");
  });

  test("it refreshes even a token with hours left, and one marked for reconnecting", async () => {
    const { service, fetchImpl } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(300), needsReconnect: true }),
      responses: [answer(401)]
    });

    expect(await service.confirmRevoked("u-1")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a refresh token that will not open proves nothing", async () => {
    const { service, fetchImpl } = serviceWith({ row: connectionRow({ refreshToken: "garbage" }) });

    expect(await service.confirmRevoked("u-1")).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("no connection proves nothing", async () => {
    expect(await serviceWith({ underLock: null }).service.confirmRevoked("u-1")).toBe(false);
  });

  test("a Strava outage is passed on", async () => {
    await expect(
      serviceWith({ responses: [answer(503)] }).service.confirmRevoked("u-1")
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("importActivity", () => {
  test("a new activity is fetched with the token, mapped and saved", async () => {
    const { service, imports, fetchImpl } = serviceWith({ responses: [answer(200, ACTIVITY)] });

    expect(await service.importActivity("u-1", "9001")).toBe("create");

    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://strava.test/api/v3/activities/9001");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer access-old");
    expect(imports.state.saved).toEqual([
      expect.objectContaining({
        externalId: "9001",
        workoutDate: "2026-11-12",
        distanceMeters: 5000
      })
    ]);
  });

  test("an activity already here is updated", async () => {
    const imports = fakeImports({ existing: ["9001"] });
    const { service } = serviceWith({ imports, responses: [answer(200, ACTIVITY)] });

    expect(await service.importActivity("u-1", "9001")).toBe("update");
    expect(imports.state.saved).toHaveLength(1);
  });

  test("an activity deleted here is not saved", async () => {
    const imports = fakeImports({ deleted: ["9001"] });
    const { service } = serviceWith({ imports, responses: [answer(200, ACTIVITY)] });

    expect(await service.importActivity("u-1", "9001")).toBe("skip-deleted");
    expect(imports.state.saved).toHaveLength(0);
  });

  test("a new strength activity on a day with an app workout is not saved", async () => {
    const imports = fakeImports({ appDays: ["2026-11-12"] });
    const { service } = serviceWith({
      imports,
      responses: [answer(200, { ...ACTIVITY, sport_type: "WeightTraining" })]
    });

    expect(await service.importActivity("u-1", "9001")).toBe("skip-duplicate");
    expect(imports.state.saved).toHaveLength(0);
  });

  test("an activity with no date is never matched against an undated workout", async () => {
    const imports = fakeImports({ appDays: [null] });
    const { service } = serviceWith({
      imports,
      responses: [answer(200, { ...ACTIVITY, sport_type: "Workout", start_date_local: undefined })]
    });

    expect(await service.importActivity("u-1", "9001")).toBe("create");
    expect(imports.state.dayChecks).toEqual([]);
  });
});

describe("removeIfGone", () => {
  test("an activity Strava no longer has is removed", async () => {
    const { service, imports } = serviceWith({
      responses: [answer(404, { message: "Not Found" })]
    });

    expect(await service.removeIfGone("u-1", 9001)).toBe(true);
    expect(imports.state.removed).toEqual(["9001"]);
  });

  test("an activity Strava still has stays", async () => {
    const { service, imports } = serviceWith({ responses: [answer(200, ACTIVITY)] });

    expect(await service.removeIfGone("u-1", "9001")).toBe(false);
    expect(imports.state.removed).toEqual([]);
  });

  test("any other answer is passed on, and removes nothing", async () => {
    const { service, imports } = serviceWith({ responses: [answer(500)] });

    await expect(service.removeIfGone("u-1", "9001")).rejects.toMatchObject({
      kind: "unavailable"
    });
    expect(imports.state.removed).toEqual([]);
  });
});

const EXCHANGED = {
  ...NEW_TOKENS,
  athlete: { id: 4242, firstname: "Jo", lastname: "Smith" }
};

describe("authorizeUrl", () => {
  test("Strava's authorize page, asking for every activity, with the state", () => {
    const { service } = serviceWith();
    const url = new URL(
      service.authorizeUrl({ redirectUri: "http://app.test/cb", state: "state-1" })
    );

    expect(url.origin + url.pathname).toBe("http://strava.test/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "12345",
      redirect_uri: "http://app.test/cb",
      response_type: "code",
      approval_prompt: "auto",
      scope: "activity:read_all",
      state: "state-1"
    });
  });
});

describe("connect", () => {
  test("the code's tokens are stored sealed, with the athlete", async () => {
    const { service, connections, fetchImpl } = serviceWith({
      row: null,
      responses: [answer(200, EXCHANGED)]
    });

    expect(await service.connect("u-1", "code-xyz")).toBe("connected");

    const form = new URLSearchParams(String(fetchImpl.mock.calls[0][1].body));
    expect(form.get("code")).toBe("code-xyz");
    const saved = connections.state.saved;
    expect(saved).toMatchObject({ userId: "u-1", athleteId: 4242, athleteName: "Jo S." });
    expect(saved.accessToken).not.toContain("access-new");
    expect(cipher.open(saved.accessToken)).toBe("access-new");
    expect(cipher.open(saved.refreshToken)).toBe("refresh-new");
  });

  test("an athlete linked to another account is taken, and that link is left alone", async () => {
    const { service, connections, fetchImpl } = serviceWith({
      row: null,
      responses: [answer(200, EXCHANGED)]
    });
    connections.state.holder = "u-2";

    expect(await service.connect("u-1", "code-xyz")).toBe("taken");
    // No revoke: Strava's grant is the athlete's, so revoking would cut u-2 off.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("a user who is gone by the time the tokens arrive is a failure", async () => {
    const { service, connections } = serviceWith({
      row: null,
      responses: [answer(200, EXCHANGED)]
    });
    connections.state.unknownUser = true;

    expect(await service.connect("u-1", "code-xyz")).toBe("failed");
  });

  test("a refused exchange is passed on", async () => {
    const { service } = serviceWith({ row: null, responses: [answer(403)] });
    await expect(service.connect("u-1", "code-xyz")).rejects.toMatchObject({ kind: "capacity" });
  });
});

describe("connectionState", () => {
  test("with no Strava configured, it is not available", async () => {
    expect(await serviceWith({ config: null }).service.connectionState("u-1")).toEqual({
      available: false,
      connected: false,
      athleteName: "",
      lastSyncedAt: null,
      lastSyncError: null,
      needsReconnect: false
    });
  });

  test("available and not connected", async () => {
    expect(await serviceWith({ row: null }).service.connectionState("u-1")).toMatchObject({
      available: true,
      connected: false,
      lastSyncedAt: null
    });
  });

  test("a connection's state, and never its tokens", async () => {
    const synced = new Date("2026-11-13T08:00:00Z");
    const state = await serviceWith({
      row: connectionRow({
        lastSyncedAt: synced,
        lastSyncError: "rate_limited",
        needsReconnect: true
      })
    }).service.connectionState("u-1");

    expect(state).toEqual({
      available: true,
      connected: true,
      athleteName: "Jo S.",
      lastSyncedAt: "2026-11-13T08:00:00.000Z",
      lastSyncError: "rate_limited",
      needsReconnect: true
    });
    expect(JSON.stringify(state)).not.toContain("v1.");
  });
});

describe("revokeAccess and disconnect", () => {
  test("revokeAccess sends the refresh token to Strava, and answers null", async () => {
    const { service, fetchImpl } = serviceWith({ responses: [answer(200, {})] });

    expect(await service.revokeAccess("u-1")).toBeNull();
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://strava.test/oauth/revoke");
    expect(new URLSearchParams(String(fetchImpl.mock.calls[0][1].body)).get("token")).toBe(
      "refresh-old"
    );
  });

  test("revokeAccess with nothing to revoke calls Strava for nothing", async () => {
    const { service, fetchImpl } = serviceWith({ row: null });
    expect(await service.revokeAccess("u-1")).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await serviceWith({ config: null }).service.revokeAccess("u-1")).toBeNull();
  });

  test("revokeAccess never throws: a refusal or an unreadable token answers its kind", async () => {
    expect(await serviceWith({ responses: [answer(503)] }).service.revokeAccess("u-1")).toBe(
      "unavailable"
    );
    expect(
      await serviceWith({ row: connectionRow({ refreshToken: "garbage" }) }).service.revokeAccess(
        "u-1"
      )
    ).toBe("unreadable");
  });

  test("revokeAccess answers a store failure as an error, without throwing", async () => {
    const { service, connections } = serviceWith();
    connections.findConnection = async () => {
      throw new Error("database down");
    };
    expect(await service.revokeAccess("u-1")).toBe("error");
  });

  test("disconnect revokes, then removes the connection and the imports", async () => {
    const { service, connections, fetchImpl } = serviceWith({ responses: [answer(200, {})] });

    expect(await service.disconnect("u-1")).toEqual({ removed: 2, revokeError: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(connections.state.removedAll).toBe(1);
  });

  test("disconnect removes everything even when the revoke fails", async () => {
    const { service, connections } = serviceWith({ responses: [answer(503)] });

    expect(await service.disconnect("u-1")).toEqual({ removed: 2, revokeError: "unavailable" });
    expect(connections.state.removedAll).toBe(1);
  });
});

describe("handleEvent", () => {
  const SUBSCRIBED = { ...CONFIG, subscriptionId: 77 };
  const eventOf = (overrides = {}) => ({
    object_type: "activity",
    object_id: 9001,
    aspect_type: "create",
    updates: {},
    owner_id: 4242,
    subscription_id: 77,
    ...overrides
  });
  const DEAUTH = eventOf({
    object_type: "athlete",
    object_id: 4242,
    aspect_type: "update",
    updates: { authorized: "false" }
  });
  const logger = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() });
  const handled = (options, body) => {
    const setup = serviceWith({ config: SUBSCRIBED, ...options });
    const log = logger();
    return { ...setup, log, outcome: setup.service.handleEvent(body, log) };
  };

  test.each([
    ["another subscription", { config: SUBSCRIBED }, eventOf({ subscription_id: 78 })],
    ["no subscription configured", { config: CONFIG }, eventOf()],
    ["no Strava configured", { config: null }, eventOf()],
    ["a malformed body", { config: SUBSCRIBED }, { owner_id: "who" }],
    ["an athlete nobody here connected", { config: SUBSCRIBED }, eventOf({ owner_id: 999 })],
    ["an aspect Strava does not send", { config: SUBSCRIBED }, eventOf({ aspect_type: "merge" })],
    [
      "an athlete event that revokes nothing",
      { config: SUBSCRIBED },
      eventOf({ object_type: "athlete" })
    ],
    ["an activity event with no id", { config: SUBSCRIBED }, eventOf({ object_id: "none" })]
  ])("%s is ignored, and Strava is not called", async (_label, options, body) => {
    const { outcome, fetchImpl, imports, connections } = handled(options, body);

    expect(await outcome).toBe("ignored");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(imports.state.saved).toEqual([]);
    expect(connections.state.removedAll).toBeUndefined();
  });

  test("a new activity is fetched and imported", async () => {
    const { outcome, imports } = handled({ responses: [answer(200, ACTIVITY)] }, eventOf());

    expect(await outcome).toBe("create");
    expect(imports.state.saved).toEqual([expect.objectContaining({ externalId: "9001" })]);
  });

  test("an edited activity is fetched and updated", async () => {
    const imports = fakeImports({ existing: ["9001"] });
    const { outcome } = handled(
      { imports, responses: [answer(200, ACTIVITY)] },
      eventOf({ aspect_type: "update", updates: { title: "Renamed" } })
    );

    expect(await outcome).toBe("update");
    expect(imports.state.saved).toHaveLength(1);
  });

  test("a delete Strava confirms removes the import", async () => {
    const { outcome, imports } = handled(
      { responses: [answer(404)] },
      eventOf({ aspect_type: "delete" })
    );

    expect(await outcome).toBe("removed");
    expect(imports.state.removed).toEqual(["9001"]);
  });

  test("a delete of an activity Strava still has removes nothing", async () => {
    const { outcome, imports } = handled(
      { responses: [answer(200, ACTIVITY)] },
      eventOf({ aspect_type: "delete" })
    );

    expect(await outcome).toBe("kept");
    expect(imports.state.removed).toEqual([]);
  });

  test("a revoke Strava confirms disconnects, removing the imports", async () => {
    const { outcome, connections } = handled({ responses: [answer(401)] }, DEAUTH);

    expect(await outcome).toBe("disconnected");
    expect(connections.state.removedAll).toBe(1);
  });

  test("a revoke the refresh refutes keeps everything, with the new tokens", async () => {
    const { outcome, connections } = handled({ responses: [answer(200, NEW_TOKENS)] }, DEAUTH);

    expect(await outcome).toBe("kept");
    expect(connections.state.removedAll).toBeUndefined();
    expect(cipher.open(connections.state.row.refreshToken)).toBe("refresh-new");
  });

  test("a revoke with a token here that will not open keeps everything", async () => {
    const { outcome, connections, fetchImpl } = handled(
      { row: connectionRow({ refreshToken: "garbage" }) },
      DEAUTH
    );

    expect(await outcome).toBe("kept");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(connections.state.removedAll).toBeUndefined();
  });

  test("a failure is logged by type, id and kind alone, and never thrown", async () => {
    const { outcome, log } = handled({ responses: [answer(503)] }, eventOf());

    expect(await outcome).toBe("failed");
    expect(log.warn).toHaveBeenCalledWith(
      {
        event: "strava_event_failed",
        objectType: "activity",
        aspectType: "create",
        objectId: "9001",
        kind: "unavailable"
      },
      expect.any(String)
    );
    const logged = JSON.stringify(log.warn.mock.calls);
    for (const secret of ["access-old", "refresh-old", "test-client-secret"]) {
      expect(logged).not.toContain(secret);
    }
  });

  test("a store failure is logged as an error, and never thrown", async () => {
    const setup = serviceWith({ config: SUBSCRIBED });
    setup.connections.findConnectionByAthlete = async () => {
      throw new Error("database down");
    };
    const log = logger();

    expect(await setup.service.handleEvent(eventOf(), log)).toBe("failed");
    expect(log.warn.mock.calls[0][0]).toMatchObject({ kind: "error" });
  });
});

describe("sync", () => {
  // NOW is 2026-11-13T10:00Z and the connection dates from 2026-11-01, so the
  // window is the last seven days: after 2026-11-06T10:00Z.
  const AFTER = Math.floor(Date.parse("2026-11-06T10:00:00Z") / 1000);
  const run = (id, overrides = {}) => ({ ...ACTIVITY, id, ...overrides });
  const page = (count, start = 1) => Array.from({ length: count }, (_, i) => run(start + i));
  const listCalls = (fetchImpl) =>
    fetchImpl.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/api/v3/athlete/activities");

  test("lists the last seven days, imports each activity, and counts what changed", async () => {
    const imports = fakeImports({ existing: ["2", "3"], unchanged: ["3"] });
    const { service, fetchImpl, connections } = serviceWith({
      imports,
      responses: [answer(200, [run(1), run(2), run(3)])]
    });

    expect(await service.sync("u-1")).toEqual({
      imported: 1,
      updated: 1,
      removed: 0,
      lastSyncedAt: NOW.toISOString()
    });

    const [call] = listCalls(fetchImpl);
    expect(Object.fromEntries(call.searchParams)).toEqual({
      after: String(AFTER),
      page: "1",
      per_page: "100"
    });
    expect(imports.state.saved.map((workout) => workout.externalId)).toEqual(["1", "2", "3"]);
    expect(connections.state.synced).toEqual(NOW);
  });

  test("never reaches back past the moment of connecting", async () => {
    const connectedAt = new Date("2026-11-12T08:00:00Z");
    const { service, fetchImpl } = serviceWith({
      row: connectionRow({ connectedAt }),
      responses: [answer(200, [])]
    });

    await service.sync("u-1");
    expect(listCalls(fetchImpl)[0].searchParams.get("after")).toBe(
      String(Math.floor(connectedAt.getTime() / 1000))
    );
  });

  test("the import rules apply to a listed activity, as to a webhook's", async () => {
    const imports = fakeImports({ deleted: ["1"], appDays: ["2026-11-12"] });
    const { service } = serviceWith({
      imports,
      responses: [answer(200, [run(1), run(2, { sport_type: "WeightTraining" }), run(3)])]
    });

    expect(await service.sync("u-1")).toMatchObject({ imported: 1, updated: 0 });
    expect(imports.state.saved.map((workout) => workout.externalId)).toEqual(["3"]);
  });

  test("a complete list removes the imports Strava no longer lists, past the first two days", async () => {
    const imports = fakeImports({
      held: [
        { id: "a", externalId: "1", date: "2026-11-10" },
        { id: "b", externalId: "9", date: "2026-11-11" }
      ]
    });
    const { service } = serviceWith({ imports, responses: [answer(200, [run(1)])] });

    expect(await service.sync("u-1")).toMatchObject({ removed: 1 });
    expect(imports.state.removed).toEqual(["9"]);
    // The window opens on 6 Nov in UTC, which can be the 5th or the 7th where
    // the athlete is; the first two days are left to the webhook.
    expect(imports.state.since).toEqual(["2026-11-08"]);
  });

  test("pages until a short page, and a full third page leaves the list incomplete", async () => {
    const imports = fakeImports({ held: [{ id: "a", externalId: "999", date: "2026-11-12" }] });
    const { service, fetchImpl } = serviceWith({
      imports,
      responses: [answer(200, page(100)), answer(200, page(100, 101)), answer(200, page(100, 201))]
    });

    expect(await service.sync("u-1")).toMatchObject({ imported: 300, removed: 0 });
    expect(listCalls(fetchImpl).map((url) => url.searchParams.get("page"))).toEqual([
      "1",
      "2",
      "3"
    ]);
    expect(imports.state.removed).toEqual([]);
  });

  test("a short second page completes the list", async () => {
    const imports = fakeImports({ held: [{ id: "a", externalId: "999", date: "2026-11-12" }] });
    const { service } = serviceWith({
      imports,
      responses: [answer(200, page(100)), answer(200, page(5, 101))]
    });

    expect(await service.sync("u-1")).toMatchObject({ imported: 105, removed: 1 });
  });

  test("a failing page stops the sync, records why, and deletes nothing", async () => {
    const imports = fakeImports({ held: [{ id: "a", externalId: "999", date: "2026-11-12" }] });
    const { service, connections } = serviceWith({
      imports,
      responses: [answer(200, page(100)), answer(429)]
    });

    expect(await service.sync("u-1")).toEqual({ error: "rate_limited" });
    expect(connections.state.failed).toBe("rate_limited");
    expect(connections.state.synced).toBeUndefined();
    expect(imports.state.removed).toEqual([]);
  });

  test("a refused refresh answers reconnect, and imports nothing", async () => {
    const { service, imports } = serviceWith({
      row: connectionRow({ expiresAt: minutesFromNow(1) }),
      responses: [answer(400)]
    });

    expect(await service.sync("u-1")).toEqual({ error: "reconnect" });
    expect(imports.state.saved).toEqual([]);
  });

  test("a store failure is recorded as an error", async () => {
    const imports = fakeImports();
    imports.saveImport = async () => {
      throw new Error("database down");
    };
    const { service, connections } = serviceWith({
      imports,
      responses: [answer(200, [run(1)])]
    });

    expect(await service.sync("u-1")).toEqual({ error: "error" });
    expect(connections.state.failed).toBe("error");
  });

  test("no connection is not connected", async () => {
    expect(await serviceWith({ row: null }).service.sync("u-1")).toEqual({
      error: "not_connected"
    });
  });

  test("a sync within fifteen minutes of the last one is skipped", async () => {
    const { service, fetchImpl } = serviceWith({
      row: connectionRow({ lastSyncedAt: new Date(NOW.getTime() - 14 * 60000) })
    });

    expect(await service.sync("u-1")).toEqual({ skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("Sync now may run a minute after the last one, and not sooner", async () => {
    const minuteAgo = serviceWith({
      row: connectionRow({ lastSyncedAt: new Date(NOW.getTime() - 60000) }),
      responses: [answer(200, [])]
    });
    expect(await minuteAgo.service.sync("u-1", { manual: true })).toMatchObject({ imported: 0 });

    const secondsAgo = serviceWith({
      row: connectionRow({ lastSyncedAt: new Date(NOW.getTime() - 30000) })
    });
    expect(await secondsAgo.service.sync("u-1", { manual: true })).toEqual({ skipped: true });
  });

  test("a second sync straight after a failed one is skipped, so an outage is not hammered", async () => {
    const { service, fetchImpl } = serviceWith({ responses: [answer(503)] });

    expect(await service.sync("u-1")).toEqual({ error: "unavailable" });
    expect(await service.sync("u-1")).toEqual({ skipped: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
