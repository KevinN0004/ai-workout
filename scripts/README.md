# scripts

Repo-level tooling. Everything here runs under Node and is linted. The tests are in `__tests__/` and run with `npm run test:scripts`. Unlike `client/` and `server/`, `no-console` does not apply: these scripts print by design.

| Script                                 | What it does                                                                                                                                                                                                               | Run by                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `check-audit-allowlist.mjs`            | Fails the build when an advisory in `security/audit-ci.json` has no review in `security/advisory-reviews.json`, or its review date has passed. audit-ci has no expiry of its own; see [`security/`](../security/README.md) | CI, before the audit                                                                                                            |
| `manual-deploy.mjs`                    | Does by hand what `.github/workflows/deploy.yml` does, in the same order: check the inputs, migrate, call the Render deploy hook, then wait for the _new_ instance to report ready                                         | You, when Actions cannot run (see [`docs/deploy-runbook.md`](../docs/deploy-runbook.md)); `deploy.yml` also imports its helpers |
| `setup-git-config.mjs`                 | Sets `core.hooksPath` (turns on the pre-commit guard) and `blame.ignoreRevsFile` (skips the Prettier reformat in `git blame`). Both live in `.git/config`, so a clone does not get them otherwise                          | `npm install`, through the `prepare` script                                                                                     |
| `skill-router.mjs`                     | Matches a prompt against keyword rules and names the Claude Code skill to start with                                                                                                                                       | Claude Code `UserPromptSubmit` hook                                                                                             |
| `scrub-junk-files.cjs`                 | Deletes stray 0-byte files with shell-fragment names that a background tool occasionally leaves in the working tree                                                                                                        | Claude Code `SessionStart` and `Stop` hooks                                                                                     |
| `run-claude-helper.cjs`                | Runs `.claude/helpers/<name>`, or silently does nothing when it is absent. That directory is gitignored scaffolding, so a fresh clone or cloud session lacks it                                                            | Every hook and the status line in `.claude/settings.json` that targets a helper                                                 |
| `codex-handoff.mjs` + `codex-handoff/` | Prepares a Claude → Codex handoff: picks a workflow, suggests the files involved and scores the context                                                                                                                    | Claude Code `Stop` hook (`--hook`)                                                                                              |

The four hook scripts are wired in `.claude/settings.json`, which knip cannot see. `knip.jsonc` therefore declares them as entry points; without that, knip reports all of them and their helpers as unused files.

`__tests__/repo-invariants.test.mjs` pins repository-wide facts that nothing else checks:

- every resolved `qs` stays on a patched release;
- `env.example` lists exactly the variables the server reads;
- every `scripts/` path in `.claude/settings.json` exists;
- the rate-limit store and limiter majors are a pairing this repo has actually run;
- the deploy workflow only deploys this repository's own pushes.

```bash
npm run test:scripts
```
