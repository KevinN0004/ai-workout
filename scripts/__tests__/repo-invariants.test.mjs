import { execFileSync } from "node:child_process";
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

describe("qs stays on a patched release", () => {
  // The audit-ci gate is set to `high`, but the qs DoS advisories are
  // *moderate* -- so if a vulnerable qs ever came back, the gate would stay
  // green. Raising the whole gate to `moderate` would fail the build on
  // unrelated transitive noise, so the fix is pinned directly instead.
  //
  // This used to be a package.json override, because no Express 4 release
  // reached a patched qs (4.22.2 pinned ~6.15.1; the vulnerable range runs to
  // 6.15.3). Express 5 asks for ^6.14.0, which admits the patched line, so the
  // override was dropped as dead weight -- removing it changed nothing in the
  // lockfile. The assertion below was always the real guard: it fails if any
  // resolution ever lands below 6.16.0 again, override or not.
  const MINIMUM = [6, 16, 0];

  const atLeastMinimum = (version) => {
    const parts = version.split(".").map(Number);
    for (let i = 0; i < MINIMUM.length; i += 1) {
      if (parts[i] > MINIMUM[i]) return true;
      if (parts[i] < MINIMUM[i]) return false;
    }
    return true;
  };

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

describe("the rate-limit-redis / express-rate-limit pairing", () => {
  // The two move together: rate-limit-redis 5.x needs express-rate-limit >= 8.5
  // and 6.x needs >= 8.6. Bumping the store without the limiter fails `npm ci`
  // with ERESOLVE, which is loud and needs no help from here.
  //
  // The quiet direction is the other one. 4.x declared its peer as ">= 6", so
  // express-rate-limit 8 satisfied it and resolved cleanly -- while v8 renamed
  // `max` to `limit` and changed the Store contract rateLimitStore.js
  // implements. Nothing about resolution would have objected. This repo moved
  // to 6.x on 8.x together in e15c445, checked against a real Redis.
  //
  // Quieter still is a forced install: legacy-peer-deps, or an override on either
  // package, lets any mismatch through in silence. That is the same shape as the
  // Neon case above, where the dangerous artefact was not the dependency but the
  // thing hiding it.
  //
  // Majors this repo has actually run. Bumping either side fails here until the
  // table is updated, which is the point -- it forces the pairing to be re-checked
  // rather than assumed from a loose peer range.
  const KNOWN_GOOD_MAJORS = [
    { store: 4, limiter: [6, 7] },
    { store: 6, limiter: [8] }
  ];

  const lock = JSON.parse(readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));
  const entryFor = (name) => lock.packages[`node_modules/${name}`];
  const majorOf = (name) => Number(entryFor(name).version.split(".")[0]);

  test("both packages are in the lockfile", () => {
    // Without this the checks below would pass vacuously on a typo.
    expect(entryFor("express-rate-limit")?.version).toBeDefined();
    expect(entryFor("rate-limit-redis")?.version).toBeDefined();
  });

  test("the installed express-rate-limit satisfies the store's declared peer range", () => {
    const peer = entryFor("rate-limit-redis").peerDependencies?.["express-rate-limit"];
    expect(peer).toBeDefined();

    const minimumMajor = Number(peer.replace(/[^0-9.]/g, "").split(".")[0]);
    expect(Number.isInteger(minimumMajor)).toBe(true);
    expect(majorOf("express-rate-limit")).toBeGreaterThanOrEqual(minimumMajor);
  });

  test("the installed majors are a pairing recorded here", () => {
    const storeMajor = majorOf("rate-limit-redis");
    const limiterMajor = majorOf("express-rate-limit");

    const recorded = KNOWN_GOOD_MAJORS.find((row) => row.store === storeMajor);
    expect(
      recorded,
      `rate-limit-redis ${storeMajor}.x is not a pairing recorded in this test`
    ).toBeDefined();
    expect(recorded.limiter).toContain(limiterMajor);
  });

  test("nothing suppresses a peer mismatch", () => {
    const npmrc = readFileSync(path.join(repoRoot, ".npmrc"), "utf8");
    expect(npmrc).not.toMatch(/^\s*legacy-peer-deps\s*=\s*true/im);

    const overrides =
      JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).overrides ?? {};
    expect(Object.keys(overrides)).not.toContain("express-rate-limit");
    expect(Object.keys(overrides)).not.toContain("rate-limit-redis");
  });
});

