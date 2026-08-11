# Adventures data model

`data/catalog.json` is the canonical public resolver for Alex Ford Adventures. Source files remain separate so provenance is preserved, but public pages must load records through `AdventureCatalog.load()` rather than independently merging JSON files.

## Core identity

Every public record requires a stable `id`, `kind`, and `name`.

Allowed `kind` values are:

- `summit`
- `race`
- `event`
- `outing`
- `adventure`

A race or event also requires a discipline. The canonical discipline vocabulary currently includes `road`, `marathon`, `trail`, `relay`, `mountain-bike`, `nordic`, `ski-objective`, `mountain-loop`, `trek`, `challenge`, `hike`, and `ski`.

Stable public slugs are generated from canonical records and validated separately so record identity can survive routing changes.

## Dates and geography

Use `date` and optional `endDate` in `YYYY-MM-DD` format. `year` may be retained for legacy records, but when both exist the year must agree with the date.

Coordinates use numeric `lat` and `lon` together. Do not publish only one coordinate. `coordinatePrecision` describes whether the coordinate is GPS-backed, a venue, a city, a region, or another intentionally generalized location.

## Activity metrics

Common optional metrics are `distanceKm`, `distanceMi`, `elapsedSeconds`, `movingSeconds`, `elevationGainM`, and for summits `elevationFt`. Sport-specific fields such as ski runs, descent, official race result fields, or day-level MTB mode may be added when they have a clear meaning.

Missing data must remain missing. Do not convert unknown metrics to zero.

For lift-served Downhill MTB, apparent ascent from the GPS track must not be presented as pedaled climbing.

## Relationships and Stories

`data/relationships.json` connects recurring series, challenge weekends, and component records. A Story can also use fields such as `linkedSummits` or `companions` when they describe the documented structure of the Adventure.

Editorial Story rendering adapts to the record rather than storing duplicate page-specific content:

- mountain loops can expose a linked summit chain;
- traverses emphasize documented span, distance, and gain;
- ski objectives emphasize runs, distance, and descent;
- challenge/weekend Stories expose their component records.

Personal narrative should only be published when explicitly supplied. The renderer must not invent recollections to make a record feel more editorial.

## Media

Published media belongs on the canonical record as a `media` array. Each image requires a valid source and meaningful alt text. Local repository-owned assets are preferred.

A pending image may be tracked separately while the source asset is being prepared, but pending media does not render publicly. Once the asset exists, promote it into `media` so the shared photo-essay and Stories-cover components can use it automatically.

## Routes and provenance

Route features reference public record IDs through `properties.adventureIds`.

Recorded GPS, historical courses, generalized locations, and privacy-withheld routes remain distinct provenance states. Source-specific metadata such as `stravaActivityId`, `stravaActivityName`, `resultUrl`, `matchSource`, and `matchConfidence` may remain in the data model for auditability. Public pages should not expose internal verification terminology unless it is editorially useful.

## Catalog precedence

`data/catalog.json` defines source order. Later sources override earlier fields for the same ID. The Strava match layer is applied after source merging. Catalog `removeIds` suppress stale legacy records, and catalog `overrides` applies authoritative corrections last.

The current North Star Mountain correction lives in the catalog override rather than page code. The obsolete single-record Snow Mountain Ranch `50K Ranch Hand` entry is removed by the catalog and replaced by the actual two-day 25K + 25K race records.

## Validation

Run:

```bash
npm run validate:data
npm run validate:routing
```

Validation covers identity, kinds, disciplines, date formats, coordinate pairing/ranges, numeric sanity, relationships, route provenance, media paths/alt text, ingest state, update policy, and stable record routing.

New public records should pass validation before deployment.
