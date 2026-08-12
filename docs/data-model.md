# Adventures data model

`data/catalog.json` is the canonical public resolver for Alex Ford Adventures. Source files remain separate so provenance is preserved, but public pages must load records through `AdventureCatalog.load()` rather than independently merging JSON files.

`data/public-records.json` is the generated publication snapshot of that resolver. It exists so clean static record pages can be materialized deterministically; it is output, not a second canonical data source. Rebuild it with `npm run build:publish` rather than editing it by hand.

## Core identity

Every public record requires a stable `id`, `kind`, and `name`.

Allowed `kind` values are:

- `summit`
- `race`
- `event`
- `outing`
- `adventure`

A race or event also requires a discipline. The accepted discipline vocabulary currently includes `road`, `marathon`, `trail`, `relay`, `mountain-bike`, `nordic`, `ski-objective`, `mountain-loop`, `trek`, `challenge`, `hike`, `hiking`, and `ski`.

`hike` and `hiking` are both accepted while the historical summit inventory is normalized incrementally. Do not rewrite old source evidence merely to remove that harmless vocabulary difference.

Stable public slugs are generated from canonical records and validated separately so record identity can survive routing changes. Clean record documents are then generated at `/record/<slug>/index.html` from the publication snapshot.

## Dates and geography

Use `date` and optional `endDate` in `YYYY-MM-DD` format. `year` may be retained for legacy records, but when both exist the year must agree with the date.

Coordinates use numeric `lat` and `lon` together. Do not publish only one coordinate. `coordinatePrecision` describes the evidence quality or intentional generalization of that location; it is not a claim of survey-grade geodetic accuracy.

Accepted precision labels currently include:

- GPS-backed: `gps-course`, `gps-area`, `gps-start`;
- venue/event: `venue`, `venue-placeholder`, `event-area`, `event-area-placeholder`, `start-area-placeholder`;
- resort/place: `resort-placeholder`, `city`, `city-placeholder`, `region`, `summit`;
- privacy-aware: `city-privacy`;
- legacy fallback: `unknown`.

Use the most specific label supported by the evidence without publishing unnecessary private location detail.

## Evidence confidence

`matchConfidence` may use `confirmed`, `verified`, `high`, `medium`, `low`, `probable`, or `unknown`.

`probable` is retained for legacy evidence that is stronger than an unknown match but not fully confirmed. Confidence describes the evidence behind the record or match; it should not be upgraded simply to make the archive look cleaner.

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

A repeated ID across source layers is therefore expected provenance behavior, not automatically a data problem. Validation reports the number of layered merges as informational output. If the full layer-by-layer precedence trace is needed, run validation with `VERBOSE_VALIDATION=1`.

A duplicate public event with two different IDs is different from a legitimate layered merge. Race-specific duplicate validation checks shared Strava activity IDs, exact event fingerprints, and fuzzy same-date/location/distance/name candidates so accidental double publication is reviewed explicitly.

`removeIds` are catalog tombstones. A tombstone may remain even when the suppressed ID is not present in the current source set; this keeps stale records from resurfacing if an older provenance layer is restored later.

The current North Star Mountain correction lives in the catalog override rather than page code. The obsolete single-record Snow Mountain Ranch `50K Ranch Hand` entry is removed by the catalog and replaced by the actual two-day 25K + 25K race records.

## Source-to-publication contract

The authoritative direction is one-way:

1. provenance source files and canonical catalog rules;
2. `AdventureCatalog.load()` resolved public records;
3. generated `data/public-records.json` publication snapshot;
4. generated clean static pages and public index files.

Do not correct generated clean pages directly. A fix belongs in canonical data, shared rendering code, or the build system, followed by `npm run build:publish`.

The static publisher materializes top-level clean routes and `/record/<slug>/` pages. `validate:static` verifies that generated pages match the publication contract, while `validate:dependencies` checks local dependencies in the authoritative browser-source layer.

## Validation

A complete local validation pass after changing public data or publication structure is:

```bash
npm run build:publish
npm run validate:data
npm run validate:duplicates
npm run validate:slugs
npm run validate:stories
npm run validate:majors
npm run validate:routing
npm run validate:dependencies
npm run validate:static
```

Validation covers identity, kinds, disciplines, date formats, coordinate pairing/ranges, numeric sanity, relationships, duplicate-race integrity, route provenance, media paths/alt text, ingest state, update policy, stable record routing, source dependencies, and deterministic static publishing.

The validation output intentionally separates three concepts:

- **errors**: broken contracts that fail CI;
- **review warnings**: unusual data that deserves human attention but may still be valid;
- **informational counts**: expected provenance mechanics such as layered merges and tombstones.

The goal is not zero output. It is for any future review warning to be visible enough that it is actually reviewed.

CI adds browser smoke tests, Map route/entity validation, compiled clean-route validation, maintenance-pipeline tests, and generated-artifact drift detection. New public records should pass the relevant validation stack before deployment.
