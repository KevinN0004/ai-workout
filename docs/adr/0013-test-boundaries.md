# 0013. Stub layout, randomness and library calls as boundaries

Accepted. First recorded in `CLAUDE.md` on 2026-09-06 (`fa2b62e`); moved here on 2026-11-02.

## Decision

`getBoundingClientRect`, `Math.random`, `navigator`, `Intl` and library calls such as
animejs's `createTimeline` are boundaries a test stubs as it stubs `fetch`, so a hook that
measures elements or draws at random is tested rather than written off. An assertion on
jsdom's computed styles is checked against what jsdom actually stores.

## Background

**Check before calling something untestable.** This entry said for months
that the animation hooks were limited because they measure real element
rects, which jsdom does not provide. Every part of that turned out wrong,
and it cost four files their coverage:

- `useMealDbSearch.js` sat at 0% described that way on nothing but proximity
  to them. It is a data-fetching hook and went to 97% with no layout at all.
- `usePreviewChapterFlow.js` sat at 0% on the same list and **measures
  nothing** — it is a timed state machine over `setTimeout`, `setInterval`
  and `Date.now`, and fake timers drive all of it. 0% → 100%/100%.
- `useHomeStageFlow.js` and `usePreviewWeekParticleAnimation.js` really do
  measure rects, and went to 94% and 96% branches anyway.

The technique, in order of what to reach for:

- **Layout is a boundary.** `getBoundingClientRect` is a function on the
  element you hand the hook, so a test stubs it exactly as it stubs `fetch`.
  The arithmetic on top of the fake numbers is the arithmetic that ships.
- **Randomness is a boundary.** `vi.spyOn(Math, "random").mockReturnValue(0.5)`
  makes `randomBetween` land on its midpoint, so a cell's area maps to an
  exact particle count. Vary the draw to reach both sides of a coin flip.
- **Where the output is a library call rather than DOM, record the call.**
  Wrapping `createTimeline` from animejs turns "it did not throw" into an
  assertion that a 600×320 panel morphs to 900×600 and translates by
  (-30, -60), and gives you the `onComplete` to invoke directly.

Reach for those before writing anything off.

**jsdom's CSSOM is not a faithful mirror, and guessing at it wastes a run.**
`rgba(14, 14, 14, 1)` reads back as `rgb(14, 14, 14)`, and an unstyled
element's computed `color` is `rgb(0, 0, 0)` rather than empty, so a
`style.color || fallback` branch can never take its fallback here. Check
what it stores before asserting on it. **It changed under jsdom 29**, which
rewrote the CSSOM: `border: none` used to read back as `""` and now reads
`"none"`, as Chromium does, and the computed `color` above used to be
`canvastext`. A test that pinned the old answer failed on the upgrade.
