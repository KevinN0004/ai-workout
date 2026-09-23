# Repository layout reorganization — design

Date: 2026-09-23
Branch: `chore/reorganize-layout`, stacked on `chore/guard-neon-scaffolding` (PR #153),
because that branch edits the same `knip.json` and `scripts/repo-invariants.test.mjs`.

## Goal

Make the tree easier to navigate without changing what any code does. Nearly half the
JS/JSX files under `client/src` and `server/src` are tests (116 of 246), interleaved with the
source they cover; `server/src/services/` is one flat list of five concerns; page components
sit beside their own page folders; and several root configs carry no explanation.

Success means: every file has an obvious home, every test count and coverage total is
**identical** before and after, and every gate (`test`, `lint`, `build`, `knip`,
`format:check`, `test:coverage`, `test:e2e`) is green.

## Out of scope

- Renaming, splitting or merging modules; any behaviour change.
- `e2e/` (already a test-only folder) and `client/src/test/setup.js` (the Vitest setup file).
- `docs/plans/**` and existing `docs/specs/**` — historical records, left as written.
- `.mcp.json` — JSON with no comment support and only three entries.

## 1. Tests move into `__tests__/`

**Rule:** a test lives in a `__tests__/` folder inside the folder of the source it covers,
measured _after_ the moves in sections 2–4. Where the source does not move, that is the
test's current folder.

| Current location                                | New location                                   |
| ----------------------------------------------- | ---------------------------------------------- |
| `client/src/*.test.*` (App ×3, numericCoercion) | `client/src/__tests__/`                        |
| `client/src/pages/<Name>Page*.test.jsx`         | `client/src/pages/<page>/__tests__/`           |
| `client/src/<dir>/X.test.*` (everything else)   | `client/src/<dir>/__tests__/`                  |
| `server/src/*.test.js` (9 files)                | `server/src/__tests__/`                        |
| `server/src/services/*.test.js`                 | `server/src/services/<domain>/__tests__/` (§2) |
| `server/src/<dir>/X.test.js` (everything else)  | `server/src/<dir>/__tests__/`                  |
| `scripts/*.test.mjs` (2 files)                  | `scripts/__tests__/`                           |

No test-discovery config changes: Vitest's default include, ESLint's `testFiles`
(`**/*.test.{js,jsx,mjs}`), both coverage `exclude` lists (`**/*.test.{js,jsx}`) and knip's
`scripts/**/*.test.mjs` entry all match by filename, not location.

`scripts/__tests__/repo-invariants.test.mjs` resolves the repo root as `..` from its own
folder; that becomes `../..`. `check-audit-allowlist.test.mjs` imports its subject relatively
and is rewritten like every other test.

## 2. Server services grouped by domain

```
server/src/services/
├── auth/       authUserService.js, sessionService.js
├── dashboard/  dashboardCollectionService.js, dashboardDataBuildersService.js
├── external/   externalDataService.js, httpCacheService.js
├── http/       apiSchemaService.js, requestValidationService.js, errorResponseService.js
└── platform/   metricsService.js, errorTrackingService.js, platformHealthService.js,
                envValidationService.js
```

Each service test follows the service it imports:

| Test                                                                                     | Domain      |
| ---------------------------------------------------------------------------------------- | ----------- |
| `authUserService`, `sessionService`, `.auth`, `.redis`                                   | `auth`      |
| `dashboardDataBuildersService`                                                           | `dashboard` |
| `airQuality`, `externalMappers`, `externalRequests`, `externalRetry`, `httpCacheService` | `external`  |
| `requestValidationService`                                                               | `http`      |
| `envValidationService`, `errorTrackingService`, `metricsService`                         | `platform`  |

`index.js`, `corsPolicy.js`, `shutdown.js` and `staticClient.js` stay at the `server/src`
root under the existing bootstrap rule.

The two client contract tests that import server modules
(`app/constants.test.js`, `app/profileContract.test.js`) get both path changes: their own
move into `__tests__/`, and the service's move into its domain folder.

## 3. Each page gets its own folder

```
client/src/pages/
├── auth/            AuthPage.jsx, AuthPage.css
├── dashboard/       DashboardPage.jsx, DashboardPage.css, (existing parts)
├── home/            HomePage.jsx, HomePage.css, (existing parts)
├── preview/         PreviewPage.jsx, PreviewPage.css, (existing parts)
└── workout-result/  WorkoutResultPage.jsx, WorkoutResultPage.css
```

Folder names follow the existing lowercase / kebab-case convention (`planner-thumbs`,
`codex-handoff`). Page CSS `@import`s shorten accordingly
(`./dashboard/styles/theme.css` → `./styles/theme.css`).

## 4. Client global CSS into `styles/`

`client/src/App.css` → `client/src/styles/app.css`, `client/src/index.css` →
`client/src/styles/index.css`, beside the existing `base.css`. Their `@import`s are rewritten
(`./app/styles/planner/base.css` → `../app/styles/planner/base.css`, `./styles/base.css` →
`./base.css`). Byte-order marks at the top of these files are preserved.

## How the moves are made

**A single codemod** (Node, kept in the session scratchpad, not committed):

1. Builds an old → new path map from the rules above.
2. `git mv`s every file in the map, so history follows the rename.
3. Rewrites every relative specifier in every tracked `.js`, `.jsx`, `.mjs`, `.cjs` and
   `.css` file, whether or not that file moved:
   - `import … from "x"` (including multi-line), `export … from "x"`, bare `import "x"`
   - `import("x")`
   - `vi.mock`, `vi.doMock`, `vi.unmock`, `vi.importActual`, `vi.importMock`
   - CSS `@import "x"`
4. Resolves each old specifier against the file's **old** location (trying the literal path,
   then `.js`, `.jsx`, `/index.js`, `/index.jsx`, and stripping a `?query` suffix such as
   `?raw`), maps the target through the path map, and writes a specifier relative to the
   file's **new** location in the same style: extensionless stays extensionless, the
   query suffix is kept, and `./` is added where needed.
