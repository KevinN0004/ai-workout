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
 *   3. POST the Render deploy hook
 *   4. Poll /api/ready until it reports ready
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
 * The validation is exported and tested; the steps that change something run
 * only when this file is invoked directly, so importing it is inert.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 15_000;
const READY_TIMEOUT_MS = 10_000;

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

  console.log("\n== waiting for /api/ready ==");
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    let body = "";
    try {
      const response = await fetch(`${serviceUrl}/api/ready`, {
        signal: AbortSignal.timeout(READY_TIMEOUT_MS)
      });
      body = await response.text();
    } catch {
      body = "";
    }

    if (body.includes('"status":"ready"')) {
      console.log(`\n  READY after ~${attempt * (POLL_INTERVAL_MS / 1000)}s`);
      console.log(`  ${body.slice(0, 300)}`);
      return;
    }

    console.log(
      `  attempt ${attempt}/${POLL_ATTEMPTS}: ${body.includes('"status"') ? body.slice(0, 160) : "(no response yet)"}`
    );
    await sleep(POLL_INTERVAL_MS);
  }

  console.error("\n  Service did not report ready within ~15 minutes.");
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
