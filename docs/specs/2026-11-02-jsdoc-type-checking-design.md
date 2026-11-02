# Type checking through JSDoc (roadmap lane D1), design

Status: **decided 2026-11-02**, probed and measured, nothing applied. The plan is
`docs/plans/2026-11-02-jsdoc-type-checking.md`. This spec covers the whole lane and designs
its first phase: the tooling, and the four files the roadmap converts first.

CLAUDE.md records five instances of `null`, `""` and `0` being read as each other, each found
by hand. Strict type checking does not see that class directly, but it can make a typed helper
force its callers to handle the absent case. D1 adds it one file at a time.

## Owner's decision

**Decided 2026-11-02: JSDoc + checkJs.** Files stay `.js` and `.jsx`, types live in JSDoc
comments, and `tsc --noEmit` checks them. Two other options were offered and not chosen:
`.ts`/`.tsx` files run through Node's built-in type stripping, and holding D1.

## What was found

Read on `11fd8d0`.

1. **Nothing is typed.** The repository has no tsconfig, no `typescript` dependency, no
   `// @ts-check` and no JSDoc type. `docs/code-readability-sop.md`, rule 2, forbids
   `@returns {string}`-style types because "nothing checks them, so they drift".
2. **TypeScript 7.0.2 is the current release** (2026-07-08), the native port. It still checks
   JSDoc in JavaScript files. It dropped Closure-era patterns: `@enum`, `@class` and
   `@constructor`, constructor functions, `function(string)` type syntax, and values used as
   types without `typeof`. None appears in `client/src` or `server/src`. In 7.0, `strict`
   defaults to true and `types` to `[]`, so no ambient `@types` package is included unless it
   is named.
3. **The pragma's position decides whether a file is checked**, and a wrong position fails
   silently. On TypeScript 7.0.2, in a scratch project, `// @ts-check` is honoured directly
   below a block header, below a line header, and after a blank line below the header. It is
   ignored below the first import, and inside the header's own `/** */` block. A file without
   it reports nothing.
4. **Strict checking sees the class only through types.** It flags a `number | null` passed
   where a `number` is expected. It does not flag `Number(null)`, because `Number` accepts any
   value. The numeric-coercion contract tests therefore stay, as the roadmap says.
5. **The header test refuses a leading pragma.** `repo-invariants.test.mjs` does not count a
   comment that only instructs a tool as a header, and `@ts-check` is on its list. The pragma
   goes below the header, which finding 3 shows TypeScript honours.
6. **The four hotspots, checked with only the pragma added** (strict, TypeScript 7.0.2):

   | File                                                  | Lines | Errors                                                                                            |
   | ----------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- |
   | `client/src/app/units.js`                             | 151   | 10, all untyped parameters (TS7006)                                                               |
   | `server/src/repositories/rowValues.js`                | 50    | 6, all TS7006                                                                                     |
   | `client/src/pages/home/components/physique/math.js`   | 60    | 9, all TS7006                                                                                     |
   | `server/src/services/external/externalDataService.js` | 1,041 | 183: 87 untyped parameters and bindings, 66 unknown properties, 25 names it cannot find, 5 others |

   The first three need `@param` types and no code change. The service needs typed dependency
   objects and Node's types, so it is its own piece of work.

7. **The build and the runtime never read a tsconfig for these files.** Node runs `.js`
   directly. Vite transforms `.jsx` with `@vitejs/plugin-react`, so the client build is
   compared byte for byte with and without the new tsconfig to prove it. The production
   image installs with `npm ci --omit=dev`, so TypeScript never reaches it.

## Design

**Configuration.** `typescript@^7.0.2` is a root devDependency. Each workspace gets a
`tsconfig.json` with `allowJs`, `checkJs: false`, `noEmit`, `strict` (written out, although
it is the default), `skipLibCheck`, `target: "esnext"`, `types: []` and `include: ["src"]`.

- The client adds `module: "esnext"`, `moduleResolution: "bundler"`, `jsx: "react-jsx"` and
  the DOM libraries.
- The server adds `module: "nodenext"` and `moduleResolution: "nodenext"`, and `lib: ["esnext"]`,
  which keeps DOM globals out of server code.

`@types/node` arrives with the first server file that needs it, the service, and
`@types/react` with the first checked `.jsx`.

**Per file.** A file is checked when `// @ts-check` sits on its own line below its header,
before the first statement. `checkJs: false` means every other file is still read for its
types but reports nothing, so each conversion is one reviewable diff. The lane ends at
milestone M4, where `checkJs: true` replaces the pragmas.

**Running it.** `npm run typecheck` runs `tsc -p tsconfig.json` in each workspace. CI runs it
in the Lint, format, audit job, after knip.

**Guards** in `scripts/__tests__/repo-invariants.test.mjs`:

1. every `// @ts-check` comes before its file's first statement, and none is written inside a
   block comment, where TypeScript ignores it (finding 3);
2. `TYPE_CHECKED_FILES` equals the number of checked files: raised by each conversion, and
   lowered only in a PR that says why, so dropping a pragma to quiet an error shows in review;
3. both tsconfigs keep `strict` true and `checkJs` false, until M4 changes the second;
4. CI runs `npm run typecheck`.

**The readability SOP changes for checked files.** Rule 2 keeps its ban on JSDoc types in an
unchecked file, where nothing checks them. In a checked file `npm run typecheck` checks every
one, so they cannot drift. Each parameter the checker cannot infer gets a `@param {Type}`
line below the prose summary, and a `@returns {Type}` only where the inferred return is wider
than the truth. The summary stays prose.

**Where it is recorded.** `CLAUDE.md` gains the command and a two-line rule pointing at a new
decision record, 0017, which holds the owner's decision, the probe and the caveat in finding 4.

## Phases

1. **Tooling and the hotspots**, in this spec's plan:
   - the spec and plan;
   - the tooling with `units.js` and `rowValues.js`, so both workspaces are proven at once;
   - `math.js`;
   - `externalDataService.js`, with `@types/node`.
2. **API types inferred from the zod schemas** and shared by both sides through JSDoc
   `import()` types, so a form and the route that validates it cannot disagree about a field.
   Its own plan.
3. **Hooks and pages**, then the flip to `checkJs: true` (M4). Its own plan.

A conversion that finds a real bug fixes it test-first, as any fix here is. A conversion that
only annotates changes no statement, so coverage cannot move. Each phase ends by re-measuring
coverage rather than assuming it held, and a floor PR follows only if a figure rose.

## Testing

- **Each guard is test-first and mutation-tested.** The mutations: a pragma moved below the
  first import; a pragma written inside the header; a pragma removed, and one added, without
  changing `TYPE_CHECKED_FILES`; `strict` set false; the CI step deleted.
- **`npm run typecheck` is shown to fail** on a type error put into each checked file, and
  restored.
- **The client build is byte-identical** with and without the tsconfig and the annotations,
  by the SOP's comment-only proof (`docs/code-readability-sop.md`, "Proving a change is
  readability-only").
- **Coverage is re-measured** with `npm run test:coverage` and exact counts, and expected to
  be unchanged.

## Out of scope

- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Both catch real cases, but each
  needs code changes with branches of their own, so each is a later decision.
- typescript-eslint, which has nothing to parse while every file stays JavaScript.
- Converting tests, `server/scripts/` and root `scripts/`.