5. Fails loudly if any specifier it touches does not resolve before the move.

**A separate checker** then walks every tracked JS/JSX/CSS file and fails on any relative
specifier (the same forms as above) that does not resolve to an existing file. This matters
most for `vi.mock`: ESLint's `import-x/no-unresolved` does not look at that string, and a
mock path that no longer resolves is not guaranteed to raise an error rather than quietly
stop applying.

## 5. Root config files

| Change                                            | Knock-on edits                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `CODEOWNERS` → `.github/CODEOWNERS`               | None — patterns are repository-root-relative wherever the file lives.                                                      |
| `.audit-ci.json` → `security/audit-ci.json`       | `ci.yml` `--config` flag; `check-audit-allowlist.mjs` path and messages; its test's expected message.                      |
| `knip.json` → `knip.jsonc`, with comments         | `repo-invariants.test.mjs` reads it through a comment-stripping parse; comments in `.gitignore` and `ci.yml` that name it. |
| `.prettierrc` → `.prettierrc.yaml`, with comments | None in code; same options, same values.                                                                                   |

`package.json` (root, client, server) cannot hold comments, so their `scripts` are reordered
into groups instead: dev → build/start → test → quality (lint, format, knip) → setup. npm
does not depend on key order.

Section headers and comments are added where they are missing: `.gitignore` (its first
block), `.prettierignore`, `.dockerignore`, root `vitest.config.js`, and
`client/vite.config.js`. The last also carries a contradiction to fix: its coverage comment
says the floors are "floored to whole percent", and the paragraph after it says one decimal,
which is what the values are.

Already commented and left alone: `eslint.config.js`, `playwright.config.js`, `Dockerfile`,
`docker-compose.yml`, `render.yaml`, `server/vitest.config.js`, `.npmrc`, `.gitattributes`.

## 6. VS Code

A tracked `.vscode/settings.json` hides generated and local-state paths from the explorer:
`coverage`, `test-results`, `playwright-report`, `blob-report`, `.postgres-data`,
`.postgres-pw`, `.claude-flow`, `skills-lock.json`, `client/dist`. They stay on disk.
`node_modules` stays visible.

## 7. Documentation

- `README.md` "Repository Layout" becomes a full annotated tree.
- `CLAUDE.md` "File Organization" gains the `__tests__/` convention, the page-folder rule
  (replacing "the page component itself still sits at `pages/<Page>Page.jsx`") and the
  service domains. Every mention elsewhere in the file that names a moved file _with a
  directory_ is updated; bare filenames stay valid and are left alone.

## Verification

Captured **before** the codemod runs, and compared after:

- Test file and test counts for the client, server and scripts suites.
- `npm run test:coverage` totals for both workspaces (statements / branches / functions /
  lines). No code changes, so these must match exactly.

Gates after the change, all required green:

- the specifier checker
- `npm test`, `npm run lint` (0 errors, 0 warnings), `npm run build`, `npm run knip`,
  `npm run format:check`, `npm run test:coverage`, `npm run test:e2e`
