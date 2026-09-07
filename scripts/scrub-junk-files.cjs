#!/usr/bin/env node
'use strict';

/*
 * scrub-junk-files.cjs
 *
 * Removes stray 0-byte "junk" files that a background tooling process occasionally
 * spawns in the working tree (names that are shell/code fragments, e.g.
 * `{console.log('refused')`, `backend/'`, `-D)`, `String(taskId`). See the
 * 2026-07-12 systematic-debugging investigation: the local hooks/helpers/gate
 * scripts were all ruled out; the source is the ruflo (@claude-flow) background
 * integration re-parsing recent command text, which is third-party and not
 * reproducible on demand. This is a safe janitor, not a root-cause fix.
 *
 * SAFETY — a file is removed only if ALL THREE hold (triple guard):
 *   1. It is UNTRACKED by git (from `git ls-files --others --exclude-standard`),
 *      so a tracked/committed file can never be deleted, and gitignored paths
 *      (node_modules, dist, ...) are excluded.
 *   2. It is exactly 0 bytes.
 *   3. Its basename does not look like a real file in this repo — either it
 *      carries a shell/code metacharacter ({ } ( ) [ ] ' " ` ; & | < > * ? $),
 *      whitespace or a leading '-', OR it has no recognised source extension and
 *      is not one of the legitimate extension-less names listed below.
 *
 * Guard 3 used to be the signature check alone, which left behind every
 * clean-looking stray the spawner produces (`node`, `complete`, `task.id`,
 * `.ts`, `openapi-typescript`) — roughly a third of each batch. Guards 1 and 2
 * are what make the wider rule safe: gitignored build output is never listed,
 * tracked files are never listed, and anything holding real content is skipped,
 * so the worst case is deleting an empty, untracked, unrecognised file.
 *
 * Always exits 0 so it never breaks the hook chain it runs in. Prints a line only
 * when it actually removes something. Pass --dry-run to report without deleting.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// Basename carries a character that never appears in this repo's real filenames
// but is present in every observed junk name.
const JUNK_SIGNATURE = /[{}()[\]'"`;&|<>*?$]|\s/;

// Extensions that real files in this tree actually use, plus the common asset and
// tooling extensions a future file might reasonably arrive with. Deliberately
// generous: a missed junk file costs nothing, a wrong deletion costs trust.
const KNOWN_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.json',
  '.md',
  '.mdx',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.xml',
  '.svg',
  '.sh',
  '.ps1',
  '.bat',
  '.cmd',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.sql',
  '.prisma',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.conf',
  '.lock',
  '.txt',
  '.csv',
  '.log',
  '.map',
  '.snap',
  '.patch',
  '.diff',
  '.example',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.wasm',
  '.zip',
  '.gz',
  '.tsbuildinfo',
]);

// Legitimate names that carry no extension (or are dotfiles, which Node reports
// as having no extension). Anything not here and not extension-bearing is junk.
const KNOWN_NAMES = new Set([
  'Dockerfile',
  'Makefile',
  'Procfile',
  'LICENSE',
  'NOTICE',
  'CHANGELOG',
  'README',
  'pre-commit',
  'pre-push',
  'post-commit',
  'commit-msg',
  '.gitignore',
  '.gitattributes',
  '.gitkeep',
  '.gitmodules',
  '.keep',
  '.npmrc',
  '.nvmrc',
  '.editorconfig',
  '.dockerignore',
  '.prettierrc',
  '.prettierignore',
  '.eslintrc',
  '.eslintignore',
]);

// A name that reads like a real file: a known extension, a known bare name, or
// any .env variant (.env.local, .env.production, ...) which is gitignored and
// easy to recreate empty.
function looksLegitimate(base) {
  if (KNOWN_NAMES.has(base)) return true;
  if (base === '.env' || base.startsWith('.env.')) return true;
  const ext = path.extname(base).toLowerCase();
  return ext !== '' && KNOWN_EXTENSIONS.has(ext);
}

function untrackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
    });
    return out.split('\0').filter(Boolean);
  } catch {
    // Not a git repo / git unavailable — do nothing rather than guess.
    return [];
  }
}

function isJunk(relPath) {
  const base = path.basename(relPath);
  const suspicious = JUNK_SIGNATURE.test(base) || base.startsWith('-') || !looksLegitimate(base);
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
  const verb = DRY_RUN ? 'would remove' : 'removed';
  process.stdout.write(
    `scrub-junk-files: ${verb} ${removed.length} junk file(s): ${removed
      .map((r) => JSON.stringify(r))
      .join(', ')}\n`,
  );
}

process.exit(0);
