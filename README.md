# Personal Adventure Almanac

Interactive map and archive of Alex Ford's mountain summits, endurance races, skiing, and stand-alone adventures. The project began with the Athletic Activities section of [alexlford.com/about](https://www.alexlford.com/about) and has been expanded with a Strava account export, Slopes ski records, historical race results, and user-confirmed corrections.

## Current state

- 19 named summits
- 37 public race-event records currently in the curated archive
- 111 recorded ski days across 29 ski resorts
- 6 featured stand-alone adventures, including DeCaLiBron, West Maroon Pass Traverse, and Ski the Sky Loop
- River to River Relay appearances in 2006, 2008, and 2010
- Search, category filters, responsive mobile map, route-aware zooming, popups, and archive pages for Races, Summits, Skiing, and Adventures

The race inventory is still being reconstructed. User-confirmed races with unresolved dates, including the Disney Princess Half Marathon and Big Ten 10K, are kept in `data/research-candidates.json` until the exact historical record can be recovered.

## Data sources

`data/adventures.json` contains the original summit and race inventory seeded from alexlford.com.

`data/strava-matches.json` contains the original curated Strava match layer. Later discoveries and corrections are stored in supplemental data files rather than rewriting the original import in place.

`data/discovered-races.json`, `data/mined-races.json`, and `data/user-confirmed-races.json` hold race records recovered after the first import.

`data/notable-adventures.json` contains stand-alone objectives and stories that are intentionally separated from ordinary activity history.

`data/skiing.json` contains the ski archive reconciled from Strava and Slopes. Strava is treated as the activity-history backbone; Slopes supplies ski-specific resort, run, vertical, season, and named-trip information.

`data/research-candidates.json` is intentionally not loaded into the public almanac. It holds borderline matches and known events whose dates still need to be recovered.

## Important corrections

North Star Mountain was initially unmatched in the first Strava pass. It was later user-confirmed as the September 12, 2020 Strava activity titled `Quartzville` and is treated as confirmed by the live almanac.

The March 1, 2020 Strava ski outlier was confirmed from a calendar record as Liberty Mountain Resort. The user subsequently added the missing day to Slopes, bringing the reconciled ski-day history to 111 days.

The 2019/20 ski season has three known ski days, but season vertical was not recorded and is intentionally not displayed as zero.

The exact 2020 virtual Chicago Marathon GPS geometry is intentionally **not** committed to the public-map layer because its start/end location may be personally identifying. The public layer uses a city-level Baltimore location instead.

## Map behavior

Skiing is mapped at the resort level rather than with one marker for every ski day. When multiple record types share one coordinate, the marker retains the primary geographic category color (for example, Big Sky remains a ski-resort marker even though Ski the Sky Loop is also attached there) while the popup can contain multiple records.

Recorded GPS routes are displayed where they add useful context and can be published without unnecessary privacy exposure.

## Run locally

Because the page loads JSON with `fetch`, serve the directory rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy

This is a build-free static site hosted through GitHub Pages and designed to be integrated with alexlford.com.

## Audit priorities

1. Continue mining the full Strava archive for user-confirmed but undated races, especially the Disney Princess Half Marathon and Big Ten 10K.
2. Recover additional historical race results and official times where reliable records survive.
3. Continue checking race/adventure classification and cross-page consistency.
4. Add privacy-conscious GPS geometry for additional races, hikes, and ski objectives where useful.
5. Add photos and short personal memories to selected almanac entries without turning the site into a raw activity feed.

## Source notes

The original activity names, years, and listed summit elevations were taken from alexlford.com/about as checked on 2026-08-10. Subsequent corrections and additions come from the supplied Strava export, Slopes screenshots, calendar evidence, historical race results, and direct user confirmation.
