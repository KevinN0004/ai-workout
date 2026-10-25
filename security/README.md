# security

How `npm audit` findings get accepted, and how that acceptance expires; and what the secret scan reads ([Secret scan](#secret-scan)).

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

## Secret scan

CI's `Secret scan` job runs gitleaks (`gitleaks/gitleaks-action@v3`, with the gitleaks release pinned by `GITLEAKS_VERSION` in `.github/workflows/ci.yml`) against **`gitleaks.toml`**, which extends gitleaks' default rules.

- **What it reads.** A pull request: its own commits, the ones the API lists for it (the action reads the first page, so a PR of more than 30 commits is read only up to its 30th). A push to `main`: the pushed range along its first-parent line, so a merged PR's commits, already read on the PR, are not read again; a commit pushed straight to `main` is. A manual run (Actions → CI → Run workflow): the whole history, worth doing after a gitleaks upgrade adds rules. No mode reads a merge commit's own diff, including a conflict resolution.
- **The allowlist is empty.** A full-history scan with gitleaks 8.30.1 found nothing, test fixtures included. When a fixture does trip a rule, allowlist it by its **value**: an `[[allowlists]]` block with `regexTarget = "match"` and a `regexes` entry for that value, as the comment in `gitleaks.toml` shows. Never by path: a `__tests__/` path entry would wave through a real key pasted into a test. A finding that exists only in a commit no longer in the tree is allowlisted by `commits = ["<sha>"]`, in its own block saying what it was.
- **A finding that is not a fixture is a leaked credential.** Rotate it first (revoke it at the provider and issue a new one), then deal with the history; allowlisting it hides the leak and leaves the credential live.
- **It complements GitHub's own scanning.** Secret scanning and push protection are on for this repository, and block or alert on known provider tokens. gitleaks adds the generic ones (a random token assigned to `password`, `secret` or `apiKey`) and a visible check on every PR.
- **Its output is redacted.** The action runs gitleaks with `--redact`; the job summary lists rule, commit, file and line, never the value. PR comments and the report artifact are off, so the job needs no write permission and publishes no report.
