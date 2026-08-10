# Adventure Map

Interactive map of Alex Ford's mountain summits and endurance races, seeded from the Athletic Activities section of [alexlford.com/about](https://www.alexlford.com/about).

## What is in v0.1

- 19 summits currently listed on alexlford.com
- 8 marathon entries, including the 2020 virtual Chicago Marathon
- River to River Relay entries for 2006, 2008, and 2010
- Free State Tri 100 Relay (2015)
- SMR Stampede 50k Ranch Hand (2022)
- Stagecoach Classic 15k (2024)
- Interactive Leaflet map with filters, search, responsive layout, popups, and a list view
- Canonical-name aliases for Mount Evans / Mount Blue Sky and Clingmans Dome / Kuwohi

## Data philosophy

`data/adventures.json` is the canonical dataset. The UI should be able to evolve without rewriting the underlying adventure history.

Summit records use summit coordinates. Race records initially use a venue or host-city placeholder so the map is useful immediately. The `coordinatePrecision` and `routeStatus` fields are explicit about what still needs to be upgraded.

The 2020 virtual Chicago Marathon is intentionally left unmapped until the actual location is identified.

## Run locally

Because the page loads JSON with `fetch`, serve the directory rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

This is a build-free static site. It can be hosted directly with GitHub Pages or embedded/integrated into alexlford.com.

## Next data upgrades

1. Add exact race dates and finish times.
2. Replace race placeholder pins with GPX/GeoJSON course lines.
3. Add summit hike GPX routes where available.
4. Add summit dates / ascent history.
5. Add personal photos and short memory/story text.
6. Identify the actual location of the 2020 virtual Chicago Marathon.
7. Add personal-best badges and race-result source links.

## Source notes

Initial activity names, years, and listed elevations come from alexlford.com/about as checked on 2026-08-10. Some peak elevations have since been revised by modern surveys; this first dataset preserves the values currently displayed on the personal website so the migration is lossless.