describe("the Deploy workflow deploys only this repository's own pushes", () => {
  // The repository is public, and deploy.yml's `branches: [main]` filter matches
  // the triggering CI run's head branch NAME -- a pull request from a fork whose
  // branch is called `main` matches too, and its CI run completes in this
  // repository's context, with the production secrets. The job condition is
  // what stops a stranger triggering production deploys. Read as text rather
  // than parsed: the yaml package is not a declared dependency, and knip would
  // rightly flag importing it.
  const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "deploy.yml"), "utf8");
  const condition = (
    (workflow.match(/^ {4}if: >-\r?\n([\s\S]*?)^ {4}environment:/m) || [])[1] ?? ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const [manual, automatic = ""] = condition.split(" || (");

  test("the job condition was found", () => {
    // Guards the regex: if the block moves, the tests below must not pass
    // vacuously on an empty string.
    expect(manual).toBe("github.event_name == 'workflow_dispatch'");
    expect(automatic).not.toBe("");
  });

  test("an automatic deploy requires a green CI run for a push to this repository", () => {
    expect(automatic).toContain("vars.AUTO_DEPLOY == 'true'");
    expect(automatic).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(automatic).toContain("github.event.workflow_run.event == 'push'");
    expect(automatic).toContain(
      "github.event.workflow_run.head_repository.full_name == github.repository"
    );
  });

  test("those requirements are all required, not alternatives", () => {
    // One `||` inside the automatic branch would let any single check through.
    expect(automatic).not.toContain("||");
  });

  test("the checkout is pinned to the commit CI passed", () => {
    // Without a `ref`, a workflow_run event checks out main's current HEAD, so a
    // later push could have its migrations applied by an earlier commit's deploy.
    const checkouts = workflow.match(
      /uses: actions\/checkout@[^\r\n]*\r?\n(?: {8,}(?!uses:)[^\r\n]*\r?\n)*/g
    );
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0]).toContain("ref: ${{ github.event.workflow_run.head_sha || github.sha }}");
  });
});

