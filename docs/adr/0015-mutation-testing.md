# 0015. Confirm every mutation applied, and read a survivor before testing it

Accepted. First recorded in `CLAUDE.md` on 2026-09-05 (`f40b5ed`); moved here on 2026-11-02.

## Decision

A mutation run checks that the file changed, not only the exit code. A survivor is first
checked for being an equivalent mutant or a second guard on the same condition, and
fixtures are built from what the form actually stores.

## Background

**When mutation-testing, confirm the mutation applied.** An unapplied mutation and an
uncaught one both read as "tests passed". Check the file changed, not just the exit
code. Five things have silently prevented a match so far: shell escaping eating a
backslash, indentation not matching, an apostrophe in the pattern, **CRLF line
endings**, and a **heredoc collapsing `\\n` to `\n`** even with a quoted delimiter.
Three of those five are the shell, so **write mutation scripts with the Write tool
rather than a heredoc**, and use `String.raw` for any pattern containing a
backslash. The prompt in `generateRoutes.js` is the awkward case: its newlines are
the two characters backslash-n inside a template literal.
**On CRLF:** no committed file is, or ever was, CRLF — no blob in the history
holds a carriage return (checked on 2026-10-17 over every blob
`git rev-list --objects --all` reaches), and `.gitattributes` stores text as LF (`.bat`
and `.cmd` excepted; none are tracked). A working copy can still be CRLF, and git
hides one of the two ways it gets there. A CRLF rewrite that has not been staged
shows as modified, with an empty `git diff`. A file committed while CRLF is stored as LF
but stays CRLF on disk, `git status` calls it clean, and `git checkout -- <file>`
and `git reset --hard` both leave it CRLF, because git skips a file whose stat
still matches the index; delete it and check it out again. So match on `\r?\n`
anyway, and check a file with `git ls-files --eol` (`w/crlf`) or count with
`tr -cd '\r' < file | wc -c`. Not with `grep -c $'\r'`, which is wrong here both
ways: this grep strips carriage returns before matching unless given `-U`, so it
reads 0 on a CRLF file, and inside a `$(…)` this bash drops the carriage return
from `$'\r'`, leaving an empty pattern that matches every line, so it reads the
line count. The second is what put a false CRLF claim in #177's description.
Not every survivor is a weak test either: removing the `!user?.hash` guard in
`verifyPassword` is an equivalent mutant, because `argon2.verify` then throws and the
existing catch returns the same `false`.
Dropping the `ageValue !== null` guard on `useBodyModel`'s age adjustment is another,
and the arithmetic is the proof rather than a run: the guard's else-branch is `0`, and
`clamp((null - 40) / 45, 0, 0.22)` is `clamp(-0.889, 0, 0.22)`, which is also `0`.
A mutant whose two sides you can evaluate on paper does not need a test written for it.

**A score that survives every mutation may be scoring the wrong string.** Five fields in
`useBodyModel` are looked up in lower-case maps, and every value `HomePersonalStage`
stores is the option label verbatim — `"Moderate"`, `"HIIT"`, `"High-protein"`. A single
`toLowerText` joins them, so deleting it would drop all five to their defaults at once,
invisibly. The test suite missed it because the fixtures were written in lower case;
**build fixtures from what the form actually stores**, not from what the lookup expects.

**An unexpected survivor can mean two guards are testing the same thing, not
that the test is weak.** `GeneratedPlanModal.jsx` (since deleted) opened with
`if (!planModalOpen || !result) return null` and then passed
`open={Boolean(planModalOpen && result)}` to `ModalPortal`. Mutating the
early return survived, because with no result the portal rendered nothing
anyway — the two guards are the same condition, so **no test could tell them
apart, which is a proof of duplication rather than a gap**. The fix was to
collapse it: the early return became the only guard and the portal just got
`open`, and the same mutation was then caught. When a survivor looks like a test
gap, check first whether something else is already enforcing the condition.
`ExerciseDetailsModal.jsx` carried the identical pair and got the identical
fix, so **if you add a modal, give it one guard, not two** — the second one
does nothing except make the first untestable.

**A deliberate survivor is how you prove a branch is dead.** `DashboardAtAGlance.jsx`
had two conditions whose arms were the same string — `weatherError ? "Unavailable" :
"Unavailable"`, and the identical thing again for air quality. Deleting each condition
outright was added to the mutation list _expecting_ it to survive, and it did: nothing
observable depends on either test. That is a mechanical proof rather than a reading of
the code, and it costs one run. Reach for it whenever two arms look alike.
Both conditions were later collapsed to the single string they always produced, which
removed the mutations' target. The question they could not answer, whether a failed
lookup should read differently from one that never ran, was then decided: the headline
reads "Couldn't load" when our request failed, "Unavailable" when the browser gave no
position so nothing was requested (the hook's `*ErrorKind`), and "Not checked yet"
before the summary view's first load. The note under each card still carries the error
text.

**A regex for "both arms are the same" needs care.** Sweeping the tree for
this pattern turned up a third hit in
`server/src/services/dashboard/dashboardDataBuildersService.js`, which was a false
positive: the code is
`typeof item === "string" ? item : item?.name`, and a naive arm pattern
stops at the `?.` and reads both arms as `item`. Those two were the only
real instances in the repository.
