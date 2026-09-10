import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

describe(".prettierignore exclusions", () => {
  // One file is excluded because Prettier 3.9.6 never reaches a fixed point on
  // it. That exclusion should not outlive the upstream bug, and nothing else
  // would prompt anyone to revisit it -- a Dependabot Prettier bump shows only
  // a lockfile diff, and `prettier --check` stays green because the file is
  // ignored. So this asserts the exclusion is still *earning its place*, and
  // fails once it stops.
  const excluded = "docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md";

  test("the non-converging markdown file still does not converge", () => {
    const source = path.join(repoRoot, excluded);
    expect(existsSync(source)).toBe(true);

    const scratch = mkdtempSync(path.join(tmpdir(), "prettier-converge-"));
    try {
      const probe = path.join(scratch, "probe.md");
      writeFileSync(probe, readFileSync(source, "utf8"));

      const format = () => {
        execFileSync(
          process.execPath,
          [
            path.join(repoRoot, "node_modules", "prettier", "bin", "prettier.cjs"),
            "--write",
            probe
          ],
          { cwd: repoRoot, stdio: "ignore" }
        );
        return readFileSync(probe, "utf8");
      };

      const first = format();
      const second = format();

      // If this ever fails, Prettier has been fixed: delete the entry from
      // .prettierignore, delete this test, and let the file be formatted.
      expect(second).not.toBe(first);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
