import dotenv from "dotenv";

dotenv.config({ quiet: true });

/**
 * Refuses to run the server suite against anything but a local database.
 *
 * Twelve call sites across eight test files run `prisma.appUser.deleteMany({})`
 * with no `where` -- an unscoped truncate of the account table. Every AppUser
 * relation carries `onDelete: Cascade`, so each one also removes that account's
 * workout sessions, meal logs, progress metrics, calorie entries, generated
 * plans and saved exercises. That is correct for a disposable local database
 * and catastrophic anywhere else.
 *
 * Nothing prevented "anywhere else". `prisma.js` resolves its connection from
 * `dotenv.config()` and `process.env.DATABASE_URL` -- the same file, resolved
 * the same way, in tests as in production -- and the suite had no setupFiles,
 * no NODE_ENV check and no host allowlist. A `server/.env` holding a staging or
 * production URL meant `npm test` deleted every account in it.
 *
 * The risk is not theoretical and it rises from here: a real DATABASE_URL first
 * appears in someone's `server/.env` exactly when they prepare a deployment,
 * which is what this branch was built for.
 *
 * This converts that silent catastrophe into a startup error. It deliberately
 * has no escape hatch: an env var to bypass it would be set by the same person,
 * in the same file, under the same time pressure that causes the mistake.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

const resolveHost = (rawUrl) => {
  // Matches prisma.js's own resolution order.
  const url = String(rawUrl || "").trim();
  if (!url) return { host: "", parsed: false };
  try {
    // The postgres:// scheme parses fine with the WHATWG URL parser.
    return { host: new URL(url).hostname.toLowerCase(), parsed: true };
  } catch {
    // postgres.js has its own fallback for a URL too malformed to parse. A URL
    // we cannot read is one whose host we cannot vouch for, so refuse rather
    // than guess -- failing closed is the whole point of this file.
    return { host: "", parsed: false };
  }
};

const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const { host, parsed } = resolveHost(rawUrl);

if (!rawUrl) {
  // Not fatal: many suites never touch Postgres, and the ones that do fail
  // loudly on their own with "Can't reach database server". Guarding an absent
  // URL would turn a documented environmental condition into a hard stop.
} else if (!parsed) {
  throw new Error(
    `Refusing to run the server test suite: DATABASE_URL could not be parsed, so its host cannot be verified as local. ` +
      `This suite truncates the app_users table and cascades to every related row. ` +
      `Fix the URL in server/.env, or point it at localhost.`
  );
} else if (!LOCAL_HOSTS.has(host)) {
  throw new Error(
    `Refusing to run the server test suite against a non-local database (host: ${host}). ` +
      `This suite truncates the app_users table and cascades to every workout, meal log, progress metric, ` +
      `calorie entry, generated plan and saved exercise belonging to every account. ` +
      `Point DATABASE_URL at localhost in server/.env before running tests.`
  );
}
