import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, basename, extname, dirname } from "node:path";

const SYMBOL_RE = /^export\s+(?:async\s+)?(?:function|class|const)\s+(\w+)/gm;

function extractSymbols(absPath) {
  try {
    const content = readFileSync(absPath, "utf8");
    const symbols = [];
    let m;
    while ((m = SYMBOL_RE.exec(content)) !== null) {
      symbols.push(m[1]);
    }
    SYMBOL_RE.lastIndex = 0;
    return symbols;
  } catch {
    return [];
  }
}

function findTestFile(absPath, repoRoot) {
  const base = basename(absPath, extname(absPath));
  const dir = dirname(absPath);
  const exts = [".mjs", ".ts", ".js"];
  const suffixes = [".test", ".spec"];
  for (const suffix of suffixes) {
    for (const ext of exts) {
      const candidates = [
        join(dir, `${base}${suffix}${ext}`),
        join(
          repoRoot,
          "tests",
          dir.replace(repoRoot, "").replace(/^[\\/]/, ""),
          `${base}${suffix}${ext}`
        )
      ];
      for (const c of candidates) {
        if (existsSync(c)) {
          return c
            .replace(repoRoot, "")
            .replace(/^[\\/]/, "")
            .replace(/\\/g, "/");
        }
      }
    }
  }
  return null;
}

function defaultGrep(symbol, repoRoot) {
  try {
    const dirs = ["src", "backend"].map((d) => join(repoRoot, d)).filter(existsSync);
    if (dirs.length === 0) return [];
    const result = execSync(`grep -rl "${symbol}" ${dirs.map((d) => `"${d}"`).join(" ")}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function suggestFiles({
  changedFiles = [],
  stagedFiles = [],
  repoRoot = process.cwd(),
  grepFn
} = {}) {
  const grep = grepFn ?? defaultGrep;
  const result = [];
  const seen = new Set();

  for (const f of stagedFiles) {
    if (!seen.has(f)) {
      seen.add(f);
      result.push({ path: f, label: "staged" });
    }
  }

  for (const f of changedFiles) {
    if (!seen.has(f)) {
      seen.add(f);
      result.push({ path: f, label: "modified" });
    }
  }

  const allChanged = [...new Set([...stagedFiles, ...changedFiles])];
  const discovered = [];
  const discoveredSeen = new Set(seen);

  for (const relPath of allChanged) {
    const absPath =
      relPath.startsWith("/") || /^[A-Za-z]:/.test(relPath) ? relPath : join(repoRoot, relPath);

    const testFile = findTestFile(absPath, repoRoot);
    if (testFile && !discoveredSeen.has(testFile)) {
      discoveredSeen.add(testFile);
      discovered.push({ path: testFile, label: "test match" });
    }

    let symbols = [];
    try {
      symbols = extractSymbols(absPath);
    } catch {
      // skip — file unreadable
    }

    for (const symbol of symbols) {
      let callSites = [];
      try {
        callSites = grep(symbol, repoRoot);
      } catch {
        continue;
      }
      for (const site of callSites) {
        const rel = site
          .replace(repoRoot, "")
          .replace(/^[\\/]/, "")
          .replace(/\\/g, "/");
        if (!discoveredSeen.has(rel) && !allChanged.includes(rel)) {
          discoveredSeen.add(rel);
          discovered.push({ path: rel, label: `call site (uses ${symbol})` });
        }
      }
    }
  }

  return [...result, ...discovered.slice(0, 12)];
}
