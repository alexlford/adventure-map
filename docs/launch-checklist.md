# Alex Ford Adventures launch checklist

This checklist covers production readiness for `https://adventures.alexlford.com/`. GitHub Pages remains the staging/release-candidate environment while the remaining production items are verified.

## 1. Release-candidate QA

- Confirm Home, Explore, Map, Stories, Timeline, Races, Summits, Skiing, Nordic, and MTB load without console-breaking errors.
- Verify the primary **Home · Explore · Map · Stories** navigation at phone, tablet, and desktop widths.
- Verify the Explore subnavigation for Races, Summits, Skiing, Nordic, MTB, and Timeline.
- Verify the Map loads and resizes correctly on iOS/Safari and that dense Colorado routes remain usable.
- Verify at least one record from every record class: race, summit, MTB outing, Nordic outing, event, and Adventure Story.
- Verify route-present, location-only, historical-course, and privacy-withheld detail states.
- Verify long names, notes, locations, companion labels, and missing metrics do not overflow narrow screens.
- Verify legacy `detail.html?id=...` URLs still resolve through the slug compatibility layer.
- Verify staging `detail.html?record=<slug>` links work for previous/next, related-record, Map, Timeline, and collection entry points.
- Verify Stories with no photography remain typography-first and Stories with real media render the shared photo-essay treatment correctly.

## 2. Data integrity

Run the full CI suite and require green status for:

- canonical catalog validation
- stable record slug validation
- production routing validation
- Strava maintenance pipeline test
- editorial media validation
- generated sitemap/robots drift check

Do not launch with an unreviewed Strava delta queue.

## 3. Production host

Production host: `adventures.alexlford.com`.

- GitHub Pages custom domain must remain `adventures.alexlford.com`.
- Squarespace DNS should contain only the `adventures` CNAME required by GitHub Pages.
- CNAME Alias Data: `alexlford.github.io` — no `https://`, no path, and no `/adventure-map` repository name.
- Do not change apex/root `alexlford.com` records.
- Do not alter or remove `sports.alexlford.com`.
- Confirm GitHub Pages recognizes `adventures.alexlford.com`.
- Confirm HTTPS/TLS is valid and enable **Enforce HTTPS** once GitHub makes it available.

## 4. Routing behavior

GitHub Pages is a static host and does not provide a native rewrite from `/record/<slug>/` to the shared record renderer. The repository therefore separates public identity from internal rendering:

- public/canonical identity: `/record/<slug>/`
- compatibility renderer: `detail.html?record=<slug>`
- `404.html` recognizes clean record routes and forwards them to the renderer
- the renderer restores the clean production URL after record data and map assets load

Do not use an early `history.replaceState()` while the record page is still fetching relative route/data assets; that can change relative fetch resolution and break maps.

If a future hosting platform supports rewrites, prefer a true server/edge rewrite from `/record/<slug>/` to the record renderer while preserving the browser URL. If production stays on GitHub Pages, keep the compatibility fallback unless/until records are prerendered as physical `/record/<slug>/index.html` pages.

## 5. Production metadata

Generate deployment metadata with:

```bash
SITE_URL=https://adventures.alexlford.com npm run build:public-index
```

Then verify:

- `robots.txt` references the production sitemap
- static chapter canonical URLs use the production host
- record pages expose `/record/<slug>/` as canonical identity
- Open Graph URLs match canonical identities
- temporary staging/query-string URLs are not promoted as permanent search URLs

## 6. alexlford.com integration

- Add a clear **Adventures** entry point on `alexlford.com`; do not iframe the app.
- Link directly to `https://adventures.alexlford.com/`.
- Preserve Adventures' own navigation after the visitor crosses into the subdomain.
- Do not use legacy “Adventure Almanac” naming in the main-site link or public navigation.

## 7. Launch-day smoke test

After DNS resolves and HTTPS is active, test from both Wi-Fi and cellular:

- Home
- Explore
- Map and at least one route-heavy Colorado view
- Stories
- Timeline
- all five activity chapters
- one race record
- one summit record
- one MTB outing
- one Nordic outing
- one ski objective Story
- DeCaLiBron as the mountain-loop Story reference page
- Chicago Marathon as the completed-Major reference page
- previous/next record navigation
- a clean `/record/<slug>/` entry from a copied/shared URL
- main-site link from `alexlford.com`

## 8. After launch

- Keep `alexlford.github.io/adventure-map/` available as staging.
- Point future public links to the production subdomain only.
- Use the incremental Strava update workflow for ongoing maintenance.
- Add Story media only when genuine images and useful alt text exist.
- Periodically regenerate the public index after archive updates.
- Re-run phone/map smoke tests after major route-volume, Story-layout, or navigation changes.
