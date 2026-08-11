# Adventures publication pipeline

Alex Ford Adventures keeps two deliberately separate data layers:

1. **Source and provenance data** in `data/` preserves the individual recovery, confirmation, official-result, Strava, relationship, route, and evidence layers used to reconstruct the archive.
2. **Publication data** is a deterministic compiled view intended for the browser. It contains only the resolved records, route geometry, and Map entities needed to render the public site efficiently.

The source layer remains authoritative. Compiled files are disposable build products and must never become the place where a record is manually corrected.

## Compile the public bundle

Run:

```bash
npm run build:public-data
```

The default output directory is `dist/data`. A different directory can be supplied for CI or preview work:

```bash
npm run build:public-data -- --out-dir .ci-public-data
```

The compiler produces:

- `public-records.json` — source layers, Strava match data, removals, and explicit catalog overrides merged into one resolved record collection;
- `public-routes.geojson` — all canonical route files plus encoded activity polylines merged into one GeoJSON `FeatureCollection` with route overrides and declared endpoint repairs applied;
- `public-map-entities.json` — location-only Map entities that are useful to the public map but are not canonical Adventure records, currently alpine ski resorts.

Each artifact includes a deterministic source fingerprint. The fingerprint changes when an input changes, but identical source data produces identical output.

## Route repairs

Raw imported GPS/polyline evidence is not silently rewritten. If imported geometry contains a known incomplete segment, the correction belongs in `data/route-catalog.json` under `polylineRepairs` with an explanatory note. The public compiler applies that declared repair while preserving the raw source file.

`npm run validate:map-data` verifies that every declared repair is still necessary, references a real route/line, and produces valid coordinates. A stale repair is a validation error.

## Browser contract

`AdventureCatalog.loadCompiled(path)` and `AdventureRoutes.loadCompiled(path)` provide browser consumers for compiled data without changing the current production loader.

CI compiles the public bundle from the pull request's merged test state and then runs a Playwright contract test that compares:

- source-resolved record IDs against compiled record IDs;
- source-resolved route feature identities against compiled route feature identities;
- compiled Map entity metadata against the emitted entity rows.

This allows the publication format to be proven before GitHub Pages is switched from the source-heavy runtime to a build-generated deployment.

## Rules

- Never hand-edit compiled public data.
- Never delete provenance files simply because their values have been compiled.
- Make corrections in the appropriate canonical source, evidence, match, override, relationship, or route-catalog layer.
- Run validation before publication.
- Keep compiled output deterministic so CI can detect unintended changes.
- Do not switch production to compiled data until the compiled/source browser contract is green.
