# Adventure Map

Interactive map of Alex Ford's mountain summits and endurance races, seeded from the Athletic Activities section of [alexlford.com/about](https://www.alexlford.com/about) and enriched with a Strava account export.

## Current state

- 19 summits listed on alexlford.com
- 8 marathons
- River to River Relay entries for 2006, 2008, and 2010
- Free State Tri 100 Relay (2015)
- SMR Stampede 50k Ranch Hand (2022)
- Stagecoach Classic 15k (2024)
- 29 existing adventure records matched to Strava metadata
- 25 GPS route features covering 28 adventures (some summit outings cover multiple peaks)
- Search, category filters, responsive layout, route-aware zooming, popups, and list view

## Strava matching

`data/strava-matches.json` contains the curated match layer from the Strava export. It adds dates, recorded distances, elapsed and moving time, elevation gain, GPS-derived race locations, and route references without overwriting the canonical website inventory in `data/adventures.json`.

`data/routes.geojson` contains simplified GPS geometry for matched races and climbs. Route geometry is simplified to web-map fidelity to keep the static site fast.

### Match coverage

The Strava export confidently matches 18 of the 19 listed summits. North Star Mountain remains unmatched because no recorded activity approached the summit closely enough for a confident association.

The export resolves all eight marathon dates and locations. The 2020 virtual Chicago Marathon was run in Baltimore, Maryland on October 7, 2020.

The exact 2020 virtual-marathon GPS geometry is intentionally **not** committed to this public-map layer because its start/end location may be personally identifying. The map uses a city-level Baltimore location instead.

The three River to River Relay entries (2006, 2008, 2010) predate the GPS activity history contained in this export, so they remain location-only records.

The Free State Tri 100 Relay is matched to the June 7, 2015 Strava run at Clinton Lake. Strava contains Alex's recorded run leg, not the complete relay course.

The 2022 SMR Stampede Ranch Hand is represented by the two consecutive ~25K Nordic activities on March 12 and March 13, totaling approximately 50.7 km.

## Data model

- `data/adventures.json` — canonical adventure inventory from alexlford.com
- `data/strava-matches.json` — Strava-derived metadata keyed by adventure ID
- `data/routes.geojson` — GPS course/climb geometry keyed back to adventure IDs

This separation keeps the personal-history inventory independent from any single tracking service and makes future imports from Garmin, Nike Run Club, or other sources straightforward.

## Run locally

Because the page loads JSON with `fetch`, serve the directory rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

This is a build-free static site. It can be hosted directly with GitHub Pages or integrated into alexlford.com.

## Next upgrades

1. Review Strava-discovered races that are not yet listed on alexlford.com and decide which belong on the map.
2. Add personal photos and short story/memory text to selected adventures.
3. Add official result links and official finish times where available.
4. Resolve North Star Mountain from another GPS source or manual date/route input.
5. Add historical River to River course geometry from public race-course data.
6. Consider an optional privacy-trimmed representation of the 2020 virtual marathon.

## Source notes

The canonical activity names, years, and listed summit elevations were taken from alexlford.com/about as checked on 2026-08-10. Strava matching was performed from the account export supplied on 2026-08-10 using activity dates, types, distances, GPS geometry, and proximity to known summit coordinates.
