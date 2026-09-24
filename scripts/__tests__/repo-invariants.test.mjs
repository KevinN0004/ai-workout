import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// knip.jsonc may hold comments, which JSON.parse rejects. Stripped with a
// scanner rather than a regex because the globs themselves contain "/*"
// ("scripts/**/*.test.mjs"), and the $schema URL contains "//" -- a regex
// would read both as comment openers.
const stripJsonComments = (text) => {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      out += char;
      if (char === "\\") {
        out += text[i + 1] ?? "";
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i === -1) throw new Error("Unterminated block comment");
      i += 1;
    } else {
      out += char;
    }
  }
  return out;
};

describe("the qs security override", () => {
  // The audit-ci gate is set to `high`, but the qs DoS advisories are
  // *moderate* -- so if this override were ever dropped, the vulnerability we
  // fixed would come straight back and the gate would stay green. Raising the
  // whole gate to `moderate` would fail the build on unrelated transitive
  // noise, so the fix that regressed is pinned directly instead.
  //
  // No Express 4 release reaches a patched qs: 4.22.2 pins qs ~6.15.1 and the
  // vulnerable range runs to 6.15.3. The override is the only thing holding
  // this, which is exactly why it needs its own assertion.
  const MINIMUM = [6, 16, 0];

  const atLeastMinimum = (version) => {
    const parts = version.split(".").map(Number);
    for (let i = 0; i < MINIMUM.length; i += 1) {
      if (parts[i] > MINIMUM[i]) return true;
      if (parts[i] < MINIMUM[i]) return false;
    }
    return true;
  };

  test("package.json still declares the override", () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    expect(pkg.overrides?.qs).toBeDefined();
    expect(atLeastMinimum(pkg.overrides.qs.replace(/^[^0-9]*/, ""))).toBe(true);
  });

  test("every resolved qs in the lockfile is at or above 6.16.0", () => {
    const lock = JSON.parse(readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));
    const resolved = Object.entries(lock.packages)
      .filter(([name]) => /(^|\/)qs$/.test(name))
      .map(([name, entry]) => ({ name, version: entry.version }));

    // A lockfile with no qs at all would pass vacuously; express pulls it in.
    expect(resolved.length).toBeGreaterThan(0);

    const stale = resolved.filter((entry) => !atLeastMinimum(entry.version));
    expect(stale).toEqual([]);
  });
});

const readSourceFiles = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...readSourceFiles(full));
    else if (entry.name.endsWith(".js") && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
};

describe("env.example stays in sync with the code", () => {
  // This was a manual two-direction grep in the implementation plan, which
  // means it only ran the once. The template drifting from the code is exactly
  // the failure it exists to prevent, so it is an assertion now.
  //
  // Two read patterns must both be covered: most modules use process.env.X,
  // but postgres.js and sessionService.js take an injected env object and read
  // env.X -- a process.env-only sweep would falsely flag POSTGRES_SSL and every
  // REDIS_* key as unused.
  const RUNTIME_SET = new Set(["NODE_ENV", "VITEST"]);

  const exampleKeys = new Set(
    (
      readFileSync(path.join(repoRoot, "env.example"), "utf8").match(/^[A-Z_0-9]+(?==)/gm) ?? []
    ).map((k) => k.trim())
  );

  const codeKeys = new Set(
    readSourceFiles(path.join(repoRoot, "server", "src"))
      .flatMap((file) => readFileSync(file, "utf8").match(/(?:process\.)?env\.[A-Z_0-9]+/g) ?? [])
      .map((match) => match.replace(/.*env\./, ""))
  );

  test("the sweep found something to compare", () => {
    expect(exampleKeys.size).toBeGreaterThan(20);
    expect(codeKeys.size).toBeGreaterThan(20);
  });

  test("every key in env.example is actually read by the server", () => {
    const unused = [...exampleKeys].filter((k) => !codeKeys.has(k)).sort();
    expect(unused).toEqual([]);
  });

  test("every variable the server reads is listed in env.example", () => {
    const missing = [...codeKeys].filter((k) => !exampleKeys.has(k) && !RUNTIME_SET.has(k)).sort();
    expect(missing).toEqual([]);
  });
});

