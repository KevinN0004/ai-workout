# Decision records

Why the rules in [`CLAUDE.md`](../CLAUDE.md) are what they are. `CLAUDE.md` keeps each rule
in a few lines and points here; a record holds the reasoning, the measurements and the
history behind one decision.

**Records are kept current, unlike plans and specs.** The PR that changes a fact a record
states updates the record, as `CLAUDE.md` used to be updated. A reversed decision gets a
new record, and the old one is marked superseded rather than rewritten.

To add one, take the next number, name the file `NNNN-name.md`, open it with
`# NNNN. Title` and a status line, and add it to the table below.
`scripts/__tests__/repo-invariants.test.mjs` fails when a record is missing from the table,
listed twice or out of order, or when a path that names a record does not exist.

A record whose status line says it was moved here from `CLAUDE.md` kept that file's
wording. Only references to other places in `CLAUDE.md`, and one miscount, were changed.

| Record                                          | Decision                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| [0001](0001-absent-is-not-zero.md)              | Guard absent input before converting it to a number                                    |
| [0002](0002-us-aqi-from-the-nowcast.md)         | Score the US AQI as the EPA NowCast of hourly PM2.5                                    |
| [0003](0003-picking-the-openaq-station.md)      | Pick the nearest OpenAQ station with a fresh PM2.5 reading, and cache the list trimmed |
| [0004](0004-file-length-is-a-smell.md)          | Split a file for a second reason to change, not for its length                         |
| [0005](0005-testing-across-the-wire.md)         | Test across the wire with contract tests and a small E2E suite                         |
| [0006](0006-accessibility-by-axe.md)            | Judge accessibility with axe on rendered pages, not with the linter                    |
| [0007](0007-reduced-motion-where-it-moves.md)   | Stop each motion where it is defined, not with a global reset                          |
| [0008](0008-knip-and-dead-code.md)              | Keep knip clean through its config, and measure the bundle before claiming a saving    |
| [0009](0009-compose-on-loopback.md)             | Publish the compose ports on 127.0.0.1                                                 |
| [0010](0010-coverage-floors.md)                 | Ratchet the coverage floors from exact measurements, once per phase                    |
| [0011](0011-tests-control-their-environment.md) | Tests control their own clock, zone and environment                                    |
| [0012](0012-coverage-gaps.md)                   | Check that an uncovered arm can fire before testing it                                 |
| [0013](0013-test-boundaries.md)                 | Stub layout, randomness and library calls as boundaries                                |
| [0014](0014-what-to-test.md)                    | Choose what to test by what it computes and what it risks                              |
| [0015](0015-mutation-testing.md)                | Confirm every mutation applied, and read a survivor before testing it                  |
| [0016](0016-formatter-exclusions.md)            | Retire a formatter exclusion with a guard                                              |