describe("every source file opens with a header comment", () => {
  // docs/code-readability-sop.md asks every non-test source file to open with a
  // comment saying what it is for. This checks presence only; whether a header
  // is any good is review's job.
  //
  // file-header-allowlist.json is empty, so every in-scope source file must
  // open with a header: a new file gets one, never an entry. ALLOWLIST_SIZE
  // pins the list's length, so an entry fails "the allowlist has exactly
  // ALLOWLIST_SIZE entries" unless the constant is raised in the same diff --
  // the line a reviewer should refuse. An entry for a file that has a header,
  // or that is not an in-scope file, fails the tests named for those cases.
  const ALLOWLIST_SIZE = 0;

  const IN_SCOPE_DIRS = ["client/src", "server/src", "server/scripts", "scripts", "e2e"];
  const isInScope = (file) =>
    /\.(js|jsx|mjs|cjs|css)$/.test(file) &&
    !/\.(test|spec)\.|(^|\/)__tests__\/|^client\/src\/test\/setup\.js$/.test(file) &&
    (IN_SCOPE_DIRS.some((dir) => file.startsWith(`${dir}/`)) ||
      /(^|\/)[^/]+\.config\.js$/.test(file));
  // Tracked files, not a directory walk, so stray local files cannot fail it.
  const sources = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter((file) => file && isInScope(file) && existsSync(path.join(repoRoot, file)));

  // A comment that only instructs a tool tells a reader nothing, so it is not a
  // header. The rule reads the comment's first line of content, which also
  // catches a directive split across lines ("/*\n eslint-disable */"). ESLint
  // reads a rule setting and a globals list only in a block comment, and
  // "global" only in JS, so "// global error handler" and a stylesheet's
  // "/* global tokens */" are both headers.
  const TOOL_DIRECTIVE =
    /^(eslint-(disable|enable|env)\b|prettier-ignore\b|(istanbul|c8|v8)\s+ignore\b|@ts-(check|nocheck|ignore|expect-error)\b|@vitest-environment\b)/;
  const BLOCK_ONLY_DIRECTIVE = /^eslint\s+[\w@/-]+\s*:/;
  const JS_BLOCK_ONLY_DIRECTIVE = /^globals?(\s|$)/;
  // True when, after a byte-order mark and a shebang line, the text opens with a
  // comment whose first line of content is not a tool directive.
  const hasHeaderText = (file, text) => {
    const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const body = withoutBom.replace(/^#!.*\r?\n/, "").trimStart();
    const isBlock = body.startsWith("/*");
    let lines;
    if (body.startsWith("//")) {
      lines = [];
      for (const line of body.split(/\r?\n/)) {
        if (!line.trimStart().startsWith("//")) break;
        lines.push(line.trimStart().slice(2));
      }
    } else if (isBlock) {
      const end = body.indexOf("*/", 2);
      lines = body.slice(2, end === -1 ? undefined : end).split(/\r?\n/);
    } else {
      return false;
    }
    const content =
      lines.map((line) => line.replace(/^\s*[*!]+/, "").trim()).find((line) => line !== "") ?? "";
    if (content === "" || TOOL_DIRECTIVE.test(content)) return false;
    if (!isBlock) return true;
    if (BLOCK_ONLY_DIRECTIVE.test(content)) return false;
    return !(/\.(js|jsx|mjs|cjs)$/.test(file) && JS_BLOCK_ONLY_DIRECTIVE.test(content));
  };
  const hasHeader = (file) => hasHeaderText(file, readFileSync(path.join(repoRoot, file), "utf8"));

  const allowlist = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts", "__tests__", "file-header-allowlist.json"), "utf8")
  );
  const allowed = new Set(allowlist);
  const BOM = String.fromCharCode(0xfeff);

  test.each([
    ["a block comment", "a.js", '/**\n * Does a thing.\n */\nimport x from "y";\n', true],
    ["a line comment", "a.js", "// Does a thing.\nexport const a = 1;\n", true],
    ["a CSS comment after a byte-order mark", "a.css", `${BOM}/* The drawer. */\n.a {}\n`, true],
    ["a header after a shebang", "a.mjs", "#!/usr/bin/env node\n// A tool.\n", true],
    [
      "a byte-order mark, then a shebang, then a header",
      "a.mjs",
      `${BOM}#!/usr/bin/env node\n// A tool.\n`,
      true
    ],
    ["CRLF line endings", "a.js", "/**\r\n * Does a thing.\r\n */\r\n", true],
    ["a licence comment", "a.js", "/*! Licensed MIT */\n", true],
    [
      "a stylesheet header that starts with the word global",
      "a.css",
      "/* global resets and tokens */\n",
      true
    ],
    [
      "a line comment that starts with the word global",
      "a.js",
      "// global error handler for every route\n",
      true
    ],
    [
      "a line comment that starts with eslint and a colon",
      "a.js",
      "// eslint config: flat, scoped to defect classes\n",
      true
    ],
    ["an import first", "a.js", 'import x from "y";\n// late\n', false],
    [
      "a directive above the header",
      "a.js",
      "// eslint-disable-next-line no-console\n/** Header. */\n",
      false
    ],
    ["a directive split across lines", "a.js", "/*\n  eslint-disable no-console\n*/\n", false],
    ["an ESLint globals comment", "a.js", "/* globals window */\n", false],
    [
      "an ESLint globals comment broken after the keyword",
      "a.js",
      "/* globals\n  window */\n",
      false
    ],
    ["a coverage directive", "a.js", "/* v8 ignore next */\n", false],
    ["a TypeScript check directive", "a.js", "// @ts-check\n", false],
    ["an empty comment", "a.js", "//\nexport const a = 1;\n", false],
    ["use strict first", "a.cjs", '"use strict";\n// late\n', false],
    ["an empty file", "a.js", "", false]
  ])("the header rule: %s", (_label, file, text, expected) => {
    expect(hasHeaderText(file, text)).toBe(expected);
  });

  test("the sweep found the source tree", () => {
    // Guards the scope: a broken filter must not pass vacuously, so one file
    // from each part of it must be present.
    expect(sources.length).toBeGreaterThan(150);
    for (const file of [
      "server/src/index.js",
      "client/src/styles/base.css",
      "scripts/manual-deploy.mjs",
      "server/scripts/refuse-db-push.js",
      "playwright.config.js"
    ]) {
      expect(sources).toContain(file);
    }
  });

  test("every source file not on the allowlist opens with a header", () => {
    const missing = sources.filter((file) => !allowed.has(file) && !hasHeader(file));
    expect(
      missing,
      "give each file a header comment (docs/code-readability-sop.md, rule 1); never add it to file-header-allowlist.json"
    ).toEqual([]);
  });

  test("every allowlisted file still lacks one, so the list only shrinks", () => {
    const done = allowlist.filter((file) => sources.includes(file) && hasHeader(file));
    expect(
      done,
      "these files have a header now: delete them from file-header-allowlist.json and lower ALLOWLIST_SIZE"
    ).toEqual([]);
  });

  test("every allowlisted path is an in-scope tracked file, listed once", () => {
    const stale = allowlist.filter((file) => !sources.includes(file));
    expect(
      stale,
      "these are not in-scope tracked files: delete them from file-header-allowlist.json and lower ALLOWLIST_SIZE"
    ).toEqual([]);
    expect(allowed.size, "an entry is listed twice").toBe(allowlist.length);
  });

  test("the allowlist has exactly ALLOWLIST_SIZE entries", () => {
    expect(
      allowlist.length,
      "lower ALLOWLIST_SIZE when entries are removed; never raise it -- give the new file a header instead"
    ).toBe(ALLOWLIST_SIZE);
  });
});
