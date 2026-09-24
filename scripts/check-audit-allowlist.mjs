#!/usr/bin/env node
/**
 * Enforces the expiry dates on the audit-ci allowlist.
 *
 * audit-ci has no native expiry support, so a suppression added once would
 * otherwise stay forever. This cross-checks security/audit-ci.json against
 * security/advisory-reviews.json and fails the build when an entry is past its
 * reviewBy date, has no justification, or has gone stale.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses YYYY-MM-DD as UTC midnight, returning NaN unless the date is both
 * well-formed and real.
 *
 * The shape check alone fails open twice over. Date.parse("2026-13-45") is NaN,
 * and `NaN < anything` is false, so an impossible date skipped the expiry
 * comparison and the suppression stayed live forever. "2026-02-30" is quieter:
 * V8 rolls it over to 2026-03-02 rather than erroring, silently moving the
 * deadline. Round-tripping back through toISOString rejects both.
 */
const toUtcDate = (isoDate) => {
  if (!DATE_PATTERN.test(isoDate)) return Number.NaN;
  const parsed = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return Number.NaN;
  return new Date(parsed).toISOString().slice(0, 10) === isoDate ? parsed : Number.NaN;
};

export const checkAdvisoryReviews = ({ allowlist = [], reviews = [], today }) => {
  const errors = [];
  const byAdvisory = new Map();

  // A malformed `today` would make every expiry comparison false, disabling the
  // gate wholesale, so it gets the same treatment as a review date.
  const todayUtc = toUtcDate(String(today ?? ""));
  if (Number.isNaN(todayUtc)) {
    errors.push(
      `Cannot evaluate review dates: "today" (${JSON.stringify(today)}) is not a real YYYY-MM-DD date.`
    );
  }

  for (const entry of reviews) {
    const advisory = typeof entry?.advisory === "string" ? entry.advisory.trim() : "";
    if (!advisory) {
      errors.push('Every review entry needs a non-empty "advisory" id.');
      continue;
    }
    if (byAdvisory.has(advisory)) {
      errors.push(`Duplicate review entry for ${advisory}.`);
      continue;
    }
    byAdvisory.set(advisory, entry);
  }

  for (const advisory of allowlist) {
    const entry = byAdvisory.get(advisory);
    if (!entry) {
      errors.push(
        `${advisory} is allowlisted in security/audit-ci.json but has no entry in security/advisory-reviews.json.`
      );
      continue;
    }
    if (!String(entry.reason || "").trim()) {
      errors.push(`${advisory} has no "reason" explaining why it is suppressed.`);
    }
    const reviewBy = String(entry.reviewBy ?? "");
    const reviewByUtc = toUtcDate(reviewBy);
    if (Number.isNaN(reviewByUtc)) {
      errors.push(
        `${advisory} has an invalid "reviewBy" (${JSON.stringify(entry.reviewBy)}); expected YYYY-MM-DD.`
      );
      continue;
    }
    if (!Number.isNaN(todayUtc) && reviewByUtc < todayUtc) {
      errors.push(
        `${advisory} was due for re-review on ${reviewBy}. Re-check the advisory, then either fix it or move the date with a fresh justification.`
      );
    }
  }

  for (const advisory of byAdvisory.keys()) {
    if (!allowlist.includes(advisory)) {
      errors.push(
        `${advisory} has a review entry but is not allowlisted — remove the stale entry.`
      );
    }
  }

  return errors;
};

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const main = () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const auditConfig = readJson(path.join(repoRoot, "security", "audit-ci.json"));
  const reviewFile = readJson(path.join(repoRoot, "security", "advisory-reviews.json"));
  // UTC is deliberate -- do not "fix" this to local time. CI runners are UTC,
  // so a local-time today would let the same commit pass in one timezone and
  // fail in another. West of UTC this fires up to a day early, which is the
  // right direction to be wrong for a security suppression.
  const today = new Date().toISOString().slice(0, 10);

  const errors = checkAdvisoryReviews({
    allowlist: auditConfig.allowlist || [],
    reviews: reviewFile.reviews || [],
    today
  });

  if (errors.length > 0) {
    process.stderr.write(
      `Audit allowlist check failed:\n${errors.map((line) => `  - ${line}`).join("\n")}\n`
    );
    process.exit(1);
  }
  process.stdout.write(`Audit allowlist OK (${auditConfig.allowlist?.length || 0} entries).\n`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
