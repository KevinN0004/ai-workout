# 0017. Type-check JavaScript through JSDoc, one file at a time

Accepted. Decided by the owner on 2026-11-02 for roadmap lane D1. The design is
`docs/specs/2026-11-02-jsdoc-type-checking-design.md`.

## Decision

Files stay `.js` and `.jsx`, and their types live in JSDoc comments. TypeScript 7 checks a
file once `// @ts-check` is on its own line below its header, with `strict` on and `checkJs`
off, so files opt in one at a time. `npm run typecheck` runs in CI. Roadmap milestone M4 turns
`checkJs` on for every file and retires the pragmas.

## Options

- **JSDoc and `// @ts-check`**, chosen. Nothing changes in the build, the runtime, the
  imports or the ESLint setup, and any file can still become `.ts` later.
- **`.ts` and `.tsx` files**, with Node's built-in type stripping on the server. Every server
  import would have to name its `.ts` file, only erasable syntax would be allowed, so no
  enums, and ESLint, knip and the header test would each need TypeScript settings.
- **Holding D1** for later.

## What TypeScript 7 does here

Probed on 7.0.2, the release current on 2026-11-02, in a scratch project:

- **It still checks JSDoc in JavaScript.** It dropped Closure-era patterns: `@enum`, `@class`
  and `@constructor`, constructor functions, `function(string)` type syntax, and values used
  as types without `typeof`. None appears in `client/src` or `server/src`.
- **`strict` defaults to true and `types` to `[]`.** Both tsconfigs write them out anyway, so
  a reader does not need to know the defaults.
- **The pragma's position decides whether a file is checked, and a wrong position fails
  silently.** It is honoured directly below a block or line header, and after a blank line.
  It is ignored below the first import, and inside the header's own `/** */` block. This is
  why `repo-invariants.test.mjs` checks where each pragma sits, not only how many there are.
- **Strict checking sees the null-as-zero class only through types.** It flags a
  `number | null` passed where a `number` is expected, so a typed `toNumberOrNull` makes its
  callers handle the absent case. It does not flag `Number(null)`, because `Number` accepts
  any value. So the numeric-coercion contract tests stay
  ([0001](0001-absent-is-not-zero.md)).

## Guards

`scripts/__tests__/repo-invariants.test.mjs`, "type-checked files":

- every `// @ts-check` comes before its file's first statement, and none is written inside
  a block comment;
- `TYPE_CHECKED_FILES` equals the number of checked files. Checking a file raises it, and
  lowering it takes a PR that says why, so a pragma dropped to quiet an error shows in review;
- both tsconfigs keep `strict` true and `checkJs` false;
- CI runs `npm run typecheck`.

Each was mutation-tested when it landed, along with a type error in each checked file. All
were caught.

## The readability SOP

`docs/code-readability-sop.md`, rule 2, banned JSDoc types because nothing checked them. In
a checked file `npm run typecheck` checks every one, so they cannot drift. There, each
parameter the checker cannot infer gets a `@param {Type}` line below the prose summary. A
`@returns {Type}` is added only where the inferred return is wider than the truth. Unchecked
files keep the ban.

## Types shared across the workspaces (phase 2)

Decided 2026-11-14, `docs/specs/2026-11-14-api-body-types-design.md`. Each request body the
client sends is built by a function in `client/src/app/requestBodies.js` (and the profile by
`personalToProfile`), whose `@returns` names a typedef beside the server's zod schema, so a
misspelled or mistyped field fails `npm run typecheck`.

- **Client source names server code only inside a JSDoc `import()` type.** That is a comment
  to Vite, so nothing reaches the bundle. Runtime imports of server code stay in test files.
- **`DeclaredBody<S>` is a schema's declared fields,** `z.input` of a `ZodObject` built from
  its `shape`. Plain `z.input` of a `.passthrough()` schema carries an index signature, and a
  misspelled key passes. A field zod coerces (numbers, booleans) reads as `unknown`, so only
  its name and whether it is required are checked. Keys arriving by spread are not checked
  for extras, so signup's nested profile still carries undeclared keys.
- **It rests on two conditions.** `zod` resolves from the root `node_modules`, because npm
  hoists it; a server-only install would break the client's typecheck. And once a client file
  names a checked server file, the client's program checks that file too, under the client's
  options, so it must pass both.

`repo-invariants.test.mjs` holds it: every exported `…BodySchema` in the two schema files has
a `DeclaredBody` typedef, and every such typedef is named by a checked client file.
