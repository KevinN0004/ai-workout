import { describe, expect, test } from "vitest";
import {
  isNewInstance,
  readBaseline,
  readUptimeSec,
  validateDeployInputs,
  waitForNewInstance
} from "../manual-deploy.mjs";

// Importing the script must not migrate anything or POST a deploy hook -- the
// module guards its side effects behind a direct-invocation check. These tests
// passing at all is part of what proves that guard holds.

const NEON = "postgresql://user:pw@ep-cool-name-pooler.us-east-2.aws.neon.tech/neondb";
const VALID = {
  databaseUrl: `${NEON}?sslmode=verify-full`,
  hookUrl: "https://api.render.com/deploy/srv-abc123?key=xyz",
  serviceUrl: "https://ai-workout-example.onrender.com"
};

describe("validateDeployInputs", () => {
  test("accepts a pooled Neon URL with verify-full and reports no warnings", () => {
    const { errors, warnings, summary } = validateDeployInputs(VALID);

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(summary.databaseHost).toBe("ep-cool-name-pooler.us-east-2.aws.neon.tech");
    expect(summary.sslmode).toBe("verify-full");
  });

  test("names every missing variable at once rather than the first", () => {
    const { errors } = validateDeployInputs({});

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("PRODUCTION_DATABASE_URL");
    expect(errors[0]).toContain("RENDER_DEPLOY_HOOK_URL");
    expect(errors[0]).toContain("RENDER_SERVICE_URL");
  });

  test("rejects a localhost database, which is the dev one", () => {
    const { errors } = validateDeployInputs({
      ...VALID,
      databaseUrl: "postgresql://postgres:pw@127.0.0.1:55432/ai_workout"
    });

    expect(errors).toEqual([
      "PRODUCTION_DATABASE_URL points at localhost -- that is the dev database."
    ]);
  });

  test("rejects a non-postgres protocol", () => {
    const { errors } = validateDeployInputs({ ...VALID, databaseUrl: "https://example.com/db" });

    expect(errors.some((error) => error.includes("expected postgresql:"))).toBe(true);
  });

  test("warns rather than fails when sslmode is not verify-full", () => {
    const { errors, warnings } = validateDeployInputs({
      ...VALID,
      databaseUrl: `${NEON}?sslmode=require`
    });

    // A warning, not an error: pg treats require as an alias for verify-full
    // today, so this still connects. The runbook wants it spelled out so the
    // behaviour cannot drift on a major bump.
    expect(errors).toEqual([]);
    expect(warnings.some((warning) => warning.includes("verify-full"))).toBe(true);
  });

  test("warns when the host is not the pooled endpoint", () => {
    const { warnings } = validateDeployInputs({
      ...VALID,
      databaseUrl:
        "postgresql://user:pw@ep-cool-name.us-east-2.aws.neon.tech/neondb?sslmode=verify-full"
    });

    expect(warnings.some((warning) => warning.includes("-pooler"))).toBe(true);
  });

  test("warns about query params the pooled endpoint would reject", () => {
    const { warnings } = validateDeployInputs({
      ...VALID,
      databaseUrl: `${NEON}?sslmode=verify-full&options=-c%20timezone%3DUTC`
    });

    expect(warnings.some((warning) => warning.includes("options"))).toBe(true);
  });

  test("does not warn about channel_binding, which the driver handles", () => {
    // `neon connection-string --pooled` emits this by default. It is resolved by
    // the driver during SCRAM rather than sent on as a startup parameter, so
    // PgBouncer never sees it -- confirmed by connecting with pg 8.23. Warning
    // about the string Neon's own CLI produces would teach a reader to ignore
    // these warnings, which is worse than saying nothing.
    const { errors, warnings } = validateDeployInputs({
      ...VALID,
      databaseUrl: `${NEON}?sslmode=verify-full&channel_binding=require`
    });

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test("strips a trailing slash from the service URL", () => {
    // Left on, every polled URL would contain "//api/ready".
    const { serviceUrl } = validateDeployInputs({
      ...VALID,
      serviceUrl: "https://ai-workout-example.onrender.com/"
    });

    expect(serviceUrl).toBe("https://ai-workout-example.onrender.com");
  });

  test("does not leak the hook URL, only its length", () => {
    const { summary } = validateDeployInputs(VALID);

    expect(summary.hookLength).toBe(VALID.hookUrl.length);
    expect(JSON.stringify(summary)).not.toContain("xyz");
  });
});

// The wait used to accept the first "ready", and straight after the hook that
// comes from the OLD instance: Render keeps it serving until the new one passes
// its health check. On the #160 deploy the script reported READY three seconds
// after the hook, from an instance 907 s old; the new one took over ~95 s later.

const START = 1_000_000;
const readyBody = (uptimeSec) => JSON.stringify({ status: "ready", uptimeSec });

/**
 * A fake service on a fake clock. `respond(poll, nowMs)` returns the body for
 * each /api/ready poll, or an Error for no response; each sleep advances the
 * clock, so an old instance's uptime can grow with it as the real one does.
 */
const fakeService = (respond) => {
  let clock = START;
  let poll = 0;
  const urls = [];
  const sleeps = [];
  return {
    now: () => clock,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    fetchImpl: async (url) => {
      urls.push(url);
      poll += 1;
      const body = respond(poll, clock);
      if (body instanceof Error) throw body;
      return { text: async () => body };
    },
    urls,
    sleeps
  };
};

// An old instance whose uptime was 905 s at START, still counting.
const oldInstance = (nowMs) => readyBody(905 + (nowMs - START) / 1000);
const BASELINE = { uptimeSec: 905, atMs: START };

describe("readUptimeSec", () => {
  test("reads a numeric uptime", () => {
    expect(readUptimeSec('{"status":"ok","uptimeSec":907}')).toBe(907);
  });

  test("keeps a measured 0 -- an instance that has just started", () => {
    expect(readUptimeSec('{"uptimeSec":0}')).toBe(0);
  });

  // Absent is not zero. A 0 would read as a fresh instance and end the wait on
  // the old one, so every spelling of "no reading" must come back unknown.
  test.each([
    ["null", '{"uptimeSec":null}'],
    ["an empty string", '{"uptimeSec":""}'],
    ["a missing key", '{"status":"ready"}'],
    ["a numeric string", '{"uptimeSec":"12"}'],
    ["a negative number", '{"uptimeSec":-1}'],
    ["a body that is not JSON", "<html>Not Found</html>"],
    ["an empty body", ""]
  ])("treats %s as unknown", (_label, body) => {
    expect(readUptimeSec(body)).toBeNull();
  });
});

describe("isNewInstance", () => {
  test("counts anything when nothing was serving before the hook", () => {
    expect(isNewInstance({ baseline: null, observedUptimeSec: null, nowMs: START })).toBe(true);
  });

  test("rejects the old instance, whose uptime kept counting", () => {
    expect(
      isNewInstance({ baseline: BASELINE, observedUptimeSec: 965, nowMs: START + 60_000 })
    ).toBe(false);
  });

  test("accepts an instance younger than the old one would now be", () => {
    // The #160 switch-over: 16 s old, ~95 s after a 905 s baseline.
    expect(
      isNewInstance({ baseline: BASELINE, observedUptimeSec: 16, nowMs: START + 95_000 })
    ).toBe(true);
  });

  test("still works when the baseline read woke a sleeping instance", () => {
    // A cold free instance answers the baseline 2 s after starting. Measuring
    // against the old instance's extrapolated uptime, not the raw baseline, is
    // what keeps it from being mistaken for the new one 40 s later.
    const cold = { uptimeSec: 2, atMs: START };
    expect(isNewInstance({ baseline: cold, observedUptimeSec: 42, nowMs: START + 40_000 })).toBe(
      false
    );
    expect(isNewInstance({ baseline: cold, observedUptimeSec: 20, nowMs: START + 90_000 })).toBe(
      true
    );
  });

  test("does not accept an unknown uptime against a baseline", () => {
    expect(
      isNewInstance({ baseline: BASELINE, observedUptimeSec: null, nowMs: START + 60_000 })
    ).toBe(false);
  });

  test("leaves a margin for rounding and latency", () => {
    // Three seconds short of the old instance's extrapolated uptime is noise.
    expect(
      isNewInstance({ baseline: BASELINE, observedUptimeSec: 962, nowMs: START + 60_000 })
    ).toBe(false);
  });
});

describe("readBaseline", () => {
  test("records the serving instance's uptime and when it was read", async () => {
    const service = fakeService(() => '{"status":"ok","uptimeSec":905}');

    const baseline = await readBaseline("https://svc.example", {
      fetchImpl: service.fetchImpl,
      now: () => 123
    });

    expect(baseline).toEqual({ uptimeSec: 905, atMs: 123 });
    // /api/health, not /api/ready: health answers even when ready would not.
    expect(service.urls).toEqual(["https://svc.example/api/health"]);
  });

  test("is null when nothing answers", async () => {
    const service = fakeService(() => new Error("ECONNREFUSED"));

    expect(await readBaseline("https://svc.example", { fetchImpl: service.fetchImpl })).toBeNull();
  });

  test("is null when the answer carries no uptime -- Render's own error page", async () => {
    const service = fakeService(() => "Not Found");

    expect(await readBaseline("https://svc.example", { fetchImpl: service.fetchImpl })).toBeNull();
  });
});

describe("waitForNewInstance", () => {
  const run = (service, baseline, attempts = 6) =>
    waitForNewInstance({
      serviceUrl: "https://svc.example",
      baseline,
      attempts,
      intervalMs: 15_000,
      fetchImpl: service.fetchImpl,
      now: service.now,
      sleepImpl: service.sleepImpl,
      log: () => {}
    });

  test("keeps waiting while the old instance answers ready, then returns on the new one", async () => {
    // Three polls of the old instance -- each of which the previous version of
    // this wait accepted -- and then the switch-over.
    const service = fakeService((poll, nowMs) => (poll <= 3 ? oldInstance(nowMs) : readyBody(16)));

    const result = await run(service, BASELINE);

    expect(result.ok).toBe(true);
    expect(result.attempt).toBe(4);
  });

  test("fails when only the old instance ever answers", async () => {
    // A new build that never passes Render's health check: the old instance
    // keeps answering ready throughout. This used to report success.
    const service = fakeService((_poll, nowMs) => oldInstance(nowMs));

    const result = await run(service, BASELINE, 4);

    expect(result.ok).toBe(false);
    // No pointless sleep after the last attempt.
    expect(service.sleeps).toHaveLength(3);
  });

  test("does not count a new instance that is up but not ready", async () => {
    const service = fakeService((poll) =>
      poll === 1 ? JSON.stringify({ status: "not_ready", uptimeSec: 5 }) : readyBody(20)
    );

    const result = await run(service, BASELINE);

    expect(result.attempt).toBe(2);
  });

  test("with nothing serving before the hook, the first ready counts", async () => {
    const service = fakeService((poll) =>
      poll === 1 ? new Error("no instance yet") : readyBody(12)
    );

    const result = await run(service, null);

    expect(result.ok).toBe(true);
    expect(result.attempt).toBe(2);
  });

  test("never ends the wait on a ready body with no uptime", async () => {
    // Fail-safe: if /api/ready ever stops reporting uptimeSec, deploys time out
    // loudly instead of passing on the old instance.
    const service = fakeService(() => '{"status":"ready"}');

    expect((await run(service, BASELINE, 3)).ok).toBe(false);
  });
});
