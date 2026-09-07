#!/usr/bin/env node
/**
 * Enforces the expiry dates on the audit-ci allowlist.
 *
 * audit-ci has no native expiry support, so a suppression added once would
 * otherwise stay forever. This cross-checks .audit-ci.json against
 * security/advisory-reviews.json and fails the build when an entry is past its
 * reviewBy date, has no justification, or has gone stale.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toUtcDate = (isoDate) => Date.parse(`${isoDate}T00:00:00Z`);

export const checkAdvisoryReviews = ({ allowlist = [], reviews = [], today }) => {
  const errors = [];
  const byAdvisory = new Map();

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
        `${advisory} is allowlisted in .audit-ci.json but has no entry in security/advisory-reviews.json.`
      );
      continue;
    }
    if (!String(entry.reason || "").trim()) {
      errors.push(`${advisory} has no "reason" explaining why it is suppressed.`);
    }
    const reviewBy = String(entry.reviewBy ?? "");
    if (!DATE_PATTERN.test(reviewBy)) {
      errors.push(
        `${advisory} has an invalid "reviewBy" (${JSON.stringify(entry.reviewBy)}); expected YYYY-MM-DD.`
      );
      continue;
    }
    if (toUtcDate(reviewBy) < toUtcDate(today)) {
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
  const auditConfig = readJson(path.join(repoRoot, ".audit-ci.json"));
  const reviewFile = readJson(path.join(repoRoot, "security", "advisory-reviews.json"));
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
