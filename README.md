# Personal Adventure Almanac

Interactive map and personal outdoor-history archive for Alex Ford. The project began with the Athletic Activities section of alexlford.com and has grown into a structured Almanac spanning races, summits, alpine skiing, Nordic skiing, mountain biking, and curated Adventures.

## Explore the Almanac

The public information architecture is intentionally simple:

- **Overview** — front cover, current pursuits, recent records, and ways into the archive
- **Map** — geographic view with seven public layers: MTB, Nordic, Road Races, Trail Races, Skiing, Summits, and Adventures
- **Timeline** — one cross-discipline chronology
- **Activities** — hub for Races, Summits, Skiing, Nordic, and MTB
- **Adventures** — curated editorial chapters for objectives and efforts that deserve a larger story

Individual records use the canonical catalog and route system rather than page-specific copies of the data.

## Current archive

The archive includes named summits, a reconstructed race history, day-level MTB and Nordic outings, a Slopes/Strava-backed Ski Passport, World Marathon Majors progress, and curated Adventures such as DeCaLiBron, West Maroon Pass Traverse, Ski the Sky Loop, Ranch Hand, and Royal Gorge Groove Run + Ride.

The initial Strava baseline contains **3,371 activities** through the August 10, 2026 export. Most ordinary training activities are intentionally not public records.

## Canonical data architecture

`data/catalog.json` is the canonical public resolver. Public pages should not independently decide which source wins, which record is removed, or which correction applies.

`catalog.js` loads source files in manifest order, merges records by stable ID, applies the Strava match layer, removes stale legacy IDs, applies authoritative corrections, validates the result, and returns the same public record set to every page.

Key supporting layers include:

- `data/relationships.json` — series, challenge, weekend, and multi-record relationships
- `data/route-catalog.json` — route provenance and record/route overrides
- `data/activity-days.json` — day-level MTB and Nordic outings
- `data/skiing.json` — Ski Passport, seasons, resorts, trips, and ski-specific metadata
- `data/world-majors.json` — World Marathon Majors journey, including future registrations without inflating completed-race totals
- `data/research-candidates.json` — borderline historical matches excluded from the public catalog

See `docs/data-model.md` for schema and precedence details.

## Keeping the Almanac current

The site is designed to update incrementally as new activities accumulate.

### 1. Scan a fresh Strava export

```bash
npm run scan:strava -- /path/to/export.zip
```

This generates `tmp/update-queue.json` from activities newer than the last fully reviewed Strava snapshot in `data/ingest-state.json`.

The queue is **review-only**. It never publishes records automatically.

### 2. Curate the new activity delta

The policy in `data/update-policy.json` keeps the site from becoming an activity feed:

- ordinary training runs stay private unless they are races or become curated Adventures;
- generic cycling is reviewed before deciding whether it belongs in the MTB chapter;
- MTB and Nordic can enter day-level outing history;
- alpine skiing updates the Ski Passport, with Slopes supplying runs, vertical, resort, and trip context where available;
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

For the full workflow, including historical backfills and ski screenshots, see `docs/updating-the-almanac.md`.

## Validation and CI

Run:

```bash
npm run validate:data
npm run test:update-pipeline
```

CI checks the canonical catalog, relationships, route provenance, ingest state, update policy, Python maintenance tooling, the update-pipeline smoke test, and generated sitemap/robots files.

## Important archive rules

- North Star Mountain is matched to the September 12, 2020 Strava activity `Quartzville` through a canonical override.
- The stale single `SMR Stampede 50k Ranch Hand` record is suppressed and replaced by the actual March 12–13, 2022 25K freestyle and 25K classic races.
- Frisco BrewSki is a named Nordic event, not a race.
- West Maroon Pass Traverse is an Adventure/trek, not a road race.
- Royal Gorge Groove MTB remains an individual race even though the combined Run + Ride weekend can be a larger chapter.
- The 2019/20 ski season has three known ski days, but season vertical was not recorded and is intentionally not shown as zero.
- The exact 2020 virtual Chicago Marathon route is privacy-withheld.
- MTB riding style belongs to the individual outing, not permanently to the venue.

## Map and route behavior

Recorded GPS, historical courses, generalized locations, and privacy-withheld routes are distinguished through the route catalog. The Map is route-first where geometry adds useful context, while dense areas fade non-focused routes so the selected day/course stays readable.

Skiing is mapped primarily at the resort level rather than placing a marker for every ski day.

## Run locally

Because the site loads JSON with `fetch`, serve the directory rather than opening HTML files directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/overview.html`.

## Deployment

The current staging deployment is GitHub Pages. Public-index files are generated with:

```bash
npm run build:public-index
```

The recommended production home is **`https://alexlford.com/almanac/`**, as a first-class site section rather than an iframe. The project uses relative application/data paths so the same code can operate under the current GitHub Pages subdirectory or the future `/almanac/` path.

See `docs/alexlford-integration.md` for the proposed clean URL structure and migration sequence.

## Source notes

The archive combines alexlford.com history, the supplied Strava export, Slopes screenshots, calendar evidence, historical race results, GPS files, and direct user confirmation. Source disagreements are preserved rather than guessed away.
