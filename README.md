# Alex Ford Adventures

Interactive personal outdoor-history website for Alex Ford, published at **adventures.alexlford.com**. The project began with the Athletic Activities section of alexlford.com and now brings together races, summits, alpine skiing, Nordic skiing, mountain biking, routes, and curated stories in one structured site.

## Public site flow

The information architecture is intentionally simple:

- **Home** — a minimal front door with three ways into the site and one current pursuit
- **Explore** — hub for Races, Summits, Skiing, Nordic, MTB, and the full Timeline
- **Map** — geographic view with seven public layers: MTB, Nordic, Road Races, Trail Races, Skiing, Summits, and Adventures
- **Stories** — curated editorial chapters for objectives and efforts that deserve a larger narrative

Individual records use the canonical catalog and route system rather than page-specific copies of the data.

## Current archive

The archive includes named summits, a reconstructed race history, day-level MTB and Nordic outings, a Slopes/Strava-backed ski history, World Marathon Majors progress, and stories such as DeCaLiBron, West Maroon Pass Traverse, Ski the Sky Loop, Ranch Hand, and Royal Gorge Groove Run + Ride.

The initial Strava baseline contains **3,371 activities** through the August 10, 2026 export. Most ordinary training activities are intentionally not public records.

## Canonical data architecture

`data/catalog.json` is the canonical public resolver. Public pages should not independently decide which source wins, which record is removed, or which correction applies.

`catalog.js` loads source files in manifest order, merges records by stable ID, applies the Strava match layer, removes stale legacy IDs, applies authoritative corrections, validates the result, and returns the same public record set to every page.

Key supporting layers include:

- `data/relationships.json` — series, challenge, weekend, and multi-record relationships
- `data/route-catalog.json` — route provenance and record/route overrides
- `data/activity-days.json` — day-level MTB and Nordic outings
- `data/skiing.json` — ski seasons, resorts, trips, and ski-specific metadata
- `data/world-majors.json` — evolving World Marathon Majors journey, with completed, registered, future, and candidate status kept distinct
- `data/research-candidates.json` — borderline historical matches excluded from the public catalog

See `docs/data-model.md` for schema and precedence details.

## Keeping Adventures current

The site is designed to update incrementally as new activities accumulate.

### 1. Scan a fresh Strava export

```bash
npm run scan:strava -- /path/to/export.zip
```

This generates `tmp/update-queue.json` from activities newer than the last fully reviewed Strava snapshot in `data/ingest-state.json`.

The queue is **review-only**. It never publishes records automatically.

### 2. Curate the new activity delta

The policy in `data/update-policy.json` keeps the site from becoming an activity feed:

- ordinary training runs stay private unless they are races or become curated stories;
- generic cycling is reviewed before deciding whether it belongs in the MTB chapter;
- MTB and Nordic can enter day-level outing history;
- alpine skiing updates the ski history, with Slopes supplying runs, vertical, resort, and trip context where available;
- organized races, named events, and Adventures are promoted into richer records;
- routes are published only after provenance and privacy treatment are resolved.

### 3. Validate and advance the reviewed snapshot

After the new snapshot is fully reviewed and any public records/routes are updated:

```bash
npm run validate:data
npm run advance:strava -- tmp/update-queue.json --confirm-reviewed
npm run validate:data
```

The ingest state stores a timestamp watermark and one-way activity-ID hashes only for activities sharing the exact watermark time. It does not expose the IDs of ordinary historical training activities.

For the full workflow, including historical backfills, ski screenshots, Stories, and editorial media, see `docs/updating-adventures.md`.

## Validation and CI

Run:

```bash
npm run validate:data
npm run validate:routing
npm run test:update-pipeline
```

CI checks the canonical catalog, relationships, route provenance, ingest state, update policy, editorial media metadata/local asset paths, production routing, public branding, Python maintenance tooling, the update-pipeline smoke test, and generated sitemap/robots files.

## Important archive rules

- North Star Mountain is matched to the September 12, 2020 Strava activity `Quartzville` through a canonical override.
- The stale single `SMR Stampede 50k Ranch Hand` record is suppressed and replaced by the actual March 12–13, 2022 25K freestyle and 25K classic races.
- Frisco BrewSki is a named Nordic event, not a race.
- West Maroon Pass Traverse is an Adventure/trek, not a road race.
- Royal Gorge Groove MTB remains an individual race even though the combined Run + Ride weekend can be a larger story.
- The 2019/20 ski season has three known ski days, but season vertical was not recorded and is intentionally not shown as zero.
- The exact 2020 virtual Chicago Marathon route is privacy-withheld.
- MTB riding style belongs to the individual outing, not permanently to the venue.

## Editorial Stories

Stories share a common magazine system but adapt to the documented structure of the objective:

- mountain loops can show a linked summit chain and route scale;
- traverses emphasize multi-day span, distance, and gain;
- ski objectives emphasize runs, distance, and descent;
- challenges/weekends show their component records in sequence.

The Story layer stays factual unless personal narrative has been explicitly supplied. It should not invent recollections merely to make a page feel more editorial.

Photo essays are optional and render only when genuine record media exists. Local repository-owned images with meaningful alt text are preferred; media entries are validated in CI.

## World Marathon Majors

The Majors feature is deliberately data-driven rather than branded as a fixed “seven-star” pursuit. `data/world-majors.json` currently tracks the seven 2026 Majors, Cape Town as the confirmed eighth Major beginning in 2027, and Shanghai separately as a candidate pending its next assessment.

Completed and registered races remain separate so future start lines never inflate completed-race totals. The long-term design is a passport-style journey in which each completed Major can accumulate its result, course, photos, and story.

## Map and route behavior

Recorded GPS, historical courses, generalized locations, and privacy-withheld routes are distinguished through the route catalog. The Map is route-first where geometry adds useful context, while dense areas fade non-focused routes so the selected day/course stays readable.

Skiing is mapped primarily at the resort level rather than placing a marker for every ski day.

## Run locally

Because the site loads JSON with `fetch`, serve the directory rather than opening HTML files directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Deployment

Production is GitHub Pages on the custom domain:

**https://adventures.alexlford.com/**

The repository `CNAME` must remain `adventures.alexlford.com`. GitHub Pages publishes from the root of the `main` branch. Public-index files are generated with:

```bash
npm run build:public-index
```

Production record links use `/record/<slug>/`; the GitHub Pages fallback resolves the route to the static detail renderer and restores the clean URL after the record data and map have loaded. Top-level navigation is rooted on production so it continues to work from clean record URLs.

## Source notes

The archive combines alexlford.com history, the supplied Strava export, Slopes screenshots, calendar evidence, historical race results, GPS files, photos, and direct user confirmation. Source disagreements are preserved rather than guessed away.
