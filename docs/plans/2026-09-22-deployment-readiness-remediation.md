# Deployment readiness remediation

Closes the findings from the pre-deployment audit of 2026-09-22. The audit is
not reproduced here; each task below states the defect, the fix, and the
evidence that will prove it.

One PR, one commit per concern.

## The finding that matters

`helmet`'s CSP was `default-src 'none'` with no `script-src` or `style-src`,
carrying the comment _"Every response here is JSON, so nothing legitimately
loads a subresource."_ That was true until this process began serving the SPA.
It stopped being true when `staticClient.js` landed, and nothing caught it.

Measured in Chromium against a real `NODE_ENV=production` boot:

```
error: Loading the script '/assets/index-*.js' violates the following
       Content Security Policy directive: "default-src 'none'"
error: Loading the stylesheet '/assets/index-*.css' violates ...
#root innerHTML length: 0     visible text length: 0
```

**A blank page, while `/api/ready` answered 200 throughout** — so Render's
health check passes, the deploy workflow's smoke check passes, and the deploy
reports success.

Three things had to be simultaneously true for this to survive:

1. The CSP is asserted by **no test anywhere**.
2. The E2E browser talks to `vite preview`, which has no helmet. Only `/api` is
   proxied to Express, so the Express-served document is never loaded by a
   browser.
3. The CI container job smoke-tests the deployable with
   `curl … | grep 'id="root"'`. curl does not enforce CSP, so the check passes
   against a page that cannot run.

Task 2 is therefore the more important half of this plan. The CSP fix without
it leaves the same hole open for the next header.

---

## Task 1 — Correct the CSP

**Status: applied, verified, uncommitted.**

`server/src/index.js`. Add the directives the SPA actually needs, determined by
recording what the app loads rather than by guessing:

| Directive     | Value                                                       | Why                                    |
| ------------- | ----------------------------------------------------------- | -------------------------------------- |
| `script-src`  | `'self'`                                                    | the bundle                             |
| `style-src`   | `'self' https://fonts.googleapis.com`                       | built CSS `@import`s Google Fonts      |
| `font-src`    | `'self' https://fonts.gstatic.com`                          | what that CSS then resolves to         |
| `img-src`     | `'self' data: blob: wger.de placehold.co www.themealdb.com` | exercise, placeholder and meal imagery |
| `connect-src` | `'self'`                                                    | the `/api` calls                       |
| `base-uri`    | `'self'`                                                    | was `'none'`                           |
| `form-action` | `'self'`                                                    | was `'none'`                           |
| `object-src`  | `'none'`                                                    | explicit                               |

`'unsafe-inline'` is **not** required and must not be added. React sets styles
through the CSSOM, which `style-src` does not govern. This was verified, not
assumed — the browser check reports zero violations without it.

Verification: app renders, `document.fonts.size` is 18, computed body font is
`"Space Grotesk"`, zero violations, zero CSP-blocked requests.

## Task 2 — Put a browser on the deployable

The gap, not the symptom.

The E2E Express server **already serves the bundle with the CSP applied** — the
browser is simply never pointed at it. So this needs a Playwright _project_,
not another server.

- Add a `deployable` project to `playwright.config.js` with
  `baseURL: http://localhost:5000` (the Express server), alongside the existing
  `chromium` project on the preview origin.
- Add `e2e/deployable.spec.js`: load `/`, assert the SPA renders, assert **zero**
  CSP violations and zero CSP-blocked requests, assert the Google Fonts chain
  resolved, and assert a client route falls back to the shell while an unknown
  `/api` path still 404s.

Collect violations via `page.on("console")` and `page.on("requestfailed")`
filtered on `failure().errorText === "csp"`.

Scope note: this project runs the server in its ordinary mode, not
`NODE_ENV=production`. The CSP is not gated on `NODE_ENV`, so it is fully
exercised either way, and production-mode `Secure` cookies would not survive
plain HTTP. Production-only headers are covered by Task 3 instead, where
supertest can assert them directly.

## Task 3 — Assert the security headers in the server suite

`server/src/index.test.js` (or a sibling). Supertest against `app`:

- the CSP names `script-src`, `style-src`, `connect-src`, `font-src` and
  `img-src`, and `default-src` is still `'none'`
- `style-src`/`font-src` carry the Google Fonts hosts
- the CSP does **not** contain `'unsafe-inline'`

This is the cheap, fast guard; Task 2 is the one that proves the page actually
runs.

## Task 4 — Cache the hashed assets

`server/src/staticClient.js`. Vite emits content-addressed filenames under
`assets/` precisely so they can be cached forever; they are currently served
`Cache-Control: public, max-age=0`, so every visit revalidates.

Use `express.static`'s `setHeaders`, which fires **before** Cache-Control is set
and takes precedence (`send` only sets it `if (!res.getHeader('Cache-Control'))`):

- anything under `assets/` → `public, max-age=31536000, immutable`
- everything else → `no-cache`

Match on `assets` as a path segment using `path.sep`, so it holds on Windows and
in the Linux image alike. The SPA fallback sets `no-cache` explicitly before
`sendFile`, so the shell is never cached while pointing at a stale bundle.

## Task 5 — `/api/ready` is boot readiness; say so

Decision taken: **keep the boot snapshot, correct the documentation.**

`postgresStatus` is written once by `connectPostgres()` and never re-probed, so
`/api/ready` reports Postgres as connected forever after a successful boot.
Redis is live (`isReady`), which makes the two asymmetric.

