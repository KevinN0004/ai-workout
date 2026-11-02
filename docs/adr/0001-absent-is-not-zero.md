# 0001. Guard absent input before converting it to a number

Accepted. First recorded in `CLAUDE.md` on 2026-09-05 (`296e4af`); moved here on 2026-11-02.

## Decision

Upstreams spell "no reading" as an omitted key, an explicit `null` or `""`, and
`Number(null)` and `Number("")` are both `0`. So every numeric helper tests for absent input
before it calls `Number()`, never after, and never with `!value`, which swallows a measured
zero. `server/src/__tests__/numericCoercion.contract.test.js` and its client counterpart
hold every helper to that, one row per helper.

## Background

**Guarding the converter does not protect a caller that bypasses it.** This class has
recurred three times, and the third was in code I had already declared fixed:
`weatherCodeToText` kept its own `Number(code)`, and the weather routes called it with
the raw upstream value while building the neighbouring numeric field through
`toFiniteNumber`. One response carried `weatherCode: null` beside
`weatherText: "Clear sky"`. When you fix one of these, grep for every caller of the
helper and check what each passes in.

This is not hypothetical. Three shipped bugs came from it, all in health advice:

- a pm2.5 sensor reporting `null` was published as `0 ug/m3`, which scores **AQI 0** and
  told the user the air was clean
- a `null` weather code is code `0`, **"Clear sky"**, and a `null` temperature is `0 °C`,
  so a payload carrying no weather at all was reported as clear _and_ too cold to train
  outdoors
- the same `null` weather code went on reporting **"Clear sky"** from both weather routes
  and every day of the forecast after that fix, because those build `weatherText` from
  the raw value rather than from the guarded number

The whole external-data path has since been swept for it. `pm25ToUsAqi`, `aqiBand`,
`toFiniteNumber`, `weatherCodeToText`, `toNumberOrNull`, and `pm25NowCast`, which reads an
absent hour as a missing hour, all guard; `isSevereWeatherCode` is safe because `0` is not
a severe code; the wger and mealdb routes only use `cleanText`, which tests
`typeof value === "string"`.

`undefined` already behaved correctly, so an omitted key and an explicit `null` gave
opposite answers for the same missing data — which is what made it hard to see.

**Do not "fix" this with `!value`.** That swallows a genuine zero, and a measured zero is
a measurement: 0 °C really is below the cold gate. Range checks used to mask the bug too:
`toPositiveInt` and `parseRedisPort` were safe only because `> 0` and a port range reject
the accidental `0`, and `toRate` was safe only because its one caller passes `0` as the
fallback, so the accidental zero and the intended default happened to coincide. All three
now guard before they coerce, so the safety is intrinsic rather than a side effect of the
range. `toRate` was the one that mattered: `0` is a valid sample rate, so nothing else was
going to catch it if the default ever changed.

**The invariant is now asserted, not just described in `CLAUDE.md`.**
`server/src/__tests__/numericCoercion.contract.test.js` and its client counterpart enumerate every
numeric helper and pin three things: that `null`, `""` and `undefined` all agree, that a
non-numeric string is absent, and that a measured `0` survives. **Add a row when you add a
helper** — that is the whole mechanism, and it is why `toNumberOrNull`, the shape `CLAUDE.md`
tells you to copy, is now tested directly rather than only incidentally through
the dashboard integration suites.

Three things the contract deliberately does not flatten:

- **`toPositiveInt` and `parseRedisPort` exclude `0` from their domain**, so for them a
  measured `0` correctly reads as absent. Asserting otherwise would be wrong, so each row
  declares whether zero is meaningful for that helper.
- **`toNumberInput` does not make the three absent forms agree**, and must not. It feeds
  `z.preprocess`, where `undefined` has to stay `undefined` for `.optional()` to fire and
  `null` has to stay `null` for `z.null()` to match — collapsing them would lose the
  difference between a field omitted and a field explicitly cleared. It still honours the
  part that matters: an empty field becomes `null`, never `0`.
- **`pm25NowCast` takes a list of hours, not one value**, so its row feeds it three steady
  hours of the value under test. Reading an hour with `Number()` instead of
  `toFiniteNumber` fails that row for `null`, `""`, `undefined` and a non-numeric string.

