# Updating the Personal Adventure Almanac

The Almanac is designed to stay curated as new running, mountain biking, Nordic skiing, and alpine skiing accumulate. The update workflow is incremental: compare a fresh Strava export against the last fully reviewed snapshot watermark, review only the new relevant activities, promote the appropriate records, then advance the watermark.

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
7. Run:

   ```bash
   npm run validate:data
   ```

8. Once the entire new Strava snapshot has been reviewed, advance the watermark:

   ```bash
   npm run advance:strava -- tmp/update-queue.json --confirm-reviewed
   ```

9. Run validation again, commit, and publish.

The watermark means a full Strava export can be supplied every time without resurfacing thousands of old training activities. The queue includes a proposed next watermark, but it is only accepted after review.

### Historical backfills

If an activity is added to Strava later with an activity date older than the current watermark, intentionally rescan a historical window:

```bash
npm run scan:strava -- /path/to/export.zip --since 2026-01-01
```

Do not advance the normal watermark backward after a historical rescan.

## What happens by activity type

### Running

Ordinary training runs do **not** become public Almanac records. Review new runs only for:

- organized road races;
- organized trail races;
- marathons and relays;
- named personal challenges or unusual efforts that deserve an Adventure chapter.

This keeps the public Map at Road Races and Trail Races instead of turning it into a training heat map.

### Cycling / mountain biking

A generic Strava `Ride` is **not** automatically an MTB outing. First resolve whether it is mountain biking, road cycling, an organized race, or a larger Adventure. Ordinary road-cycling training is not currently a public Almanac layer.

For every published MTB day, resolve the classification for that **specific day**:

- `MTB` — human-powered riding;
- `Downhill MTB` — lift-served riding;
- `MTB + Downhill MTB` — a genuinely mixed day.

The location never permanently determines the riding style. Organized MTB races remain race records and standout multi-day or multi-part objectives may also become Adventures.

### Nordic skiing

Ordinary Nordic outings can enter the day-level archive. Keep three concepts separate:

- recreational outing;
- competitive race;
- named but untimed event.

Standout days or weekends can be promoted into a larger Adventure/chapter when appropriate.

### Alpine skiing / snowboarding

Every reconciled ski day contributes to the Ski Passport even if it is not a stand-alone public record. A normal update should refresh:

- season ski-day count;
- resort visit/day history;
- current-season metrics when available;
- named trips if the day belongs to one.

Use Slopes when ski-specific run count, vertical, resort identity, or trip grouping matters. Strava remains the activity-history backbone. A notable objective such as a named ski challenge may also become an Adventure.

## Promotion destinations

The review queue uses suggested actions rather than making publication decisions itself:

- `review-only` — inspect, but usually do not publish;
- `race-review` — likely needs race/event classification and evidence;
- `bike-review` — resolve MTB vs road cycling vs race/Adventure before publication;
- `candidate-outing` — likely belongs in Nordic day-level history;
- `ski-passport` — reconcile into the ski archive.

The authoritative policy is `data/update-policy.json`.

## Route handling

Routes should never publish merely because a GPX/FIT file exists. Before adding geometry:

1. determine whether the route is personal GPS, historical course, location-only, or privacy-withheld;
2. avoid exposing unnecessary home/start locations;
3. simplify large tracks enough to keep mobile performance healthy;
4. connect the route to the stable record ID through the route catalog.

## Named races and Adventures

Some new activities require more than the automated delta scan. When a race or Adventure is promoted, add the contextual layer too: official result where available, event-series relationship, challenge/weekend relationship, note/story text, and route provenance.

For a race, a new record should not be considered complete merely because Strava contains the GPS activity.

## Ski screenshots and other evidence

A screenshot from Slopes, a race result, medal/photo, calendar entry, or direct confirmation can enrich or correct a Strava-backed record. Preserve source disagreements rather than guessing. If a trip header and visible day rows disagree slightly, retain both facts in source notes rather than forcing a fabricated reconciliation.

## Updating through ChatGPT

The lowest-friction workflow is simple: upload a fresh Strava export and any new Slopes screenshots, then ask to **update the Almanac**. The same delta policy should be followed: scan from the reviewed watermark, review the new relevant subset, update canonical data/routes, validate, advance the watermark, and publish. You should not need to re-explain the site architecture each time.

For ordinary ongoing use, a fresh full Strava export is preferable to manually listing recent activities because it also catches rides, ski days, renamed activities, and new GPS files consistently.

## Future automation

The current workflow intentionally begins from account exports rather than depending on a live Strava API token. If a reliable automated Strava ingestion path is added later, it should feed the **same review queue and promotion policy** rather than bypassing curation and writing directly to public data.
