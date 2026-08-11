# Almanac data model

Phase 1 establishes `data/catalog.json` as the canonical public resolver for event records. Source files remain separate so provenance is preserved, but public pages must load records through `AdventureCatalog.load()` rather than independently merging JSON files.

## Core identity

Every public event requires a stable `id`, `kind`, and `name`.

Allowed `kind` values are:

- `summit`
- `race`
- `adventure`

A race also requires a `discipline`. Current public disciplines include `marathon`, `road`, `trail`, `mountain-bike`, `relay`, and `nordic`.

## Dates and geography

Use `date` and optional `endDate` in `YYYY-MM-DD` format. `year` may be retained for legacy records, but when both exist the year must agree with the date.

Coordinates use numeric `lat` and `lon` together. Do not publish only one coordinate. `coordinatePrecision` describes whether the coordinate is a summit, GPS point, event area, venue placeholder, city placeholder, or another intentionally generalized location.

## Activity metrics

Common optional metrics are `distanceKm`, `distanceMi`, `elapsedSeconds`, `movingSeconds`, `elevationGainM`, and for summits `elevationFt`. Sport-specific fields such as ski runs or descent may be added when they have a clear meaning.

Missing data must remain missing. Do not convert unknown metrics to zero.

## Relationships

`eventSeries` identifies recurring or multi-event race series. Editorial adventures may use linked IDs where needed to connect a story to summits or component events.

Route features reference public event IDs through `properties.adventureIds`.

## Provenance

Source-specific metadata such as `stravaActivityId`, `stravaActivityName`, `resultUrl`, `matchSource`, and `matchConfidence` may remain in the data model for auditability. Public pages should not expose internal verification terminology unless it is editorially useful.

## Catalog precedence

`data/catalog.json` defines source order. Later sources override earlier fields for the same ID. The Strava match layer is applied after source merging. Catalog `removeIds` suppress stale legacy records, and catalog `overrides` applies authoritative corrections last.

The current North Star Mountain correction lives in the catalog override rather than in page code. The obsolete single-record Snow Mountain Ranch `50K Ranch Hand` entry is removed by the catalog and replaced by the actual two-day 25K + 25K race records.

## Validation

Run:

```bash
npm run validate:data
```

The validator checks required identity fields, kinds, race disciplines, date formats, coordinate pairing/ranges, numeric sanity, year/date mismatches, route references, and suspicious classification patterns.

New public records should pass validation before deployment.
