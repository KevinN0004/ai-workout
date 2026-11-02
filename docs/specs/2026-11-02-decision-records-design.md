# Decision records (roadmap item E1), design

Status: **decided 2026-11-02**, measured on a draft, nothing applied. The plan is
`docs/plans/2026-11-02-decision-records.md`.

`CLAUDE.md` is loaded whole into every agent session, and most of it is the story behind its
rules rather than the rules. This effort keeps the rules in `CLAUDE.md`, each with a pointer,
and moves the story into numbered decision records under `docs/adr/`, wording intact.

## What was found

Read on `653bc77`.

1. **`CLAUDE.md` is 87,007 bytes over 1,240 lines.** Two sections hold 79% of it: Build &
   Test, 53,646 bytes, and External data: absent is not zero, 15,229 bytes. Every other
   section is under 4 KB.
2. **Most of those two sections is history.** It covers how each rule was found, the
   measurements behind it, which PR changed what, corrections of earlier claims, per-file
   coverage notes and mutation-test results. A session needs the rule on first contact, and
   needs the history only when it changes the thing the rule guards.
3. **Nothing parses `CLAUDE.md`.** No script or hook reads its content. One test does:
   `repo-invariants.test.mjs` ("CLAUDE.md points at both configs for the floors") requires it
   to name `client/vite.config.js` and `server/vitest.config.js`.
4. **Five places need a new pointer.** `README.md:454`, `client/README.md:141`,
   `e2e/README.md:34` and `docs/code-readability-sop.md:318` point into passages that move,
   and `docs/README.md:10` says where to read why. `scripts/README.md` lists what
   `repo-invariants.test.mjs` checks, and that list grows. Four code comments point at
   `CLAUDE.md` too (`numericCoercion.contract.test.js:146`, `useBodyModel.test.jsx:163`,
   `e2e/a11y.spec.js:46`, `repo-invariants.test.mjs:142`). Each points at a rule that stays,
   so they need no change. Dated plans and specs are not edited.
5. **Two warnings live only in `CLAUDE.md`.** `App.jsx`'s unit initializers repeat what the
   route effect sets, and are kept because `HomePage` reads the units on the first render.
   The uncovered arms left in `outlineGeometry.js`, `templateOutline.js` and
   `usePreviewDerivedData.js` are deliberate. No code comment says either, so `CLAUDE.md`
   keeps one line for them.

## Decision

**What stays.** A sentence stays in `CLAUDE.md` if a session that never opens a record
would make a mistake without it: a rule, a command, a symptom to recognise, or a fact needed
on first contact. A long rule is shortened to that and points at its record as
`[NNNN](docs/adr/NNNN-name.md)`.

**What moves.** Everything else moves to a record, copied by line range from `653bc77` so
the wording is the original's. Ten changes are made to the text on the way:

- eight references to other places in `CLAUDE.md` ("this file", "this section", "below")
  now name the place;
- "Two things the contract deliberately does not flatten" heads a list of three, so it
  becomes "Three things";
- "Conventions:" becomes a `### Conventions` heading.

**What is not touched.** The Behavioral Rules, Skill Auto-Trigger Rules, File Organization
(which gains one line for `docs/adr`), Project Architecture, Data access, Fresh Clone Setup,
Security Rules and the claude-flow sections stay as they are. They are already rules, or
configuration owned by the claude-flow tooling.

**The September roadmap's status line stays as written.** Roadmap item E1 said it would be
corrected. It is not, because `docs/README.md` has made plans and specs dated records since
2026-09-28 (`dfc7014`), a week after the roadmap's last edit (`da05391`, 2026-09-21). Its
status line is what a dated record should hold, the state when it was written, and
`docs/README.md` already warns that a figure in one may since have changed.

## The records

`docs/adr/NNNN-name.md`, numbered from 0001 and listed in `docs/adr/README.md`. Each record
has:

- a title phrased as the decision (`# 0001. Guard absent input before converting it to a number`);
- a status line: `Accepted. First recorded in CLAUDE.md on <date> (<commit>); moved here on 2026-11-02.`
  The date and commit are where `git log -S` first finds the passage;
- `## Decision`, the rule in two to five sentences;
- `## Background`, the moved text.

**Records are kept current, unlike plans and specs**, the way `CLAUDE.md` was. The PR that
changes a fact a record states updates the record. A reversed decision gets a new record,
and the old one is marked superseded rather than rewritten. `docs/README.md` and
`docs/adr/README.md` both say so.

