# security

How `npm audit` findings get accepted, and how that acceptance expires.

- **`audit-ci.json`** configures the CI audit gate (`npx --yes audit-ci@7.1.0 --config security/audit-ci.json`, the version CI pins). It fails on **high** and critical advisories, except those listed in `allowlist`.
- **`advisory-reviews.json`** holds one review per allowlisted advisory: the package, why it is acceptable in this app, and a `reviewBy` date.

audit-ci has no expiry of its own, so an allowlist entry would otherwise stay forever. `scripts/check-audit-allowlist.mjs` runs in CI before the audit and fails the build when:

- an allowlisted advisory has no review;
- a review has no reason;
- a `reviewBy` date is missing, malformed, impossible, or has passed (the date itself still passes);
- the same advisory is reviewed twice;
- a review names an advisory that is no longer allowlisted.

The last rule means a review exists only while its allowlist entry does. An advisory below the gate's `high` threshold needs neither.

## Accepting an advisory

1. Confirm it cannot be fixed within range: `npm audit` often suggests a downgrade, which is not a fix.
2. Add its id to `allowlist` in `audit-ci.json`.
3. Add a review to `advisory-reviews.json` that says why it cannot affect this app, with a `reviewBy` date.
4. Run `node scripts/check-audit-allowlist.mjs` and `npx --yes audit-ci@7.1.0 --config security/audit-ci.json`.

When a review falls due, check again whether a fix now exists before moving the date.
