# Narrative audit — 2026-08-28

This audit captures the personal race narratives added or completed on August 28, 2026 and the regression coverage that protects them.

## 2014–2018 archive memories

- `garmin-half-2014` — first half marathon; sub-two-hour goal; pride in the accomplishment.
- `abes-amble-2014` — ran the full 10K with Mom and Aunt Mary Kay through the Illinois State Fairgrounds.
- `pi-miler-2015` — first day of trail running; 3rd place in the 3.14-mile race.
- `pi-day-half-2015` — first trail half on the same day; discovered how much trail racing was enjoyable.
- `illinois-5k-2015` — shakeout before the first marathon.
- `illinois-marathon-2015` — first marathon; thunderstorm and police directing runners to shelter; kept going and finished; Mom ran her first half the same weekend.
- `heartland-39-3-2016` — three half marathons in five weeks; strong Rock the Parkway opener changed expectations; Garmin PR; Illinois 5K PR during the same spring; Running With the Cows nearly matched the half PR; pride in racing well and often.
- `big-ten-10k-2016` — very fun race along Lake Michigan in Chicago.
- `disney-princess-half-2018` — ran Abby's first half marathon with her during the weekend Alex turned 30.

## 2016 spring race chapters

- `rock-parkway-half-2016` — unexpectedly strong Heartland opener and motivation to race faster.
- `garmin-half-2016` — 1:43:16 half-marathon PR one week later.
- `illinois-5k-2016` — 21:02 official 5K race PR.
- `illinois-half-2016` — beautiful spring day in the Midwest, the morning after the 5K PR.
- `running-with-cows-half-2016` — Heartland finale in 1:43:29.6, nearly matching the Garmin PR.

## Turkey Trots

- `st-louis-turkey-trot-8k-2018` — unexpected Thanksgiving reunion in Tower Grove Park; Leah Forsberg and Chris, Lindsey Forsberg and Mike, Abby with Lauren and Nick, and Mom.
- `gobble-cobble-2019` — cold but exciting Thanksgiving morning around Baltimore's Inner Harbor.
- `baltimore-virtual-turkey-trot-2020` — intentionally brief virtual edition grounded in the Thanksgiving Day Strava activity.
- `mile-high-turkey-trot-2021` — sunny Washington Park race with wife and Mom; ran well; fun family morning.
- `mile-high-turkey-trot-2023` — Washington Park with Olive; arrived late and ran from the distant parking spot to the start, making the total outing longer than the nominal race.
- `springfield-turkey-trot-2024` — fun Thanksgiving morning with Olive through the University of Illinois Springfield campus; source activity preserved as a walk.
- `mile-high-turkey-trot-2025` — great Thanksgiving day with Olive at Washington Park.
- `mile-high-united-way-turkey-trot-series` — the unified Turkey Trots Story connecting seven Thanksgiving editions across St. Louis, Baltimore, Denver, and Springfield.

## Verification

`tests/narratives-2026-08-28.spec.mjs` verifies every item above has a narrative source, maps to a public record, and renders its specific personal story text in the browser. Existing focused tests continue to verify the 2016 canonical race wiring and the Turkey Trot pages independently.