| Record | Moved from                                                                |
| ------ | ------------------------------------------------------------------------- |
| 0001   | External data: the five instances, the sweep, the contract's design       |
| 0002   | External data: the US AQI as the EPA NowCast                              |
| 0003   | External data: choosing the OpenAQ station, and the trimmed cache         |
| 0004   | Conventions: file length is a smell                                       |
| 0005   | Build & Test: contract tests and the E2E suite                            |
| 0006   | Build & Test: accessibility by axe, and the three jsx-a11y rules left off |
| 0007   | Build & Test: reduced motion                                              |
| 0008   | Build & Test: knip, and measuring the bundle                              |
| 0009   | Build & Test: compose on loopback, and the two passwords                  |
| 0010   | Build & Test: the coverage floors                                         |
| 0011   | Build & Test: coverage flakes, `TZ`, and dotenv on re-import              |
| 0012   | Build & Test: the coverage map, server and client                         |
| 0013   | Build & Test: layout, randomness and jsdom as test boundaries             |
| 0014   | Build & Test: stubs, and choosing what to test                            |
| 0015   | Build & Test: mutation testing, and reading a survivor                    |
| 0016   | Build & Test: the Prettier exclusion that retired itself                  |

"Guard a value once, where it is summed" moves to 0001 rather than staying with the coverage
notes it sat among: it is the same class of bug, one coercion guarded and its twin not.

## Measured

On a draft built by line range from `653bc77` and run through Prettier (stable from the
first pass):

| After      | `CLAUDE.md`                           | Records                 |
| ---------- | ------------------------------------- | ----------------------- |
| `653bc77`  | 87,007 bytes                          | none                    |
| the 2nd PR | 75,253 bytes                          | 0001–0004               |
| the 3rd PR | 66,900 bytes                          | 0001–0009               |
| the 4th PR | 38,313 bytes over 564 lines, 56% less | 0001–0016, 65,918 bytes |

**Nothing was lost.** Every one of the 595 sentences in the old `CLAUDE.md` was checked,
with markdown and whitespace normalised. 583 appear verbatim in the new `CLAUDE.md` or in a
record. The other 12 are the ten changes above and two artifacts of the check: one sentence
the new `docs/adr` line splits, and one that ran across two bullets, which now sit in
different records. Both halves of each were found separately. The check is
`check-moved.mjs`, listed in the plan, and each PR runs it.

## Guards

`scripts/__tests__/repo-invariants.test.mjs` gains a block for the records:

1. every file in `docs/adr` other than `README.md` is named `NNNN-kebab-name.md`;
2. the records are numbered from 0001 without a gap or a repeat;
3. the index lists every record once, in order, and nothing else;
4. every record path named in a tracked file exists: `docs/adr/NNNN-name.md` anywhere, and
   relative `(NNNN-name.md)` links inside `docs/adr`. A pointer to a missing record would
   lose the reasoning without a sound;
5. `CLAUDE.md`, line endings normalised to LF, is at most `CLAUDE_MD_MAX_BYTES`.

**The ceiling is what keeps the file slim.** `CLAUDE.md` grew 300 bytes in Phase 3 alone, and
nothing stopped it reaching 87 KB. Each move PR lowers the ceiling to its own size, rounded up
to the next thousand bytes. The last PR sets it to 40,000, about 1.7 KB above the final size,
which leaves room for a few new rules before a PR has to move something out. Raising the
ceiling is something a PR does on purpose and says why, as with `ALLOWLIST_SIZE`.

## PRs

1. This spec and its plan.
2. The guard block, `docs/adr/README.md`, records 0001–0004, the External data and
   Conventions sections, the `docs/adr` line in File Organization, and the pointers in
   `docs/README.md`, `README.md`, `docs/code-readability-sop.md` and `scripts/README.md`.
3. Records 0005–0009, and Build & Test from the contract tests to the compose password, with
   the pointer in `e2e/README.md`.
4. Records 0010–0016, the coverage and Prettier passages, the pointer in `client/README.md`,
   and the final ceiling.

There is no floor PR. The `scripts/` tests are not coverage-measured, and no client or server
code changes.

## Testing

The guard block is test-first. Each test is written before what it checks exists, and seen to
fail for the right reason before the files arrive. Each is then shown by mutation to catch
its failure: delete an index row, swap two rows, add a record without a row, rename a record a
pointer names, name a record that does not exist, add an unnumbered file, and grow
`CLAUDE.md` past the ceiling. Each mutation is confirmed applied before its run is trusted.

Every PR runs `check-moved.mjs` against its base and lists the sentences it reports, each with
its reason. The gates are `npm run format:check`, `npm run lint`, `npm run knip` and
`npm test`. `npm run build` and `npm run test:coverage` change nothing here, and CI runs them
anyway.

## Out of scope

- Shortening the sections that are already rules, and the claude-flow configuration.
- Editing dated plans and specs, including the September roadmap.
- Moving the two code-local warnings into code comments. They stay in `CLAUDE.md`, and
  writing them into `App.jsx` and the geometry files is a separate change.