Mutation-tested rather than trusted, since a contract test over correct code passes on the
first run either way. Removing the guard from `toNumberOrNull`, `toNullableNumber`,
`toFiniteNumber` (both copies) or `toRate` is caught; so is switching any of them to
`!value`. Removing it from `toPositiveInt` or `parseRedisPort` **survives, as predicted** —
those two are equivalent mutants, which is the mechanical proof that reshaping them changed
no answer.

**The class was not confined to the server, and the fourth instance is fixed.**
`useBodyModel.js` carried its own `toFiniteNumber` written the wrong way round —
`Number()` first, `Number.isFinite` after — while `defaultPersonalForm.bodyFat`
is `""`. So an unentered body fat resolved to `0`, `clamp(0, 3, 60)` lifted it
to `3`, and `explicitBodyFat ?? estimatedBodyFat` accepted that 3 as a real
answer. Anyone who filled in height and weight but not body fat was modelled at
**3% body fat**, leaner than an elite athlete, and the BMI-derived
`estimatedBodyFat` sitting beside it was unreachable from the app. It also
floored the silhouette's whole adiposity channel: `fatScore` clamped to `0` for
an ordinary BMI-25.8 profile.

The guard now runs before the coercion: `useBodyModel.js` reads through the client's
`toNumberOrNull` (`app/units.js`), the same shape as `repositories/rowValues.js`'s.
Two things follow from that, and both are worth knowing:

- **An unentered body fat now reaches the BMI estimate**, and `""`, `null` and
  an absent key all agree. An entered `"0"` is still a measurement and still
  clamps to the 3% floor — blank and zero are different answers.
- **The cross-unit height fallback came back to life.** Both `??` in that pick
  were dead for the same reason: the left operand was `0`, never `null`. A
  profile carrying a height in only one of the two fields used to resolve to no
  height at all; it now falls back to the other unit, which is what the
  expression was written to do.

Only `""` and `null` changed behaviour — `undefined` already returned null, and
weight was unaffected because `toKg` returns `""` for a falsy value and the
`> 0` check downstream rejected the `0` either way.

**A fifth instance sat in `pages/home/components/physique/math.js`, and it is fixed too.**
That file carried a _third_ `toFiniteNumber`, the only one taking an explicit
`fallback` argument, written the wrong way round like the others. It is the copy
the silhouette runs on: dozens of calls across `geometry.js`,
`templateOutline.js`, `outlineUtils.js` and `palette.js`.

It was never reachable from the app — `useBodyModel`'s `silhouetteShape` puts
every field through `clamp()` of a numeric expression, so the model it hands
`PhysiqueSilhouette2D` carries only finite numbers. It was a trap for the next
caller rather than a shipped bug. Two things let it survive the earlier sweep,
and both are worth recognising elsewhere:

- **Its test pinned the wrong behaviour with a comment that only explained the
  mechanism.** `expect(toFiniteNumber(null, 7)).toBe(0)` was annotated
  `// Number(null) is 0, which is finite` — true, and not a reason. Compare the
  `is_day` test in `weatherRoutes.test.js`, which argues that anything other
  than the flag "must not read as daytime". A comment that restates what the
  code does cannot tell you whether it should.
- **`geometry.test.js` already passed a `null` in and could not see it.** Its
  non-numeric case includes `waistHalf: null`, but asserts only that the path
  holds no `NaN` — true whichever way the null resolves. Exercising a value is
  not the same as discriminating on it.

The regression test now pins absent and zero apart at both levels. Note what the
geometry-level one had to assert: a zeroed dimension does **not** simply clamp to
its minimum bound, because `buildTemplateSizing` in `templateOutline.js` derives
its width scale from the **raw** model value rather than from geometry's clamped
local. Those unclamped scales are worth remembering before assuming the clamps in
`buildPhysiqueSilhouetteGeometry` bound everything downstream of them.

**Guard a value once, where it is summed.** `useDashboardMetrics.js` had the
same reading coerced two ways: the accumulation loops guarded with
`Number.isNaN` before adding to `caloriesByDate`, while `avgCalories` folded
`Number(item?.calories || 0)` with no guard at all. One unparseable row is
enough — `sum + NaN` stays NaN for the rest of the fold — and `avgCalories`
is rendered directly and drives a progress-bar width, so the card would read
"NaN" and the bar would get `width: NaN%`. Latent rather than shipped: the
calorie input is `type="number"` and the column is an Int, so nothing
currently feeds it a non-number. Both sites now share `toMetricNumber`,
which is the structural fix — two call sites that must agree will eventually
stop agreeing.