A live probe was rejected deliberately: Render polls this path continuously, so
a `select 1` per poll would keep Neon permanently awake, defeating its
scale-to-zero and consuming the free compute allowance. Boot readiness is also
the correct semantic for a deploy gate.

So: fix `docs/deploy-runbook.md`, which calls it "the real check", and add a
line to `systemRoutes.js` and `render.yaml` recording that the Postgres flag is
a boot-time snapshot.

## Task 6 — Recommend `sslmode=verify-full`

`pg` warns that `require` is currently an alias for `verify-full` and that
`pg` v9 / `pg-connection-string` v3 will adopt libpq semantics, which skip
certificate verification. The runbook currently tells the reader to use
`require`.

Measured: `require` and `verify-full` both resolve to `ssl = {}` today, so the
change is behaviour-neutral **and** silences the warning. Update the runbook and
`env.example`.

## Task 7 — Document the SSL precedence

Decision taken: **document, do not change behaviour.**

`POSTGRES_SSL` and `POSTGRES_SSL_REJECT_UNAUTHORIZED` are inert whenever the URL
carries `sslmode` — measured, an explicit `ssl: { rejectUnauthorized: true }`
still resolves to `{}`. `env.example` presents them as controls. Say plainly
that a URL's `sslmode` wins, and that these apply only to URLs without one.

## Task 8 — Small, real cleanups

- `db/prisma.js`: `prismaLog` has **identical arms** on both sides of its
  ternary — the dead-conditional pattern this repo already hunts. Collapse it.
- `index.js`: redact `req.headers.x-metrics-token` alongside the other
  credential headers.
- `index.js`: the startup log says `http://localhost:${port}`, which is wrong in
  a container. Log the port without inventing a host.
- Runbook: "Verifying it worked" curls `/api/health` and `/api/ready` and then
  says "open the site and sign up" — neither step can catch a blank page. Add
  one that can.
- `CLAUDE.md`: server coverage reads 93.79/85.64 against a measured 93.88/86.18,
  and "1022 server tests" against a measured 1031.

**Deliberately not done:** the raw `pg` pool has no runtime consumers beyond the
boot connectivity check, but `connectPostgres`/`closePostgres` are live and that
check is what `/api/ready` reports. It is not dead code, and removing the pool
would remove the check. Left alone.

---

## Verification

Per task, the gate is its own test. For the whole change:

```
npm run lint && npm run format:check && npm test && npm run build && npm run test:e2e
```

plus `npm run test:coverage` for the ratchet.

**Mutation checks** — each must fail the named test, since a passing assertion
over already-correct code proves nothing:

| Mutation                                   | Must be caught by     |
| ------------------------------------------ | --------------------- |
| CSP back to `default-src 'none'` alone     | Tasks 2 and 3         |
| drop `font-src` from the CSP               | Task 2 (fonts assert) |
| `setHeaders` always returns `no-cache`     | Task 4                |
| SPA fallback loses its explicit `no-cache` | Task 4                |

Confirm each mutation actually applied by checking the file changed, not just
the exit code — this repo has been bitten by CRLF and shell escaping silently
preventing a match.

---

## Outcome

All eight tasks done. Measured, not estimated:

| Gate            | Result                                                   |
| --------------- | -------------------------------------------------------- |
| `lint`          | exit 0                                                   |
| `format:check`  | exit 0                                                   |
| `knip`          | exit 0                                                   |
| `build`         | exit 0, 0 warnings                                       |
| `test`          | **3354** — 19 scripts, 2293 client, 1042 server          |
| `test:e2e`      | **19** — 14 `chromium`, 5 `deployable`                   |
| `test:coverage` | client 98.69 / 93.62, server 93.89 / 86.18; ratchet held |

**Every mutation was caught, each by exactly the test that should own it:**

| Mutation                                 | Caught by                                    |
| ---------------------------------------- | -------------------------------------------- |
| remove `script-src`                      | 3 of 5 browser tests, and the header suite   |
| drop `fonts.gstatic.com` from `font-src` | the font test only — the app still _renders_ |
| `setHeaders` always `no-cache`           | the caching test only                        |
| SPA fallback loses `no-cache`            | the caching test only (received `max-age=0`) |

The font mutation is the one worth remembering: blocked fonts do not break
rendering, so only an assertion aimed at the font chain sees it. A single
"does the page work" test would have passed.

### Two things found while implementing, not in the original audit

- **`eslint.config.js` gave `e2e/**` node globals only.** A `page.evaluate`
  callback is serialised and run in the browser, so `document` and
  `getComputedStyle` were `no-undef`. No existing spec used `page.evaluate`, so
  nothing had exposed it. Both global sets are now applied to that block.
- **`cacheControlFor` was exported and knip flagged it.** Narrowed to
  module-private per the convention in `CLAUDE.md` — "unused export usually
  means the export, not the value" — and covered instead through the injected
  `express` in `staticClient.test.js`, which already builds a real temporary
  bundle with an `assets/` directory.

### Still open, deliberately

- The CI container job's smoke check is unchanged. It is curl-based and cannot
  see a CSP defect, but it is not wrong — the `deployable` project is what
  covers that now, and both run on every push.
- `/api/ready` still reports a boot snapshot for Postgres. Documented rather
  than changed, for the reason in Task 5.
