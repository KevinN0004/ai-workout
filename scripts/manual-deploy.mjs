#!/usr/bin/env node
/*
 * manual-deploy.mjs
 *
 * Does by hand what .github/workflows/deploy.yml does, in the same order, for
 * when Actions cannot run it -- a billing block, an outage, or a deploy from a
 * machine rather than CI.
 *
 *   1. Validate the inputs                (the workflow does NOT do this)
 *   2. Apply migrations                   <- must precede the deploy
 *   3. Record the instance serving now, then POST the Render deploy hook
 *   4. Poll /api/ready until the NEW instance reports ready
 *
 * The ordering is the reason the workflow exists rather than letting Render
 * deploy on push: 002_password_changed_at.sql adds a column userReadRepository
 * selects on every user read, so code started against an unmigrated database
 * fails every authenticated request, not just the new routes. Migration failure
 * here stops the deploy, exactly as it does in the workflow.
 *
 * Reads three variables and never prints their values:
 *   PRODUCTION_DATABASE_URL   Neon POOLED string, with ?sslmode=verify-full
 *   RENDER_DEPLOY_HOOK_URL    Render -> the service -> Settings -> Deploy Hook
 *   RENDER_SERVICE_URL        https://<service>.onrender.com
 *
 *   node scripts/manual-deploy.mjs --dry-run   # check inputs, change nothing
 *   node scripts/manual-deploy.mjs             # migrate, deploy, wait
 *
 * The validation and the switch-over wait are exported and tested -- the Deploy
 * workflow imports the wait too, so the two cannot disagree about what "live"
 * means. The steps that change something run only when this file is invoked
 * directly, so importing it is inert.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 15_000;
const READY_TIMEOUT_MS = 10_000;
// A sleeping free instance takes 30-60 s to answer its first request, and the
// baseline read is often that request.
const BASELINE_TIMEOUT_MS = 90_000;
// Slack for uptimeSec being rounded and for request latency. A real switch-over
// clears it by the length of a Docker build.
const SWITCH_MARGIN_SEC = 5;

/**
 * Checks the three inputs before anything is changed.
 *
 * Errors stop the run; warnings do not. The split matters: a localhost database
 * is always a mistake, while a missing `-pooler` is only probably one -- Neon
 * hands out both endpoints and the direct one does work, just without the
 * pooling the free tier wants.
 */
