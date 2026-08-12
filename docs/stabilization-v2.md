# Adventures stabilization v2

This branch rebuilds the original architecture hardening on top of the current `main` Map and chapter UX rather than rebasing the obsolete first stabilization branch.

## Behaviors that are requirements

The cleanup must preserve current public behavior that landed after the original audit:

- shareable full-Map URL state for layer, search, year bounds, and record focus;
- chapter-aware links into the full Map;
- passive coarse-touch Map behavior so page scrolling wins until **Explore map** is selected;
- current marker/route visuals, mixed-venue treatment, and chapter-map view controls;
- official race result precedence over GPS timing/distance;
- ski-resort coverage on the Map;
- current Story, World Marathon Majors, media, and record-detail presentation.

These behaviors are protected by browser tests before their implementation is migrated.

## Migration order

1. **Browser baseline**
   - run every public section in Chromium;
   - fail on uncaught runtime errors;
   - protect Map URL state, coarse-touch mode, mobile overflow, and representative record classes.

2. **Route publication boundary**
   - validate raw GeoJSON, encoded activity routes, and ski-resort Map entities;
   - compile one deterministic public route FeatureCollection;
   - preserve provenance and explicitly report incomplete imported polyline tails rather than inventing geometry.

3. **Map runtime consolidation**
   - replace delayed supplemental route loading with the canonical route collection;
   - fold official-result presentation into the core renderer;
   - model ski resorts as Map entities rather than mutating canonical Adventures records after load;
   - remove obsolete extension scripts only after their public behavior is covered elsewhere.

4. **Shared helper boundary**
   - route links, date/duration formatting, escaping, and shared site behavior belong to `AdventureSite`;
   - Map-specific code should not reimplement production routing or generic formatting.

5. **Publication data**
   - compile provenance-rich record and route sources into browser-facing publication files;
   - prove compiled IDs/slugs/routes match the canonical source resolver.

6. **Record renderer**
   - replace MutationObserver and delayed cleanup composition with one explicit render pipeline under record-class browser tests.

7. **Static publishing**
   - generate real clean section and `/record/<slug>/` documents;
   - write static metadata and a record-complete sitemap;
   - deploy the tested artifact only after GitHub Pages is intentionally switched to Actions publishing.

## Branch policy

Do not force-rebase the old stabilization PR over current `main`. Port verified behavior in small slices and keep each slice green against the latest merged-state CI. If concurrent `main` work touches the same public behavior, re-read current files first and preserve the newer UX rather than copying old files wholesale.
