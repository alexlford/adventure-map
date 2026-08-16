# Updating Alex Ford Adventures

Adventures is designed to stay curated as new running, mountain biking, Nordic skiing, alpine skiing, races, stories, and media accumulate. The update workflow is incremental: compare a fresh Strava export against the last fully reviewed snapshot watermark, review only the new relevant activities, promote the appropriate records, rebuild the deterministic publication, then advance the watermark.

## Current baseline

The initial full-history review is baselined in `data/ingest-state.json` at **3,371 Strava activities**, reviewed through the latest activity in the August 10, 2026 export. The state file stores the final activity timestamp plus one-way hashes only when multiple activities share that exact timestamp. It does not publish a list of ordinary historical training activity IDs.

## The normal update cycle

1. Export current Strava account data.
2. Run the incremental scanner against the export ZIP:

   ```bash
   npm run scan:strava -- /path/to/export.zip
   ```

   The default output is `tmp/update-queue.json`.
3. Review the queue. The scanner does **not** publish anything automatically and does **not** advance the ingest state automatically.
4. Resolve location, record type, and any discipline-specific classification for the candidates worth publishing.
5. Extract or generalize GPS geometry only for records where a route adds value and is privacy-safe.
6. Update the appropriate canonical source files.
7. Rebuild the publication and run the relevant validation stack:

   ```bash
   npm run build:publish
   npm run validate:data
   npm run validate:duplicates
   npm run validate:routing
   npm run validate:dependencies
   npm run validate:static
   ```

8. Once the entire new Strava snapshot has been reviewed, advance the watermark:

   ```bash
   npm run advance:strava -- tmp/update-queue.json --confirm-reviewed
   ```

9. Rebuild once more after the watermark change, validate, commit the canonical changes **and** generated publication artifacts, then publish:

   ```bash
   npm run build:publish
   npm run validate:data
   ```

The watermark means a full Strava export can be supplied every time without resurfacing thousands of old training activities. The queue includes a proposed next watermark, but it is only accepted after review.

### Publication artifacts

`npm run build:publish` is part of the normal maintenance contract, not an optional deployment convenience. It performs three deterministic stages:

1. `build:public-records` resolves the canonical catalog into `data/public-records.json`;
2. `build:static-site` materializes clean pages such as `/map/index.html`, `/races/index.html`, and `/record/<slug>/index.html`;
3. `build:public-index` refreshes `sitemap.xml` and `robots.txt`.

Do not hand-edit generated clean-path pages or `data/public-records.json`. Change canonical source or shared rendering code, rebuild, and commit the resulting publication. CI rebuilds the publication and fails if checked-in generated output is stale.

### Historical backfills

If an activity is added to Strava later with an activity date older than the current watermark, intentionally rescan a historical window:

```bash
npm run scan:strava -- /path/to/export.zip --since 2026-01-01
```

Do not advance the normal watermark backward after a historical rescan.

## What happens by activity type

### Running

Ordinary training runs do **not** become public Adventures records. Review new runs only for:

- organized road races;
- organized trail races;
- marathons and relays;
- named personal challenges or unusual efforts that deserve a Story chapter.

This keeps the public Map at Road Races and Trail Races instead of turning it into a training heat map.

### Cycling / mountain biking

A generic Strava `Ride` is **not** automatically an MTB outing. First resolve whether it is mountain biking, road cycling, an organized race, or a larger Story. Ordinary road-cycling training is not currently a public Map layer.

For every published MTB day, resolve the classification for that **specific day**:

- `MTB` — human-powered riding;
- `Downhill MTB` — lift-served riding;
- `MTB + Downhill MTB` — a genuinely mixed day.

The location never permanently determines the riding style. Organized MTB races remain race records and standout multi-day or multi-part objectives may also become Stories.

### Nordic skiing

Ordinary Nordic outings can enter the day-level archive. Keep three concepts separate:

- recreational outing;
- competitive race;
- named but untimed event.

Standout days or weekends can be promoted into a larger Story when appropriate.

### Alpine skiing / snowboarding

Every reconciled ski day contributes to the Skiing chapter even if it is not a stand-alone public record. A normal update should refresh:

- season ski-day count;
- resort visit/day history;
- current-season metrics when available;
- named trips if the day belongs to one.