export const validateDeployInputs = ({ databaseUrl = "", hookUrl = "", serviceUrl = "" } = {}) => {
  const errors = [];
  const warnings = [];

  const missing = [
    ["PRODUCTION_DATABASE_URL", databaseUrl],
    ["RENDER_DEPLOY_HOOK_URL", hookUrl],
    ["RENDER_SERVICE_URL", serviceUrl]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    return { errors: [`missing: ${missing.join(", ")}`], warnings, serviceUrl: "", summary: null };
  }

  // A trailing slash would make every polled URL contain "//api/ready". The
  // same normalisation CLIENT_ORIGIN needs, for the same reason.
  const normalizedServiceUrl = serviceUrl.replace(/\/+$/, "");

  let database;
  try {
    database = new URL(databaseUrl);
  } catch {
    return {
      errors: ["PRODUCTION_DATABASE_URL does not parse as a URL."],
      warnings,
      serviceUrl: normalizedServiceUrl,
      summary: null
    };
  }

  if (!/^postgres(ql)?:$/.test(database.protocol)) {
    errors.push(`PRODUCTION_DATABASE_URL protocol is "${database.protocol}", expected postgresql:`);
  }
  if (database.hostname === "127.0.0.1" || database.hostname === "localhost") {
    errors.push("PRODUCTION_DATABASE_URL points at localhost -- that is the dev database.");
  }

  const sslmode = database.searchParams.get("sslmode");
  if (sslmode !== "verify-full") {
    // Not an error: `pg` treats require as an alias for verify-full today. The
    // runbook wants it spelled out so the behaviour cannot drift on a major bump.
    warnings.push(`sslmode is "${sslmode ?? "(unset)"}", the runbook wants verify-full`);
  }
  if (!database.hostname.includes("-pooler")) {
    warnings.push(`host "${database.hostname}" has no "-pooler" -- is this the pooled endpoint?`);
  }

  // The pooled endpoint is PgBouncer, which accepts four startup parameters and
  // errors on anything else. An earlier version of this app passed
  // options=-c timezone=UTC and would have been refused outright.
  const extraParams = [...database.searchParams.keys()].filter((key) => key !== "sslmode");
  if (extraParams.length) {
    warnings.push(`extra query params the pooled endpoint may reject: ${extraParams.join(", ")}`);
  }

  return {
    errors,
    warnings,
    serviceUrl: normalizedServiceUrl,
    summary: {
      databaseHost: database.hostname,
      databaseName: database.pathname.slice(1),
      sslmode: sslmode ?? "(unset)",
      serviceUrl: normalizedServiceUrl,
      hookLength: hookUrl.length
    }
  };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads `uptimeSec` out of a /api/health or /api/ready body.
 *
 * Guards before it coerces: an absent, null or non-numeric uptime is unknown
 * (null), never 0. A 0 here would read as a freshly started instance and end
 * the wait on the old one. A measured 0 is a real uptime and survives.
 */
export const readUptimeSec = (body) => {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const value = parsed?.uptimeSec;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
};

/**
 * Whether the instance that just answered started after the baseline was taken.
 *
 * Render keeps the previous instance serving until the new one passes its
 * health check, so straight after the hook it is the OLD instance that answers
 * /api/ready -- and it answers ready. Measured on the #160 deploy: "ready" came
 * back three seconds after the hook, from an instance 907 s old; the new one
 * took over about 95 s later. Readiness alone therefore proves nothing.
 *
 * What does: the old instance's uptime keeps counting from the baseline, while
 * a new instance's starts again from zero. An answer younger than the old
 * instance would now be is a different process. With no baseline -- nothing was
 * answering before the hook -- any instance that answers is the new one.
 *
 * A crash-restart of the old instance would also reset its uptime and pass
 * this; on the single free instance that is rare, and it fails towards a
 * restarted process answering ready, not towards a broken one.
 */
export const isNewInstance = ({
  baseline,
  observedUptimeSec,
  nowMs,
  marginSec = SWITCH_MARGIN_SEC
}) => {
  if (!baseline) return true;
  if (typeof observedUptimeSec !== "number") return false;
  const oldInstanceUptimeNow = baseline.uptimeSec + (nowMs - baseline.atMs) / 1000;
  return observedUptimeSec < oldInstanceUptimeNow - marginSec;
};

/**
 * Records the instance serving now: its uptime, and when it was read. Taken
 * immediately before the hook. Null when nothing answers with an uptime -- no
 * live deploy, or a service that is down -- in which case any ready counts.
 */
export const readBaseline = async (
  serviceUrl,
  { fetchImpl = fetch, now = Date.now, timeoutMs = BASELINE_TIMEOUT_MS } = {}
) => {
  try {
    const response = await fetchImpl(`${serviceUrl}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    const uptimeSec = readUptimeSec(await response.text());
    return uptimeSec === null ? null : { uptimeSec, atMs: now() };
  } catch {
    return null;
  }
};

/**
 * Polls /api/ready until an instance younger than the baseline reports ready.
 * Resolves { ok: true, attempt, body } or { ok: false } after the last attempt.
 * The clock, fetch and sleep are injectable so the tests can drive a
 * switch-over without a network or a real 15-second wait.
 */
export const waitForNewInstance = async ({
  serviceUrl,
  baseline,
  attempts = POLL_ATTEMPTS,
  intervalMs = POLL_INTERVAL_MS,
  fetchImpl = fetch,
  now = Date.now,
  sleepImpl = sleep,
  log = console.log
}) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let body = "";
    try {
      const response = await fetchImpl(`${serviceUrl}/api/ready`, {
        signal: AbortSignal.timeout(READY_TIMEOUT_MS)
      });
      body = await response.text();
    } catch {
      body = "";
    }

    const ready = body.includes('"status":"ready"');
    const uptimeSec = readUptimeSec(body);
    if (ready && isNewInstance({ baseline, observedUptimeSec: uptimeSec, nowMs: now() })) {
      return { ok: true, attempt, body };
    }

    const state = ready
      ? `the old instance is still serving (uptime ${uptimeSec ?? "unknown"}s)`
      : body.includes('"status"')
        ? body.slice(0, 160)
        : "(no response yet)";
    log(`  attempt ${attempt}/${attempts}: ${state}`);
    if (attempt < attempts) await sleepImpl(intervalMs);
  }
  return { ok: false };
};

const main = async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dryRun = process.argv.includes("--dry-run");

  const databaseUrl = process.env.PRODUCTION_DATABASE_URL || "";
  const hookUrl = process.env.RENDER_DEPLOY_HOOK_URL || "";

  const { errors, warnings, serviceUrl, summary } = validateDeployInputs({
    databaseUrl,
    hookUrl,
    serviceUrl: process.env.RENDER_SERVICE_URL || ""
  });

  console.log("== preflight ==");
  if (summary) {
    console.log(`  database host : ${summary.databaseHost}`);
    console.log(`  database name : ${summary.databaseName}`);
    console.log(`  sslmode       : ${summary.sslmode}`);
    console.log(`  service url   : ${summary.serviceUrl}`);
    console.log(`  deploy hook   : set (${summary.hookLength} chars, not shown)`);
  }
  for (const warning of warnings) console.log(`  WARNING: ${warning}`);
  for (const error of errors) console.error(`  ERROR: ${error}`);

  if (errors.length) {
    console.error("\n  FAILED preflight. Nothing was changed.");
    process.exitCode = 1;
    return;
  }
  if (dryRun) {
    console.log("\n  --dry-run: inputs look usable. Nothing was changed.");
    return;
  }

  console.log("\n== applying migrations (must precede the deploy) ==");
  const migrate = spawnSync("npm", ["run", "migrate:postgres", "-w", "server"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
    shell: true
  });
  if (migrate.status !== 0) {
    console.error(`\n  FAILED: migrations exited ${migrate.status}. The deploy was NOT triggered.`);
    process.exitCode = 1;
    return;
  }
  console.log("  migrations applied.");

  // Immediately before the hook, so the old instance's uptime is extrapolated
  // over as short a gap as possible.
  console.log("\n== recording the instance serving now ==");
  const baseline = await readBaseline(serviceUrl);
  console.log(
    baseline
      ? `  uptime ${baseline.uptimeSec}s. The deploy is live once a younger instance answers ready.`
      : "  nothing answering with an uptime. The first ready response will count."
  );

  console.log("\n== triggering the Render deploy ==");
  let hookResponse;
  try {
    hookResponse = await fetch(hookUrl, { method: "POST" });
  } catch (err) {
    console.error(`\n  FAILED: could not reach the deploy hook: ${err?.message || String(err)}`);
    process.exitCode = 1;
    return;
  }
  if (!hookResponse.ok) {
    console.error(`\n  FAILED: deploy hook returned HTTP ${hookResponse.status}, not accepted.`);
    process.exitCode = 1;
    return;
  }
  console.log(`  accepted (HTTP ${hookResponse.status}). A hook 200 means queued, not live.`);

  console.log("\n== waiting for the new instance to report ready ==");
  const result = await waitForNewInstance({ serviceUrl, baseline });
  if (result.ok) {
    console.log(`\n  LIVE: the new instance reported ready (attempt ${result.attempt})`);
    console.log(`  ${result.body.slice(0, 300)}`);
    return;
  }

  console.error("\n  The new instance did not report ready within ~15 minutes.");
  console.error("  If the attempts said the old instance is still serving, the new build");
  console.error("  never passed Render's health check -- read that deploy's logs in Render.");
  console.error("  If /api/ready says not_ready with postgres healthy, check REDIS_URL:");
  console.error("  a configured-but-unreachable Redis falls back to in-memory sessions,");
  console.error("  and that endpoint stays not_ready by design.");
  process.exitCode = 1;
};

// Only when run directly. Importing this file for its validation must not
// migrate a database or trigger a deploy.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
