#!/usr/bin/env node
/**
 * Deletes the stray 0-byte files a background tool leaves in the working tree.
 * Claude Code's SessionStart and Stop hooks run it from .claude/settings.json,
 * which knip cannot see: hence its entry in knip.jsonc. Pass --dry-run to
 * report without deleting.
 */
"use strict";

/*
 * The strays are named like shell or code fragments, e.g.
 * `{console.log('refused')`, `-D)`, `String(taskId`. Their likely source is the
 * ruflo (@claude-flow) background integration re-parsing recent command text,
 * which is third-party and not reproducible on demand, so this is a safe
 * janitor, not a root-cause fix.
 *
 * SAFETY — a file is removed only if ALL THREE hold (triple guard):
 *   1. It is UNTRACKED by git (from `git ls-files --others --exclude-standard`),
 *      so a tracked/committed file can never be deleted, and gitignored paths
 *      (node_modules, dist, ...) are excluded.
 *   2. It is a regular file of exactly 0 bytes.
 *   3. Its basename does not look like a real file in this repo — either it
 *      carries a shell/code metacharacter ({ } ( ) [ ] ' " ` ; & | < > * ? $),
 *      whitespace or a leading '-', OR looksLegitimate() rejects it: it has no
 *      known extension, is not a known bare name, and is not a .env variant.
 *
 * The second half of guard 3 is for the strays with clean-looking names
 * (`node`, `complete`, `task.id`, `.ts`, `openapi-typescript`), which the
 * signature alone misses. Guards 1 and 2 are what make that wider rule safe:
 * gitignored build output is never listed, tracked files are never listed, and
 * anything holding real content is skipped, so the worst case is deleting an
 * empty, untracked file whose name looks wrong.
 *
 * It ends in exit 0, and catches the git call, the stat and the delete, so it
 * does not break the hook chain it runs in. It prints one line when it removes
 * anything (or, with --dry-run, would), and nothing otherwise.
 */

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DRY_RUN = process.argv.includes("--dry-run");

// A character that no tracked filename in this repo carries, and that the
// code-fragment strays do.
const JUNK_SIGNATURE = /[{}()[\]'"`;&|<>*?$]|\s/;

// The extensions tracked files in this tree use, bar one, plus the common
// asset and tooling extensions a future file might reasonably arrive with.
// Deliberately generous: a missed junk file costs nothing, a wrong deletion
// costs trust. The one missing is `.jsonc`, so only guards 1 and 2 protect
// knip.jsonc.
const KNOWN_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".xml",
  ".svg",
  ".sh",
  ".ps1",
  ".bat",
  ".cmd",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".sql",
  ".prisma",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".conf",
  ".lock",
  ".txt",
  ".csv",
  ".log",
  ".map",
  ".snap",
  ".patch",
  ".diff",
  ".example",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".wasm",
  ".zip",
  ".gz",
  ".tsbuildinfo"
]);

// Legitimate names that carry no extension (or are dotfiles, which Node reports
// as having no extension). Any other name without a known extension, bar a .env
// variant, fails guard 3. This repo's CODEOWNERS and .git-blame-ignore-revs are
// not listed, so like knip.jsonc they rely on guards 1 and 2.
const KNOWN_NAMES = new Set([
  "Dockerfile",
  "Makefile",
  "Procfile",
  "LICENSE",
  "NOTICE",
  "CHANGELOG",
  "README",
  "pre-commit",
  "pre-push",
  "post-commit",
  "commit-msg",
  ".gitignore",
  ".gitattributes",
  ".gitkeep",
  ".gitmodules",
  ".keep",
  ".npmrc",
  ".nvmrc",
  ".editorconfig",
  ".dockerignore",
  ".prettierrc",
  ".prettierignore",
  ".eslintrc",
  ".eslintignore"
]);

// A name that reads like a real file: a known extension, a known bare name, or
// any .env variant (.env.local, .env.production, ...), which is easy to create
// empty. .gitignore covers only `.env` itself, so the variants do reach here.
function looksLegitimate(base) {
  if (KNOWN_NAMES.has(base)) return true;
  if (base === ".env" || base.startsWith(".env.")) return true;
  const ext = path.extname(base).toLowerCase();
  return ext !== "" && KNOWN_EXTENSIONS.has(ext);
}

function untrackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: ROOT,
      encoding: "utf8",
      windowsHide: true
    });
    return out.split("\0").filter(Boolean);
  } catch {
    // Not a git repo / git unavailable — do nothing rather than guess.
    return [];
  }
}

function isJunk(relPath) {
  const base = path.basename(relPath);
  const suspicious = JUNK_SIGNATURE.test(base) || base.startsWith("-") || !looksLegitimate(base);
  if (!suspicious) return false;
  const abs = path.join(ROOT, relPath);
  try {
    const st = fs.lstatSync(abs);
    return st.isFile() && st.size === 0;
  } catch {
    return false;
  }
}

const removed = [];
for (const rel of untrackedFiles()) {
  if (!isJunk(rel)) continue;
  if (DRY_RUN) {
    removed.push(rel);
    continue;
  }
  try {
    fs.rmSync(path.join(ROOT, rel));
    removed.push(rel);
  } catch {
    // best-effort; leave it for the next pass
  }
}

if (removed.length > 0) {
  const verb = DRY_RUN ? "would remove" : "removed";
  process.stdout.write(
    `scrub-junk-files: ${verb} ${removed.length} junk file(s): ${removed
      .map((r) => JSON.stringify(r))
      .join(", ")}\n`
  );
}

process.exit(0);
