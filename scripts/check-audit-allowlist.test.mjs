import { describe, expect, test } from "vitest";
import { checkAdvisoryReviews } from "./check-audit-allowlist.mjs";

const review = (overrides = {}) => ({
  advisory: "GHSA-aaaa-bbbb-cccc",
  package: "example",
  reason: "Dev-only dependency.",
  reviewBy: "2099-01-01",
  ...overrides
});

describe("checkAdvisoryReviews", () => {
  test("passes when every allowlisted advisory has a future-dated review", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review()],
      today: "2026-09-07"
    });
    expect(errors).toEqual([]);
  });

  test("fails when an allowlisted advisory has no review entry", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [],
      today: "2026-09-07"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("no entry in security/advisory-reviews.json");
  });

  test("fails when the review date has passed", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reviewBy: "2026-09-06" })],
      today: "2026-09-07"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("due for re-review");
  });

  test("passes on the review date itself, failing only after it", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reviewBy: "2026-09-07" })],
      today: "2026-09-07"
    });
    expect(errors).toEqual([]);
  });

  test("fails closed on a malformed date", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reviewBy: "December 2026" })],
      today: "2026-09-07"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("expected YYYY-MM-DD");
  });

  test("fails closed on a missing date", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reviewBy: undefined })],
      today: "2026-09-07"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("expected YYYY-MM-DD");
  });

  test("fails when a review has no reason", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc"],
      reviews: [review({ reason: "   " })],
      today: "2026-09-07"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('has no "reason"');
  });

  test("fails on a stale review for an advisory no longer allowlisted", () => {
    const errors = checkAdvisoryReviews({
      allowlist: [],
      reviews: [review()],
      today: "2026-09-07"
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("not allowlisted");
  });

  test("reports every problem at once rather than stopping at the first", () => {
    const errors = checkAdvisoryReviews({
      allowlist: ["GHSA-aaaa-bbbb-cccc", "GHSA-dddd-eeee-ffff"],
      reviews: [review({ reviewBy: "2026-01-01" })],
      today: "2026-09-07"
    });
    expect(errors).toHaveLength(2);
  });
});
