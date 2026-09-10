#!/usr/bin/env node
/**
 * Applies the two repository git settings that live in .git/config rather than
 * in the repository, so a fresh clone gets them without anyone remembering to.
 *
 * Both used to be documented steps in CLAUDE.md, which meant a clone silently
 * ran without the pre-commit guard and attributed ~3,500 lines to the Prettier
 * reformat until someone noticed. Neither failure announces itself, which is
 * exactly why this runs from `prepare` instead: npm invokes it on every
 * `npm install` and `npm ci`, and installing is already step one of setup.
 *
 * Fails open. A missing git binary, a tarball with no .git, or a checkout where
 * the target file is absent are all normal situations, not errors worth
 * stopping an install over.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const SETTINGS = [
  { key: "core.hooksPath", value: ".githooks", requires: ".githooks" },
  {
    key: "blame.ignoreRevsFile",
    value: ".git-blame-ignore-revs",
    requires: ".git-blame-ignore-revs"
  }
];

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const main = () => {
  try {
    if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") return;
  } catch {
    // No git, or not a checkout. Nothing to configure.
    return;
  }

  const applied = [];
  for (const { key, value, requires } of SETTINGS) {
    if (!existsSync(requires)) continue;
    let current = "";
    try {
      current = git(["config", "--get", key]);
    } catch {
      // Unset. git exits 1 when the key is missing, which is not a failure here.
    }
    if (current === value) continue;
    try {
      git(["config", key, value]);
      applied.push(`${key}=${value}`);
    } catch {
      // A read-only or unusual git config is the user's business, not ours.
    }
  }

  if (applied.length > 0) {
    process.stdout.write(`[setup-git-config] set ${applied.join(", ")}\n`);
  }
};

main();
