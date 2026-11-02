# 0007. Stop each motion where it is defined, not with a global reset

Accepted. First recorded in `CLAUDE.md` on 2026-10-18 (`b527701`); moved here on 2026-11-02.

## Decision

Script checks `prefers-reduced-motion` before it animates, and each stylesheet carries its
own reduced-motion block beside the rules it stops. A global `*` reset was considered and
left out.

## Background

**Reduced motion is handled where each motion is, not by a global reset.** Script
reads `matchMedia("(prefers-reduced-motion: reduce)")` before it animates
(`useHomeStageFlow.js`, `usePreviewChapterFlow.js`,
`usePreviewWeekParticleAnimation.js`), and the stylesheets carry their own
`@media (prefers-reduced-motion: reduce)` blocks beside the rules they stop. A global
`*` reset was considered and left out (the Phase 4 plan, Task M2): it cannot stop the
script, it loses to the `!important` transitions it would need to stop, and it would
change every element's computed animation and transition, so a screenshot compare could
not list what it expects. Hover and press feedback has blocks of its own beside the white
buttons (`core/shell.css`) and the mode and unit toggles (`forms-and-motion.css`), which
stop the lift and the press-in as well as the transition. The home form's training-day
buttons are stopped in the same `forms-and-motion.css` block: `.home-stage *` stops their
transition and that block their transform, so under reduced motion they neither lift on
hover nor press in (measured in Chromium against the built bundle: `none` both ways).
