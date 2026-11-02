# 0002. Score the US AQI as the EPA NowCast of hourly PM2.5

Accepted. First recorded in `CLAUDE.md` on 2026-10-25 (`2fd0cb6`); moved here on 2026-11-02.

## Decision

The air-quality route scores the US AQI from the station's last twelve hourly PM2.5 means
with the EPA's NowCast (`pm25NowCast` in `externalDataService.js`), not from its latest
reading. An absent hour is a missing hour, never a 0, and too few hours gives "Unknown".

## Background

**The US AQI is the EPA NowCast of the station's PM2.5 hourly means, not its latest
reading.** The air-quality route makes a third OpenAQ call, `sensors/<id>/hours`, and
`pm25NowCast` in `externalDataService.js` scores the last twelve hours to the EPA's method
(weight min / max floored at 0.5, two of the three newest hours present, truncated to
0.1 ug/m3), checked against AirNow's and the EPA sample's worked examples. Hour 0 is the
newest hour the station reported, used only if it ended within four hours. An hour whose
value is `null`, `""`, missing, non-numeric or negative is a **missing** hour: it neither
counts towards two of three nor pulls the mean towards 0. Too few hours, a stale station
or a failed hourly call gives `aqiUs: null` and "Unknown", as no PM2.5 sensor does;
`summary.pm25` is still the latest reading and `summary.pm25NowCast` the scored one.
