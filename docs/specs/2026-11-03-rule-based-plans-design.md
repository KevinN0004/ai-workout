# Rule-based plans, design

Status: **decided 2026-11-03, revised the same day against the evidence review**
(`docs/specs/2026-11-03-rule-based-plans-evidence.md`); nothing applied. The plan is
`docs/plans/2026-11-03-rule-based-plans.md`. This replaces the rest of roadmap B3 as
`docs/specs/2026-11-03-plan-quality-evals-design.md` planned it: its scorers stay, as the
gate below, and its live eval run goes.

The owner wants workouts chosen by an algorithm of the app's own instead of by Gemini. This
spec sets out the algorithm's rules, the exercise library they choose from, a short health
screen, what Gemini still does, how the plan's quality is gated, and what changes on the
roadmap. Every rule below names its source class: **guideline** (WHO, ACSM or a clinical
guideline), **meta-analysis**, **trial**, **convention** (common coaching practice with no
direct test) or **derived** (this spec's own arithmetic). The evidence review holds the
citations, the evidence grades and what could not be verified.

## What was found

Read on `ef481e8`.

1. **Gemini writes the whole plan.** `POST /api/generate` (`server/src/routes/generateRoutes.js`)
   sends the planner form to Gemini through `planPromptService.js`, and parses the text it
   returns into days and notes with `buildPlanPayload`. It saves both, and answers
   `{ plan, payload, savedPlan }`.
2. **Everything downstream reads that text format, and nothing else.** The plan views, the meal
   plan, plan-day logging and planned versus done read the saved payload's days, each a
   weekday heading and its lines. `isRestDay` (`client/src/app/plans.js`) tells a rest day by
   its opening main entry: one that starts with "Rest", "Full Rest", "Active Recovery" or
   "Optional". The notes are the lines under `Coach Notes:`. A plan written in that format by
   any other means needs no change downstream.
3. **Generation fails without Gemini.** With no key the route answers 500. A timeout is a 504,
   and a cut-off, empty or over-long answer is a 502. The client waits 40 seconds
   (`GENERATE_TIMEOUT_MS`, `client/src/app/events.js`), sized to the server's 30-second
   `GEMINI_TIMEOUT_MS`.
4. **The E2E suite leaves generation out** only because it needs a real key (`e2e/README.md`).
5. **B3's scorers check structure and equipment as an algorithm must.**
   `scripts/evals/scorePlan.mjs` finds structure breaks and equipment the profile lacks, with
   the app's own parser and rest-day rule.
6. **The injury keywords match substrings, and so produce false positives.** `detectInjuryFlags`'
   keyword lists (`client/src/pages/dashboard/tips/recommendationUtils.js`) and the scorer
   both match with `.includes()`. So `press` flags a leg press and a Pallof press for a
   shoulder, `raise` flags a calf raise, `curl` and `extension` flag a leg curl and a leg or
   back extension for a wrist, `kickback` flags a triceps kickback for a hip, and `jump` flags
   a jump rope for a knee.
7. **The goal, level and injuries arrive as free text.** The planner offers fixed options
   (`client/src/app/constants.js`), but `/api/generate` accepts any cleaned string, and its body
   schema passes unknown keys through (`.passthrough()`, `apiSchemaService.js`).
8. **The session user carries the profile.** `attachOptionalUser` sets `req.user` from
   `findUserById`, whose user holds `profile`, and the profile's `age` is a number from 10 to
   120 that sign-up requires. The planner form has no age field. An anonymous caller has no
   profile.
9. **The evidence review** (`docs/specs/2026-11-03-rule-based-plans-evidence.md`) found the
   draft's splits, rep ranges and library filtering sound, and five conflicts:
   - **Some day swaps train a muscle group once a week.** WHO 2020 and ACSM 2026 both set a
     minimum of all major muscle groups on 2 or more days.
   - **The mobility and recovery tracks had no strength work.**
   - **The slot formula gave a 30-minute full-body day only a squat and a hinge.**
   - **The fat-loss and cardio tracks lifted light, with short rests**, which has no evidence
     behind it, and every plan fell well short of 150 aerobic minutes a week.
   - **The strict injury rule removed the exercise that every back, knee, hip, shoulder and
     elbow guideline names as first-line care.**

## Decisions

Decided by the owner on 2026-11-03, first round:

- **Gemini writes the coach notes only.** Removing it entirely, and keeping it as a fallback
  for the whole plan, were offered and not chosen.
- **The exercises come from a curated library in the repository.** The wger catalogue, and a
  curated library linked to wger, were offered and not chosen.
- **This spec's rules are a draft for the owner to edit,** and the owner asked for them to be
  checked against the evidence first.

Second round, after the evidence review:

- **Modify, with a short avoid list.** An exercise is tagged `ok`, `modify` or `avoid` for each
  injury. `Modify` swaps in a named easier variant with a cue, and only `avoid` is left out.
  This replaces the strict rule chosen in the first round. Keeping the strict rule, with the
  false positives fixed, was offered and not chosen.
- **A short health screen in the planner.** Three to five yes/no questions in the app's own
  words. A notice alone, and no screen, were offered and not chosen.
- **Deloads wait for B4,** which reads the history a week counter needs. This phase adds a
  note on the signs of overreaching. Deloading from a count of saved plans now was offered and
  not chosen.
- **Beginners are capped, and the profile's age is used.** A beginner trains at most three
  full-body days, and their other chosen days become conditioning, easy aerobic or mobility.
  A profile age of 65 or over adds balance work and longer stretch holds. Balance work for
  everyone without reading age, and no caps, were offered and not chosen.

Settled in this spec:

- **The algorithm runs on the server,** as pure functions with no I/O, so it can move to the
  client later (C1) without a rewrite.
- **The same input always gives the same plan.** No randomness, so every rule is testable and a
  regression shows as a diff.
- **A plan never fails because of Gemini.** Rule-written notes stand in whenever the notes call
  cannot be used.
- **Safety text is always rule-written.** The red-flag line, the general notice, the referral
  line and each injury line are appended by the rules, whoever wrote the other notes.
- **The health answers are not stored.** They shape the plan generated with them and are not
  saved with it. The plan's notes say which rule applied, so the saved plan explains itself.
- **The PAR-Q+ is linked, not copied.** Its licence permits no changes, so the screen uses the
  app's own questions, modelled on ACSM's 2015 screening algorithm, and links to the full
  PAR-Q+.

## Design

### The exercise library

`server/src/services/planning/exerciseLibrary.js`, about 120 entries. Each entry has:

- `id`, kebab-case and unique, and `name`, as the plan shows it;
- `pattern`, one of `squat`, `hinge`, `horizontal-push`, `vertical-push`, `horizontal-pull`,
  `vertical-pull`, `single-leg`, `glutes-calves`, `core`, `arms`, `conditioning`, `mobility`,
  `balance`;
- `needs`, the capabilities it requires, all of them; an empty list is bodyweight;
- `level`, the lowest level it suits: `beginner`, `intermediate` or `advanced`;
- `flags`, a map from area to `modify` or `avoid`. An area it does not name is `ok`. The
  areas are `lower back`, `back`, `knee`, `shoulder`, `hip`, `wrist`, `elbow` and `pregnancy`;
- `regressions`, for each area it marks `modify`: the `id` of the easier entry to use instead,
  and a short `cue`, for example `{ knee: { id: "box-squat", cue: "sit back to a box at a
height that stays comfortable" } }`;
- `impact`, `high` or `low`, for conditioning entries.

The order within a pattern is its priority: the first eligible entry is the default choice.

**Capabilities** are `dumbbell`, `kettlebell`, `barbell`, `bench`, `band`, `pull-up bar`,
`cable`, `machine`, `cardio machine` and `pool`. Each planner label supplies the ones the
scorers' table credits it with (`scorePlan.mjs`): `Dumbbells` supplies `dumbbell`,
`Strength floor` supplies `barbell`, `dumbbell`, `kettlebell`, `bench`, `pull-up bar` and
`machine`, `Full gym access` supplies all of them, and so on. A label the map does not know
supplies nothing, and no label is needed for bodyweight work or a mat.

**The avoid lists.** These are convention, and no guideline grades individual gym lifts:

| Area             | Avoid                                                                             |
| ---------------- | --------------------------------------------------------------------------------- |
| Knee             | jumps and plyometrics, pistol squats                                              |
| Lower back, back | the barbell deadlift and the good morning as main lifts                           |
| Shoulder         | upright rows, behind-the-neck presses and pulldowns, dips, snatches, jerks        |
| Wrist, elbow     | dips, barbell skull crushers                                                      |
| Hip              | pistol squats, deep sumo squats                                                   |
| Pregnancy        | jumps, burpees and sprints; exercises lying flat on the back; heavy maximal lifts |

**Modify, not exclude.** Exercise is first-line care for low back pain, knee and hip
osteoarthritis, patellofemoral pain, rotator-cuff-related shoulder pain and lateral elbow
pain (guideline: Cochrane 2021, WHO 2023, ACP 2017, OARSI 2019, ACR 2019, NICE NG226, JOSPT
2019; meta-analysis and trials for the shoulder and elbow). So a flagged pattern is trained
with an easier variant rather than dropped. Typical regressions:

- **Knee:** a box squat to a comfortable height, a wall sit, or a low step-up.
- **Back:** a hip thrust, or a dumbbell Romanian deadlift to mid-shin, at accessory loads.
- **Shoulder:** a landmine or neutral-grip press, plus band external rotation.
- **Wrist:** push-ups on handles, or a neutral-grip press.
- **Elbow:** hammer curls.

The variants are convention.

### The injury rules, shared

`server/src/services/planning/injuryRules.js` holds the area names and their name forms,
`coveredBy`, `detectInjuryFlags` and `buildInjuryText`, moved from `recommendationUtils.js`.
On the server they do one job: **map the injuries answer, a planner option or free text, to
areas.** They match whole words, not substrings. Library entries are judged by their `flags`,
never by name keywords. Free text that maps to no area is kept, and the notes say the plan
could not adjust for it. The Guides view keeps its copy and its scoring. A client contract
test asserts that both copies map every planner option and every name form to the same areas.

### The health screen

The planner gains one step, "A few health questions", with four yes/no questions, each
optional:

1. Has a doctor told you that you have a heart condition, high blood pressure, diabetes, or a
   lung, kidney or liver condition?
2. Do you get chest pain or pressure, faint or feel dizzy, or become unusually short of breath,
   during activity or at rest?
3. Has a health professional told you to exercise only under supervision, or to limit
   physical activity?
4. Are you pregnant, or have you given birth in the last six months?

The step links to the full PAR-Q+ for a fuller self-check. It never blocks a plan. An
unanswered question counts as no. The request carries the answers as
`health: { condition, symptoms, supervised, pregnant }`, each a boolean, and they are not
saved. Questions 1 to 3 follow ACSM's 2015 algorithm, which screens on known
cardiovascular, metabolic or renal disease, on symptoms, and on medical advice (guideline).
Question 4 follows WHO 2020, ACOG 804 and the 2019 Canadian guideline (guideline).

**Any yes** puts the plan in **light-to-moderate mode**:

- no interval sessions and no strength-focus scheme;
- every set stops at least three reps short of failure;
- every conditioning block is steady, at a pace where the user can talk.

The notes then carry a referral line: check with a health professional before training
harder (guideline, ACSM 2015). **A yes to question 4** also adds the `pregnancy` area, and
the notes advise checking with the midwife or doctor.

### The generator

`server/src/services/planning/generatePlan.js` exports `generatePlan(input, library?)`, where
`input` is the defaulted form, the health answers, and the profile's age or null. It returns
`{ text, week }`:

- `text` is the plan in the format of finding 2, without notes;
- `week` is the structured result the gate checks: each day's type and its exercises, with
  their ids and patterns.

#### Step 1: read the input

- **The goal's track:** each of the five goal options maps to its own track. Free text maps by
  its words: fat or loss to fat loss; cardio, endurance or run to cardio; mobility; recovery;
  and anything else to lean strength. A Strength focus on the lean-strength track is the
  **strength focus**.
- **The level:** Beginner, Intermediate or Advanced, ignoring case, else Intermediate.
- **The areas:** from the injuries answer (above), plus `pregnancy` from the screen.
- **The equipment:** the capabilities its labels supply. "Commercial" reads the commercial
  labels, and any other environment reads the home labels.
- **Light-to-moderate mode:** any yes on the screen.
- **Older adult:** a profile age of 65 or over (guideline, WHO 2020).

#### Step 2: the training weekdays

| Days | Training weekdays                     |
| ---- | ------------------------------------- |
| 1    | Wednesday                             |
| 2    | Monday, Thursday                      |
| 3    | Monday, Wednesday, Friday             |
| 4    | Monday, Tuesday, Thursday, Friday     |
| 5    | Monday to Wednesday, Friday, Saturday |
| 6    | Monday to Saturday                    |
| 7    | every day                             |

#### Step 3: the day types

The day types are:

| Code | Meaning                        |
| ---- | ------------------------------ |
| FB   | full body, alternating A and B |
| U    | upper body                     |
| L    | lower body                     |
| P    | push                           |
| PL   | pull                           |
| LG   | legs                           |
| C    | conditioning                   |
| LC   | long steady cardio             |
| E    | easy aerobic day               |
| M    | mobility                       |

U, L, P, PL, LG and FB are strength days. Each row below is the training days in order, for
the days asked:

| Track, level                            | 1   | 2     | 3        | 4         | 5            | 6               | 7                 |
| --------------------------------------- | --- | ----- | -------- | --------- | ------------ | --------------- | ----------------- |
| Lean strength, intermediate or advanced | FB  | FB FB | FB FB FB | U L U L   | U L C U L    | P PL LG P PL LG | P PL LG P PL LG M |
| Lean strength, beginner                 | FB  | FB FB | FB FB FB | U L U L   | FB C FB FB M | FB C FB E FB M  | FB C FB E FB M E  |
| Fat loss, intermediate or advanced      | FB  | FB FB | FB FB FB | U L C FB  | U L C U L    | U L C U L C     | U L C U L C M     |
| Fat loss, beginner                      | FB  | FB FB | FB FB FB | FB C FB C | FB C FB C FB | FB C FB C FB M  | FB C FB C FB M E  |
| Cardio, any level                       | FB  | FB FB | FB C FB  | FB C FB C | FB C FB C LC | FB C FB C FB LC | FB C FB C FB LC M |
| Mobility, any level                     | FB  | FB FB | FB M FB  | FB M FB M | FB M FB M M  | FB M FB M FB M  | FB M FB M FB M M  |
| Recovery, any level                     | FB  | FB FB | FB E FB  | FB E FB M | FB E FB M E  | FB E FB M FB E  | FB E FB M FB E M  |

- **The floor is two strength days.** Every row with two or more days keeps all major muscle
  groups on two days or more (guideline, WHO 2020 and ACSM 2026). A one-day plan is below
  that floor: its main lifts get one extra set, and the notes say two days is the minimum.
- **The beginner cap is three full-body days** (meta-analysis and guideline: ACSM 2009 puts
  novices at 2 to 3 days a week; the cap itself is derived). At 4 days it is U L U L, since
  no three of Monday, Tuesday, Thursday and Friday are free of back-to-back days. The cap
  applies to the lean-strength and fat-loss tracks; the other tracks never exceed three
  strength days.
- **The mobility and recovery tracks keep two or three full-body strength days.** Full-range
  strength training improves range of motion as much as stretching does (meta-analysis,
  Afonso 2021), and active recovery beats rest for soreness (meta-analysis, Dupuy 2018).
- **A Mobility or Recovery focus** turns one day of a sequence that has no M into M, so that
  every strength pattern still has two days:

  | Track, level                            | 3         | 4         | 5            | 6               |
  | --------------------------------------- | --------- | --------- | ------------ | --------------- |
  | Lean strength, intermediate or advanced | FB FB M   | U L FB M  | U L C FB M   | U L C U L M     |
  | Lean strength, beginner                 | FB FB M   | U L FB M  | unchanged    | unchanged       |
  | Fat loss, intermediate or advanced      | FB FB M   | FB C FB M | U L C FB M   | U L C U L M     |
  | Fat loss, beginner                      | FB FB M   | FB C FB M | FB C FB M FB | unchanged       |
  | Cardio                                  | unchanged | FB C FB M | FB C FB M LC | FB C FB M FB LC |

  At 1, 2 and 7 days, and where a cell reads unchanged, the focus instead adds two or three
  stretches to the end of each strength day.

#### Step 4: the slots and the session's length

| Day type | Slots, in order                                                            |
| -------- | -------------------------------------------------------------------------- |
| FB       | squat, horizontal-push, hinge, horizontal-pull, single-leg, core, arms     |
| U        | horizontal-push, vertical-pull, vertical-push, horizontal-pull, arms, core |
| L, LG    | squat, hinge, single-leg, glutes-calves, core                              |
| P        | horizontal-push, vertical-push, horizontal-push, arms, core                |
| PL       | vertical-pull, horizontal-pull, horizontal-pull, arms, core                |
| C        | conditioning, conditioning, core, conditioning                             |
| LC, E    | conditioning, mobility, mobility                                           |
| M        | mobility, mobility, balance, core, mobility                                |

The full-body order puts a leg, a push and a pull in the first four slots, multi-joint before
single-joint (guideline, ACSM 2009; a review, Iversen 2021, sets one leg, one push and one
pull as the minimum). An **older adult** also gets a `balance` slot after `core` on FB and L
days (guideline, WHO 2020: balance and strength on 3 or more days for people 65 and over).

**How many slots fill** follows a time budget (derived; every constant here is this spec's
own estimate):

- **The warm-up is 3 minutes** for a session of 20 minutes or less, 5 minutes under 45, and 8
  from 45 up. Ramp-up sets of the first main lift are counted at one minute each (step 7).
- **The finisher is 0** at 20 minutes or less. Otherwise it is 5 minutes for lean strength, the
  strength focus, mobility and recovery, and 10 for fat loss. A cardio-track strength day opens
  with a 20-minute cardio block (15 for beginners) instead.
- **The exercise count** is
  `clamp(floor((minutes - warmup - rampUp - finisher) / perExercise), floor, 8)`:
  - `perExercise` is 7 minutes for lean strength, 10 for the strength focus, 5 for fat loss,
    6 for cardio and 3 for mobility, recovery and M days;
  - `floor` is 4 on FB days, 3 on other strength days, and 4 on M days.
- **Past a day type's slot list,** the list repeats from the top.
- **Supersets:** when the floor does not fit the time, slots are paired, a push with a pull or
  an upper with a lower, and written `A1.` and `A2.` (a review, Iversen 2021, finds supersets
  roughly halve session time at similar volume).
- **The first two filled slots are the main lifts,** and the rest are accessories. A main
  lift that a regression replaced takes the accessory prescription.

#### Step 5: choose an exercise for each slot

Choose the first library entry of the slot's pattern that:

- **needs only capabilities the input supplies;**
- **suits the level,** its level being at or below the input's;
- **is not `avoid` for any area in the input.** An entry that is `modify` for one is replaced
  by its regression for that area, with the cue, and the regression must itself pass every
  rule;
- **has not been used this week,** if any other entry fits, so A and B days differ and two
  slots of one pattern on a day differ.

**The library guarantees** an `ok` bodyweight beginner entry for every area in `squat`,
`hinge`, `single-leg` and `core`: a wall sit, a glute bridge, a supported split squat, a dead
bug. So no combination of areas empties a lower day. A slot nothing fits is still left out,
and it is never filled with an entry that breaks a rule. An area of `knee`, `hip` or
`pregnancy` takes only `low`-impact conditioning.

#### Step 6: the prescription

Every line carries an effort cue, written as reps in reserve: "stop 2 reps short of failure".
Training to failure adds little or nothing (meta-analysis, Refalo 2023; Robinson 2024), and
beginners misjudge how close they are, so beginners keep 3 in reserve throughout
(convention).

| Track              | Main lifts                                                                        | Accessories                                              | Finisher                                                     |
| ------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| Lean strength      | 3 x 8-10, rest 90s, 2 in reserve                                                  | 3 x 10-12, rest 60-90s, 1-2 in reserve                   | 5 minutes of conditioning                                    |
| Strength focus     | 3 x 5, rest 150-180s, 2 in reserve; advanced 4 x 5; beginners use lean strength's | 3 x 8-10, rest 90s                                       | 5 minutes                                                    |
| Fat loss           | 3 x 8-12, rest 90s, 2 in reserve                                                  | 2-3 x 12-15, rest 45-60s, supersets allowed              | 10 minutes, intervals and steady alternating across the week |
| Cardio             | 2-3 x 6-10, rest 90s, 3 in reserve; beginners 2 x 8-10                            | 2 x 10-12, rest 60s                                      | the cardio block comes first instead                         |
| Mobility, recovery | 2-3 x 10-12, full range, a 3-second lowering, 3 in reserve                        | stretches 2 x 30 seconds; dynamic drills 2 x 8-10 a side | 5 minutes of easy breathing and 2-3 stretches                |

- **Sources by track:**
  - Lean strength: guideline (ACSM 2009) and meta-analysis (Singer 2024).
  - Strength focus: guideline (ACSM 2026: 2-3 sets at heavy loads; ACSM 2009: 3-5 minutes of
    rest for heavy work).
  - Fat loss: guideline (ACSM 2009 on weight loss: lifting keeps lean mass and does not add
    weight loss) and meta-analysis (Wewege 2017: intervals and steady cardio lose the same fat;
    Schwingshackl 2013).
  - Cardio: meta-analysis in trained runners (Blagrove 2018; Schumann 2022: interference is
    small). Applying it to general users is derived.
  - Stretch dose: guideline (ACSM: about 60 seconds a stretch in 10-30 second holds; 30-60 for
    older adults).
  - The exact numbers are convention.
- **A beginner** does one set fewer, never below 2.
- **An advanced lifter** does one set more on the main lifts (convention; it follows the
  volume dose-response, meta-analysis, Pelland 2026).
- **A one-day plan** does one set more on the main lifts, at least 3.
- **Core:** holds of 3 x 10 seconds for beginners, 2-3 x 20-30 seconds otherwise, and rep
  entries at 2-3 x 8-12 a side (convention).
- **An older adult** holds stretches 2 x 45 seconds, and does balance work at 2-3 x 20-30
  seconds a side.
- **Light-to-moderate mode** keeps 3 in reserve on every line and uses lean strength's main
  scheme in place of the strength focus.

#### Step 7: conditioning

- **Interval formats, by level** (meta-analysis and review: Gibala and Little; never all-out,
  and never labelled "Tabata"; work at an effort of 7-9 out of 10):

  | Level        | Interval block                                                      |
  | ------------ | ------------------------------------------------------------------- |
  | Beginner     | 6-8 x 30 seconds hard, 60 seconds easy                              |
  | Intermediate | 8 x 40 seconds hard, 20 seconds easy, or 10 x 1 minute and 1 minute |
  | Advanced     | 4 x 4 minutes hard, 3 minutes easy                                  |

- **The hard-session cap.** At most 2 hard sessions a week for beginners, and 3 for anyone
  else, never on consecutive days (convention). A C day or an interval finisher is hard. Once
  the cap is reached, the rest of the week's conditioning is steady, at a pace where the user
  can talk (guideline, the talk test).
- **Steady blocks:** 20-30 minutes on a C day, 15-20 for beginners. An LC day is 45-60
  minutes, 30-40 for beginners. An E day is 20-40 minutes of easy cardio at a pace where the
  user can talk, followed by mobility.
- **Light-to-moderate mode** has no hard sessions.

#### Step 8: write the day

The format is the one the parsers read:

```text
Monday - Full body A
Warmup: 8 minutes - <the day type's warm-up, in RAMP order>.
- Ramp-up: <first main lift> x 8 at about half your working weight, x 4 at about 70%.
Main lifts:
- <exercise>: 3 x 8-10 (Rest 90s, stop 2 reps short of failure)
Accessories:
- <exercise>: 3 x 10-12 (Rest 60-90s, stop 1-2 reps short of failure)
Finisher/conditioning:
- <finisher>
```

- **The warm-up** is general, then specific: ramp-up sets of the first main lift.
  - **How many:** 3 for the strength focus (at about 50%, 70% and 85-90% of working weight), 2
    for lean strength, 1 for fat loss, and none for cardio and mobility.
  - **Sources:** trial (Ribeiro 2021: sets near the working load help; light ones do not) and
    meta-analysis (Fradkin 2010). The ladder is convention.
  - **Static holds in a warm-up** are 30 seconds or less and come before the dynamic work
    (meta-analysis: Kay and Blazevich 2012; Behm 2016).
- **A modified exercise** carries its cue in brackets, for example
  `- Box squat: 3 x 8-10 (Rest 90s, stop 2 reps short of failure; knee: sit back to a box at a
height that stays comfortable)`.
- **A mobility, E or LC day** opens its main lifts with a mobility or cardio entry, so
  `isRestDay` reads it as a training day.

#### Step 9: rest days and the weekly aerobic target

Each track builds to a weekly target of moderate-equivalent aerobic minutes:

- 150 for lean strength, the strength focus, mobility and recovery;
- 200 for cardio;
- 225 for fat loss.

The floor of 150 to 300 moderate minutes a week is guideline (WHO 2020, US 2018). More than 250
minutes is linked to clinically significant weight loss (guideline, ACSM 2009). The track
values themselves are derived.

- **What counts:** steady cardio minutes count once, interval minutes twice, and lifting not
  at all.
- **The gap** left after the week's finishers, C, LC and E days is filled by brisk walks on
  rest days. Each walk is the same length: the gap divided over the rest days, rounded up to 5
  minutes, from 20 to 60.
- **One rest day stays walk-optional** when the others can close the gap within 60 minutes
  each.
- **A walking rest day** reads
  `Rest day. Brisk walk 45 minutes: you can talk but not sing (about 100 steps a minute).`
  (trial and guideline: Tudor-Locke 2018 puts moderate intensity at about 100 steps a minute,
  plus the talk test).
- **An optional one** reads `Rest day. Optional: a 20-minute easy walk.`

Both open with "Rest", so `isRestDay` reads them as rest, and planned versus done does not
count a rest day as planned.

### The coach notes

- **Gemini writes three to five notes on progression, recovery and the stated goal.** The
  message holds the generated plan, which is the app's own text, and the client data, fenced
  as today. The system instruction forbids:
  - diagnosis;
  - naming a condition the user did not state;
  - promising to prevent or treat an injury;
  - pain thresholds;
  - medication advice.

  It asks for a tone about what the user can do. The reasons are regulatory: the FDA's General
  Wellness policy, reissued in January 2026, and the EU's MDCG 2019-11. The nocebo argument
  is opinion only (Cormack and Rossettini 2023).

- **Accepting the answer:** when it finished and has text, the lines are trimmed, a leading
  `Coach Notes:` label and empty lines are dropped, and at most 8 lines of 300 characters are
  kept.
- **Rule-written notes stand in** when there is no key, no client, or the call fails, times
  out, is cut off or comes back empty. `buildFallbackNotes(input, week)`, which is pure, writes:
  - **Progression:** "Add reps first. When every set reaches the top of its range with the reps
    in reserve shown, add about 2-10% load next time, the smaller step for upper-body lifts."
    Beginners add: "Spend the first two weeks learning the movements." (Guideline: ACSM 2009.)
  - **Recovery:** "Aim for at least 7 hours of sleep. If your lifts stall or drop for two weeks
    or more, you feel unusually tired, or your mood or sleep gets worse, take an easier week."
    (Guideline: AASM/SRS on sleep; consensus: Meeusen 2013 on overreaching. The two-week
    threshold is derived.)
  - **The track:** the weekly aerobic target the plan builds to. Fat loss adds: "Most fat loss
    comes from a moderate calorie deficit and your total weekly activity; lifting keeps your
    muscle." (Guideline: ACSM 2009.)
- **The rules always append**, after Gemini's or the fallback notes:
  - **One injury line per area:**
    - **Text:** "Exercises that commonly bother your [area] are swapped for easier versions or
      left out. This is not a rehab programme. Mild discomfort that stays at about 3 out of 10
      or less, settles within a day and does not build from week to week is usually fine. Stop
      an exercise if the pain is sharp, keeps building, changes how you move, or is worse the
      next day, and see a physiotherapist or doctor if it does not settle."
    - **Sources:** painful exercise does no worse than pain-free exercise (meta-analysis, Smith
      2017), and pain can be monitored (trial, Silbernagel 2007, whose ceiling is 5 out of 10).
      The 3 out of 10 band is convention.
    - **Unmapped free text** gets: "We could not adjust this plan for '[text]'."
  - **The referral line,** in light-to-moderate mode.
  - **The pregnancy line,** when that question was yes.
  - **The red-flag line,** on every plan: "Stop and get medical help if you have chest pain or
    pressure, feel faint or dizzy, get breathless out of proportion to the effort, or notice a
    racing or irregular heartbeat." (Guideline: the ACSM 2015 and PAR-Q+ symptom set.)
  - **The general notice,** on every plan: "This plan is general fitness guidance, not medical
    advice. If you have a heart, lung, metabolic or kidney condition, are pregnant, or have
    symptoms like chest pain or fainting, check with a health professional first."
- **The limits change with the job.**
  - `GEMINI_MAX_OUTPUT_TOKENS` defaults to 1,024 and `GEMINI_TIMEOUT_MS` to 8,000.
  - `GEMINI_MAX_PLAN_CHARS` is retired, since the plan text is the app's own.
  - The client's wait drops to 20 seconds.
- **The log says which notes a plan got,** as `generate_notes` with `source: "gemini"` or
  `"rules"` and the reason. The saved plan and the answer are unchanged in shape.

### The route

`/api/generate` keeps its validation, defaults, rate limits, save and prune. Its body schema
gains the optional `health` object. For a signed-in caller it reads `req.user.profile.age`.
It then:

1. builds the plan with `generatePlan`;
2. gets the notes, from Gemini or the rules, and appends the rule lines;
3. appends `Coach Notes:` and the notes to the text;
4. parses the whole with `buildPlanPayload`, so the text and the payload agree by
   construction.

It answers 200 for every valid request. The 500 for a missing key, the 504 and the three 502s
go, with their tests.

### The quality gate

`scripts/evals/__tests__/generatePlan.gate.test.mjs`, in `npm test`, runs two sweeps:

- **The main sweep:**
  - every environment, with each label alone, no label, and all labels;
  - 1 to 7 days, and each injury option;
  - each goal option, and each level.

  That comes to about 12,000 plans.

- **A second sweep:**
  - the focuses;
  - the durations 15, 20, 30, 45, 90 and 180;
  - each screen answer;
  - an age of none, 30 and 70.

  It runs over a smaller equipment set.

Every plan must pass all of these:

- **zero structure breaks and zero equipment hits** by `scorePlan`;
- **zero avoid hits.** `scorePlan`'s injury check changes from `detectInjuryFlags`' substring
  keywords to an avoid-phrase list per area, kept in `scripts/evals/` apart from the library's
  tags and matched as whole words:
  - knee: jump, pistol;
  - lower back and back: barbell deadlift, good morning;
  - shoulder: upright row, behind-the-neck, dip, snatch, jerk;
  - wrist and elbow: dip, skull crusher;
  - hip: pistol, sumo squat;
  - pregnancy: jump, burpee, sprint.

  So the library's names and tags are checked against an independent list;

- **two days or more of lower-body, push and pull work,** for every plan with two or more
  strength days, and no two strength days that train the same muscles on consecutive
  weekdays;
- **at least the floor of exercises on every strength and M day,** supersets included;
- **beginners' strength days within the cap;**
- **the hard-session cap,** with no hard sessions on consecutive days, and none in
  light-to-moderate mode;
- **the weekly aerobic target met,** unless every rest day's walk is already at 60 minutes;
- **squat, hinge, single-leg and core filled** on every FB and L day, whatever the areas;
- **balance work for older adults** on FB, L and M days.

The scorers' table and the library's tags are kept apart on purpose, so the gate catches a
library entry whose name names equipment its tags do not need, or an avoid lift its tags
missed.

`scripts/evals/run.mjs`, its tests, the `plan-evals.yml` workflow, `reference.json` and the root
`@google/genai` devDependency go, and so does the `GEMINI_EVAL_API_KEY` secret's purpose. The
eval profiles stay, as the gate's named cases.

## Roadmap changes

Applied in one republish of the roadmap page after this phase merges:

- **B3** becomes "Rule-based plans, gated": this spec.
- **B5 (Gemini JSON output), D2 (swappable LLM provider) and D5 (on-device AI spike)** are
  dropped, since the plan no longer comes from a model and only its notes use one. M2 no longer
  needs B5.
- **B4 (plans that adapt to your history)** keeps its rules, now as rules in `generatePlan`
  that read the last four weeks, and gains deloads. The proposal is every 5th or 6th week,
  from week 8 for beginners: the same exercises and loads, about half the sets, 3 or more in
  reserve, and never a week off. The sources are a consensus (Bell 2023), a survey (Rogerson 2024) and a trial (Coleman 2024: a week off cost strength), and the interval and size are
  convention.
- **C4 (exercise swaps)** filters on the library's tags and regressions, and drops pgvector.

## PRs

1. The spec, the evidence review and the plan.
2. The injury rules moved to the server, matching whole words, with the client contract test.
3. The exercise library, with its flags, regressions and guarantees, and its tests.
4. `generatePlan` and `buildFallbackNotes`, with the scorer's avoid-phrase check, held to the
   gate.
5. The route switched to the generator, with these parts:
   - Gemini notes with the fallback;
   - the notes prompt;
   - the optional `health` body;
   - the profile's age;
   - the env defaults and `GEMINI_MAX_PLAN_CHARS`;
   - the docs.
6. The planner's health step and the client's 20-second wait.
7. The live eval runner and its workflow retired.
8. The roadmap republish.
9. A floor PR per side, only if a truncated figure rose.

The server reads `health` before the client sends it, and an unknown key is passed through
until then (finding 7).

## Testing

- **The library:**
  - every id is unique, and every field is drawn from its list;
  - every regression exists, has the same pattern, is `ok` for its area, and needs no
    capability the original does not;
  - the `ok` bodyweight beginner entry is there for every area in `squat`, `hinge`,
    `single-leg` and `core`;
  - every entry the avoid table names is `avoid` for that area.
- **The injury rules:** whole-word matching, including the false positives of finding 6; the
  moved tests; the client contract test.
- **The generator,** with the tables above as cases:
  - each weekday pattern and each sequence, including the focus table;
  - the time budget at the durations' edges, and supersets;
  - each choice rule, including a modify replaced by its regression with its cue, and an avoid
    skipped;
  - the rotation;
  - each prescription row, the level, one-day, older-adult and light-to-moderate
    adjustments;
  - the interval formats and the hard-session cap;
  - the walk lengths and the target;
  - the written format.

  Also: the same input gives the same text, and every generated plan parses to the requested
  number of training days by `isRestDay`.

- **The notes:**
  - Gemini's answer accepted and trimmed;
  - each fallback reason;
  - every rule line, and the rule lines kept after Gemini's notes;
  - the log line.
- **The route:**
  - a plan with no key at all;
  - the notes call's config;
  - the `health` body read and not saved;
  - the profile's age used for a signed-in caller and absent for an anonymous one;
  - the saved payload equal to the parse of the answer's text.
- **The gate,** as above.
- **Mutation:** every rule, each mutation confirmed applied.

## Out of scope

- **An E2E test that generates a plan.** Generation will work without a key, so P5 and P6 can
  run end to end; that is its own follow-up.
- **History-aware rules and deloads (B4).**
- **Exercise images or wger links.**
- **The brand line "Personalized AI Training Hub".**
