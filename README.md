# Personal Adventure Almanac

Interactive map and archive of Alex Ford's mountain summits, endurance races, skiing, and stand-alone adventures. The project began with the Athletic Activities section of [alexlford.com/about](https://www.alexlford.com/about) and has been expanded with a Strava account export, Slopes ski records, historical race results, and user-confirmed corrections.

## Current state

- 19 named summits
- A growing curated race archive spanning road, trail, marathon, relay, Nordic, and mountain-bike events
- 111 recorded ski days across 29 ski resorts
- Featured stand-alone adventures including DeCaLiBron, West Maroon Pass Traverse, Ski the Sky Loop, Ranch Hand, and Royal Gorge Groove Run + Ride
- River to River Relay appearances in 2006, 2008, and 2010, with the historical full relay course mapped
- Search, category filters, responsive mobile map, route-aware zooming, popups, and archive pages for Races, Summits, Skiing, and Adventures

The race inventory is still being reconstructed. Borderline matches remain in `data/research-candidates.json` and are intentionally excluded from the public catalog until the evidence is strong enough.

## Phase 1: canonical data architecture

`data/catalog.json` is now the canonical public resolver. Public pages should not independently decide which JSON files win, which records are removed, or which corrections apply.

`catalog.js` loads the source files in manifest order, merges records by stable ID, applies the Strava match layer, removes stale legacy IDs, applies authoritative corrections, validates the resulting catalog, and returns the same public event set to every page.

This keeps provenance intact while preventing the Overview, Map, Races, Summits, Adventures, and detail pages from drifting apart.

See `docs/data-model.md` for the event schema and precedence rules.

## Data sources

`data/adventures.json` contains the original summit and race inventory seeded from alexlford.com.

`data/strava-matches.json` contains the original curated Strava match layer.

`data/discovered-races.json`, `data/mined-races.json`, `data/user-confirmed-races.json`, and `data/recovered-events-2026-08.json` contain race records recovered through later audit work.

`data/notable-adventures.json` contains stand-alone objectives and stories that are intentionally separated from ordinary activity history.

`data/skiing.json` contains the ski archive reconciled from Strava and Slopes. Strava is treated as the activity-history backbone; Slopes supplies ski-specific resort, run, vertical, season, and named-trip information.

`data/research-candidates.json` is intentionally not loaded into the public almanac. It holds borderline matches and known events that still need stronger evidence.

## Important corrections

North Star Mountain was initially unmatched in the first Strava pass. It was later user-confirmed as the September 12, 2020 Strava activity titled `Quartzville`. That correction now lives in `data/catalog.json`, not in page-specific JavaScript.

The old single `SMR Stampede 50k Ranch Hand` seed record is suppressed by the catalog and replaced by the actual March 12–13, 2022 Snow Mountain Ranch 25K freestyle + 25K classic records.

The March 1, 2020 Strava ski outlier was confirmed from a calendar record as Liberty Mountain Resort. The user subsequently added the missing day to Slopes, bringing the reconciled ski-day history to 111 days.

The 2019/20 ski season has three known ski days, but season vertical was not recorded and is intentionally not displayed as zero.

The exact 2020 virtual Chicago Marathon GPS geometry is intentionally **not** committed to the public-map layer because its start/end location may be personally identifying.

## Validation

Run:

```bash
npm run validate:data
```

The validator checks identity fields, event kinds and disciplines, date formatting, coordinate pairing/ranges, numeric sanity, year/date consistency, route references, and suspicious classifications.

## Map behavior

Skiing is mapped at the resort level rather than with one marker for every ski day. When multiple record types share one coordinate, the marker retains the primary geographic category color while the popup can contain multiple records.

Recorded GPS and historical routes are displayed where they add useful context and can be published without unnecessary privacy exposure.

## Run locally

Because the page loads JSON with `fetch`, serve the directory rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

This is a build-free static site hosted through GitHub Pages and designed to be integrated with alexlford.com.

## Next Phase 1 implementations

1. Migrate remaining legacy corrections/removals out of source-specific files and into the canonical model where appropriate.
2. Add automated validation to the GitHub deployment workflow so bad records cannot publish silently.
3. Audit all route references and classify route provenance consistently as personal GPS, historical course, or generalized location.
4. Normalize series/challenge relationships so River to River, Heartland 39.3, Illinois I-Challenge, Ranch Hand, and Royal Gorge are represented structurally rather than only in page copy.
5. Continue mining the full Strava archive only after each recovered record can enter the canonical catalog cleanly.

## Source notes

The original activity names, years, and listed summit elevations were taken from alexlford.com/about as checked on 2026-08-10. Subsequent corrections and additions come from the supplied Strava export, Slopes screenshots, calendar evidence, historical race results, and direct user confirmation.