Use Slopes when ski-specific run count, vertical, resort identity, or trip grouping matters. Strava remains the activity-history backbone. A notable objective such as a named ski challenge may also become a Story.

## Promotion destinations

The review queue uses suggested actions rather than making publication decisions itself:

- `review-only` — inspect, but usually do not publish;
- `race-review` — likely needs race/event classification and evidence;
- `bike-review` — resolve MTB vs road cycling vs race/Story before publication;
- `candidate-outing` — likely belongs in Nordic day-level history;
- `ski-passport` — reconcile into the ski archive.

The authoritative policy is `data/update-policy.json`.

## Route handling

Routes should never publish merely because a GPX/FIT/TCX file exists. Before adding geometry:

1. determine whether the route is personal GPS, historical course, location-only, or privacy-withheld;
2. avoid exposing unnecessary home/start locations;
3. preserve enough recorded geometry for useful close zoom while keeping the public route privacy-safe;
4. connect the route to the stable record ID through the route catalog.

The source-preserving Strava materializer accepts GPX, FIT, and TCX activity files, including their `.gz` forms. It retains recorded GPS points rather than inventing intermediate coordinates or applying RDP simplification, and it splits the published line at large source discontinuities so a recording gap cannot become a fake straight segment.

After the canonical ownership/privacy review is complete, regenerate eligible Strava-backed routes from the current account export with:

```bash
npm run materialize:strava-routes -- /path/to/export.zip
```

The materializer refreshes the generated full-resolution shards and their route-catalog references. Run the normal publication build and validation stack after materialization. Treat these files as generated derivatives of the reviewed Strava source rather than hand-editing individual encoded polylines.

## Named races and Stories

Some new activities require more than the automated delta scan. When a race or Story is promoted, add the contextual layer too: official result where available, event-series relationship, challenge/weekend relationship, factual chapter deck, and route provenance.

For a race, a new record should not be considered complete merely because Strava contains the GPS activity. Duplicate-race validation is intentionally separate from general schema validation so same-date/location/distance candidates receive explicit review before publication.

For a Story, keep narrative claims evidence-based. The editorial renderer can emphasize the documented structure of the objective without inventing personal recollections:

- mountain loops can show linked summit sequence and recorded scale;
- traverses can emphasize date span, distance, and gain;
- ski objectives can emphasize runs, distance, and descent;
- challenges/weekends can show the individual component records in sequence.

## Photos and media

Media is optional and should remain invisible until genuine images exist. Record media lives on the canonical record as a `media` array. Each image entry requires both a source and meaningful alt text:

```json
{
  "mediaTitle": "Race day",
  "mediaIntro": "Optional short introduction.",
  "media": [
    {
      "type": "image",
      "src": "media/chicago-2021/finish.jpg",
      "alt": "Alex after finishing the 2021 Chicago Marathon",
      "caption": "Grant Park after the finish",
      "credit": "Optional photographer credit"
    }
  ]
}
```

Repository-owned image assets are preferred over remote URLs. `npm run validate:data` checks that local image paths exist, rejects path traversal, requires alt text, and validates caption/credit types. The photo-essay component renders nothing when a record has no valid media.

Do not publish tiny crops from screenshots as if they were original photographs. Screenshots can remain evidence sources without becoming editorial media.

## Ski screenshots and other evidence

A screenshot from Slopes, a race result, medal/photo, calendar entry, or direct confirmation can enrich or correct a Strava-backed record. Preserve source disagreements rather than guessing. If a trip header and visible day rows disagree slightly, retain both facts in source notes rather than forcing a fabricated reconciliation.

## Updating through ChatGPT

The lowest-friction workflow is simple: upload a fresh Strava export and any new Slopes screenshots or photos, then ask to **update Adventures**. The same delta policy should be followed: scan from the reviewed watermark, review the new relevant subset, update canonical data/routes/media, rebuild and validate the static publication, advance the watermark, rebuild again, and publish. You should not need to re-explain the site architecture each time.

For ordinary ongoing use, a fresh full Strava export is preferable to manually listing recent activities because it also catches rides, ski days, renamed activities, and new GPS files consistently.

## Future automation

The current workflow intentionally begins from account exports rather than depending on a live Strava API token. If a reliable automated Strava ingestion path is added later, it should feed the **same review queue and promotion policy** rather than bypassing curation and writing directly to public data.