describe("Claude Code hook wiring", () => {
  // `ruflo init` regenerates .claude/settings.json from a stock template that
  // knows nothing about this repo's scrub-junk-files.cjs rename, so it can
  // silently restore the stale .js path. A broken hook does not announce
  // itself -- CLAUDE.md says so explicitly -- so nothing but a check like this
  // would catch it.
  test("every scripts/ path referenced by settings.json exists on disk", () => {
    const settingsPath = path.join(repoRoot, ".claude", "settings.json");
    const raw = readFileSync(settingsPath, "utf8");
    const referenced = [...new Set(raw.match(/scripts\/[A-Za-z0-9_.-]+/g) ?? [])];

    // If this is empty the regex has drifted, not the repo -- fail loudly
    // rather than passing vacuously.
    expect(referenced.length).toBeGreaterThan(0);

    const missing = referenced.filter((rel) => !existsSync(path.join(repoRoot, rel)));
    expect(missing).toEqual([]);
  });
});

describe("Neon agent-skills scaffolding stays out of the build", () => {
  // The Neon skill installer scaffolds a Neon project into this repo: a config
  // declaring Neon Auth, three object-storage buckets and a serverless
  // function, a sample function, and @neon/* added to the ROOT package.json as
  // runtime dependencies. This app uses Neon only as a managed Postgres host,
  // so nothing in client/src or server/src imports any of it.
  //
  // The files it creates are gitignored. These two checks exist because
  // .gitignore cannot help with package.json and knip.jsonc, which are tracked
  // -- and that is the case that actually matters. On its first run knip caught
  // the unused dependencies and failed CI, which is the system working. On its
  // second run the installer ALSO added ignoreDependencies to knip.json,
  // silencing that gate: a green build shipping two unused packages into the
  // image via `npm ci --omit=dev`.
  //
  // So the dangerous artefact is not the dependency, it is the suppression.

  const readJson = (relativePath) =>
    JSON.parse(stripJsonComments(readFileSync(path.join(repoRoot, relativePath), "utf8")));

  test("no workspace declares an @neon/* dependency", () => {
    const manifests = ["package.json", "client/package.json", "server/package.json"];

    const offenders = manifests.flatMap((manifest) => {
      const pkg = readJson(manifest);
      const declared = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
        ...(pkg.optionalDependencies ?? {})
      };
      return Object.keys(declared)
        .filter((name) => name.startsWith("@neon/"))
        .map((name) => `${manifest}: ${name}`);
    });

    expect(offenders).toEqual([]);
  });

  test("knip.jsonc does not suppress an unused @neon/* dependency", () => {
    // Scoped to @neon rather than banning ignoreDependencies outright: a
    // genuine knip false positive is a legitimate reason to add one, and this
    // should not stand in the way of that. It exists to catch the entry being
    // re-added on our behalf.
    const knipConfig = readJson("knip.jsonc");

    const ignored = Object.values(knipConfig.workspaces ?? {}).flatMap(
      (workspace) => workspace.ignoreDependencies ?? []
    );

    expect(ignored.filter((name) => String(name).startsWith("@neon/"))).toEqual([]);
  });

  test("knip.jsonc is the only knip config", () => {
    // knip looks for knip.json BEFORE knip.jsonc, so a knip.json re-created
    // on our behalf would silently replace this config -- hook entries and
    // all -- rather than fail. It also merges a "knip" key from package.json
    // into whichever file it loads.
    const competitors = [
      "knip.json",
      ".knip.json",
      ".knip.jsonc",
      "knip.ts",
      "knip.js",
      "knip.config.ts",
      "knip.config.js"
    ].filter((name) => existsSync(path.join(repoRoot, name)));

    expect(competitors).toEqual([]);
    expect(existsSync(path.join(repoRoot, "knip.jsonc"))).toBe(true);
    expect(readJson("package.json").knip).toBeUndefined();
  });

  test("knip.jsonc still declares the hook scripts as entry points", () => {
    // Also proves the comment stripping leaves "/*" inside a string alone:
    // "scripts/**/*.test.mjs" would not survive a naive regex.
    const entries = readJson("knip.jsonc").workspaces["."].entry;

    expect(entries).toEqual(
      expect.arrayContaining([
        "scripts/codex-handoff.mjs",
        "scripts/scrub-junk-files.cjs",
        "scripts/skill-router.mjs",
        "scripts/**/*.test.mjs"
      ])
    );
  });
});
