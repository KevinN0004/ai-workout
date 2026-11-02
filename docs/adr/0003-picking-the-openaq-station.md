# 0003. Pick the nearest OpenAQ station with a fresh PM2.5 reading, and cache the list trimmed

Accepted. First recorded in `CLAUDE.md` on 2026-10-26 (`e4f6d49`); moved here on 2026-11-02.

## Decision

The route asks OpenAQ for PM2.5 stations only, ranks the fresh ones nearest first
(`rankFreshPm25Stations`), and reads the first of at most three whose PM2.5 reading is
itself fresh. Absent is stale. The station page is cached trimmed to the nearest ten
stations and the fields the route reads (`projectOpenAqStations`), which bounds an entry at
about 6 KB.

## Background

**OpenAQ's first station is not the nearest, and is often dead.** `/v3/locations` lists
stations in id order (`order_by` accepts only `id`) and keeps ones that stopped reporting
years ago: on 2026-10-27 its first PM2.5 station was 23.5 hours stale in New York, last
heard in 2017 in Los Angeles and in 2023 in London, beside stations reporting within
hours. The list was also cut short: `meta.found` read `">100"` for Los Angeles and London
at a limit of 100. So the route asks for PM2.5 stations only (`parameters_id: 2`, the id
seen live in all three cities) in one page of 1,000, the most OpenAQ's pagination docs
allow, and logs `openaq_locations_truncated` when `openAqResultsTruncated` says even that
was cut short. `rankFreshPm25Stations` keeps the stations with a PM2.5 sensor whose
`datetimeLast` is fresh and ranks them nearest first: OpenAQ's `distance` (metres, filled
in live) when it is a number of 0 or more, else haversine from `coordinates`; a `null`
distance or position is unknown, never 0 metres, and sorts last. **That page is cached
trimmed** (`projectOpenAqStations`, passed to `openAqRequest` as `project`): untrimmed it
ran to 383,705 bytes for Los Angeles, cached per requested point for up to 500 entries,
about 192 MB, enough to exhaust a 512 MB instance. It keeps only the **nearest ten**
stations the route could read (`CACHED_STATION_LIMIT`), ranked from the point asked for by
`rankFreshPm25Stations` itself, and only the fields read, copied as they came, so absent
stays absent. **Filtering alone was not a bound, and the first estimate was wrong:** 19.5
MB assumed LA's 61 fresh of 287 (2026-10-27), but freshness varies by the hour, and on
2026-10-29 206 were fresh, 139,519 bytes cached, about 70 MB at 500 entries. Capped, an
entry is about 6 KB however many are fresh (5,951 B measured for an LA-like list with 206
fresh), about 3 MB at 500. The route walks at most three; the other seven cover stations
going stale while a stale copy is served in an outage. `meta.returned` keeps OpenAQ's raw
count, which the 404 and the truncation check read through `openAqReturnedCount`; an
entry cached before has none, and its length stands in. The route re-ranks at read time,
so a cached copy, capped or a longer one from before, answers the same, and it can miss a
station that revived since the fetch (within the TTL, or while a stale copy is served in
an outage) but never offers a dead one.

**A fresh station is not a fresh PM2.5 reading.** `datetimeLast` covers every sensor: live,
London's nearest fresh station (154 Marylebone Road, 2.2 h) had a PM2.5 reading dated
2026-09-10, so the hours came back empty. The route therefore walks the ranked list, asks
`/latest` of at most three, and reads the first whose PM2.5 reading's own `datetime.utc` is
fresh. Both checks go through `isFreshReading`, within the same four hours
(`NOWCAST_MAX_AGE_HOURS`, shared with hour 0), and **absent is stale**: a missing, `null`
or unparseable time never counts as fresh. A failed `/latest` is a miss and the walk goes
on; if every one asked failed, nothing said the stations were stale, so the outage
handling answers as before. Otherwise no fresh reading means "Unknown" with no hours call
and no station named. Three keeps a lookup to five calls, inside OpenAQ's 60 a minute.
