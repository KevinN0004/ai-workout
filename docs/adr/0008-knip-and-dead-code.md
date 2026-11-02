# 0008. Keep knip clean through its config, and measure the bundle before claiming a saving

Accepted. First recorded in `CLAUDE.md` on 2026-09-13 (`c2c820f`); moved here on 2026-11-02.

## Decision

`knip.jsonc` declares the hook scripts as entry points, because `.claude/settings.json`
invokes them where knip cannot see. An unused export is narrowed to module-private before
anything is deleted, and a deletion is said to shrink the bundle only once the bundle has
been measured.

## Background

**`npm run knip` is clean, and `knip.jsonc` is what keeps it that way.** Two things
about it are load-bearing:

- **It must declare the hook scripts as entry points.** `codex-handoff.mjs`,
  `run-claude-helper.cjs`, `scrub-junk-files.cjs` and `skill-router.mjs` are invoked
  from `.claude/settings.json`, which knip cannot see — so without the config it
  reports every one of them as an unused file, then cascades and reports
  `codex-handoff/*.mjs` too, because their only importer looks dead. **That is a
  false positive for every hook file, inviting you to delete the whole hook wiring.**
  They are live; see the Fresh Clone Setup checklist in `CLAUDE.md` that runs them.
- **"Unused export" usually means the export, not the value.** Of the 17 knip
  originally reported, 12 were constants used inside their own module to derive
  others that _are_ consumed — `PREVIEW_WEEK_LINE_DRAW_MS` feeds
  `PREVIEW_WEEK_OUTLINE_DRAW_MS`, and so on. Those were narrowed to
  module-private rather than deleted. Only `goalOptions` and the two meal
  libraries were genuinely dead, and `goalOptions` has since come back (`a498ff2`):
  Settings offers it as the goal select, and `createDefaultPlannerForm` falls back to
  its first entry.

**Deleting dead source does not necessarily shrink the bundle**, and assuming it
does is how you overstate a cleanup. `MEAL_LIBRARY` and `EXTRA_MEAL_LIBRARY` were
736 lines reachable only through a re-export nothing imported; removing them
changed the built bundle by **zero bytes and not even the content hash**, because
rollup was already tree-shaking them. Verified by grepping `client/dist` for a
string from the file before and after. They were worth removing for the reading,
not for the shipping. Measure the bundle rather than claiming it.
