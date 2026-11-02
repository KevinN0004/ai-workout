# 0016. Retire a formatter exclusion with a guard

Accepted. First recorded in `CLAUDE.md` on 2026-09-21 (`a92b171`); moved here on 2026-11-02.

## Decision

Nothing is excluded from Prettier. A file earns an exclusion only by growing on every
`--write` with no fixed point, measured over about three passes, and an exclusion comes
with a test that fails once the upstream bug is fixed, so it cannot outlive that bug.

## Background

**Nothing is excluded from Prettier any more, and the way that was noticed is the
point.** `docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md` used to be:
Prettier **3.9.6 never converged** on it, indenting the continuation paragraphs under
its nested `- [x]` task-list items four spaces deeper on every `--write` and growing
the file 280 bytes per run with no fixed point. **3.9.8 fixed it** — measured over five
consecutive passes, it reformats once (15,691 → 16,547 bytes) and is then byte-identical.
The exclusion and the file are both gone from `.prettierignore`.

An exclusion like that should not outlive its upstream bug, and nothing routine would
have prompted anyone to revisit it: a Dependabot Prettier bump shows only a lockfile
diff, and `prettier --check` stays green precisely because the file is ignored. So
`scripts/__tests__/repo-invariants.test.mjs` carried a test asserting the exclusion still
**earned its place** — that the file still failed to converge — designed to fail the
moment it stopped. It did exactly that on the 3.9.6 → 3.9.8 bump, which is how this
entry came to be rewritten. That test is now deleted too; it had no remaining subject.
**If you ever exclude a file from a formatter here, write the guard that retires the
exclusion for you.**

Not every slow-converging file was that file. `docs/plans/2026-09-06-foundation-hardening.md`
needed **two** `--write` passes to settle (70,068 then 70,066 bytes, stable after) and
was never excluded, because it had a fixed point. The pathological case grows without
bound; a file that stops changing is merely awkward. Measure before excluding one, and
check byte-stability across ~3 consecutive passes rather than a single clean `--check`.
