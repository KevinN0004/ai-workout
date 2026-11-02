# 0006. Judge accessibility with axe on rendered pages, not with the linter

Accepted. First recorded in `CLAUDE.md` on 2026-09-13 (`66d6a88`); moved here on 2026-11-02.

## Decision

`e2e/a11y.spec.js` runs axe over rendered pages and asserts zero violations, and when a
linter and the engine disagree about rendered output, the engine wins. Three jsx-a11y
interaction rules are off as one decision, because keyboard dismissal lives in
`useCloseOnEscape`, where they cannot see it.

## Background

**Accessibility is checked by axe against rendered pages, not by the linter, and
that order is deliberate.** `e2e/a11y.spec.js` scans the login and signup forms, the
dashboard, an open modal, the settings forms and the account panel's states, asserts
zero violations, and checks that a modal can be dismissed from the keyboard alone. It
rides the same Playwright job, so it is already in CI.

The linter is the junior authority here, and the numbers say why. jsx-a11y's
recommended set reported **153 findings; 128 were false positives** from
`label-has-for` and `control-has-associated-label`, both firing on
`<label>Name <input /></label>` — the shape every form in this app uses. Nesting
alone is a valid association, which is why `label-has-for` is deprecated
upstream. axe reports zero violations on those same forms. **When a linter and
the accessibility engine disagree about rendered output, the engine wins.**

What axe actually found, and what was fixed:

- **`aria-dialog-name` (serious).** Four of six modals had `role="dialog"` with
  no accessible name, so a screen reader announced "dialog" and nothing else.
  `MealDetailsModal` and `PlansView` already set `aria-label`; the rest did not.
  The four are now named by `aria-labelledby` pointing at their own visible
  heading, so the name cannot drift from what is on screen. (One of the four,
  `GeneratedPlanModal`, has since been deleted.)
- **`region` (moderate).** The header note and the at-a-glance cards sat between
  `<header>` and `<main>` as bare children of the page. Wrapped in a named
  `<section>`. Safe because `.dashboard-page` is plain block flow and the only
  direct-child selector is `.dashboard-page > .title`, which still matches —
  verified with a full-page screenshot before and after, **byte-identical**.

**Three jsx-a11y interaction rules are off, and the reason is a real trade.**
`click-events-have-key-events`, `no-static-element-interactions` and
`no-noninteractive-element-interactions` produced 20 findings, all one pattern:
an overlay backdrop whose `onClick` dismisses it. Keyboard dismissal is now
handled by `useCloseOnEscape` — `ModalPortal` calls it for every modal,
`DashboardDrawer` calls it directly because it is the one overlay not portalled
— so the backdrop click is a redundant mouse affordance. The rules cannot see
that, because it lives in a hook rather than on the element. They are off as one
recorded decision rather than twenty inline disables, and **the axe scan is the
thing that should catch a real keyboard trap instead.**

Before that hook existed, **no overlay in the app closed on Escape at all**: a
mouse user could click the backdrop, a keyboard user had to find the Close
button. Three role bugs were fixed alongside it — two `<aside role="tablist">`
(a landmark given an interactive role) and a `<button role="listitem">` (which
strips the button semantics a screen reader needs).

Mutation-tested rather than trusted, because an axe assertion that passes may be
asserting nothing: removing a modal's `aria-labelledby`, removing the landmark
wrapper, and disabling the Escape handler are all caught, and all three pass
every unit suite.
