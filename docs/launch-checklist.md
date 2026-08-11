# Personal Adventure Almanac launch checklist

This checklist is for the eventual production cutover to `https://almanac.alexlford.com/`. The GitHub Pages site remains staging until every production item below is complete.

## 1. Release-candidate QA

- Confirm Overview, Map, Timeline, Activities, Adventures, Races, Summits, Skiing, Nordic, and MTB load without console-breaking errors.
- Verify primary and activity navigation at phone, tablet, and desktop widths.
- Verify the Map loads and resizes correctly on iOS/Safari and that dense Colorado routes remain usable.
- Verify at least one record from every record class: race, summit, MTB outing, Nordic outing, event, and Adventure.
- Verify route-present, location-only, historical-course, and privacy-withheld detail states.
- Verify long names, long notes, long locations, and empty/missing metrics do not overflow narrow screens.
- Verify legacy `detail.html?id=...` URLs still resolve through the slug compatibility layer.
- Verify staging `detail.html?record=<slug>` links work for previous/next, related-record, Map, Timeline, and archive entry points.

## 2. Data integrity

Run the full CI suite and require green status for:

- canonical catalog validation
- stable record slug validation
- production routing validation
- Strava maintenance pipeline test
- generated sitemap/robots drift check

Do not launch with an unreviewed Strava delta queue.

## 3. Production host preparation

Preferred host: `almanac.alexlford.com`.

- Inspect the existing Squarespace DNS record used for `sports.alexlford.com` and mirror that proven pattern where appropriate.
- Add only the `almanac` host record required by the hosting target.
- Do not change apex/root `alexlford.com` records.
- Do not alter or remove `sports.alexlford.com`.
- Confirm the hosting provider recognizes `almanac.alexlford.com` before changing canonical/indexing metadata.
- Confirm HTTPS/TLS is valid on the production subdomain.

## 4. Routing behavior

GitHub Pages is a static host and does not provide a native rewrite from `/record/<slug>/` to the shared record renderer. The repository therefore separates public identity from internal rendering:

- public/canonical identity: `/record/<slug>/`
- compatibility renderer: `detail.html?record=<slug>`
- `404.html` recognizes clean record routes and forwards them to the renderer
- the renderer publishes the clean URL as canonical/Open Graph identity on the production hostname

Do not use an early `history.replaceState()` to force the clean path while the record page is still fetching relative route/data assets; that can change relative fetch resolution and break maps.

If the final hosting platform supports rewrites, prefer a true server/edge rewrite from `/record/<slug>/` to the record renderer while preserving the browser URL. If production stays on GitHub Pages, keep the compatibility fallback unless/until records are prerendered as physical `/record/<slug>/index.html` pages.

## 5. Production metadata

Immediately before cutover:

```bash
SITE_URL=https://almanac.alexlford.com npm run build:public-index
```

Then verify:

- `robots.txt` references the production sitemap
- static chapter canonical URLs use the production host
- record pages expose `/record/<slug>/` as canonical identity
- Open Graph URLs match canonical identities
- temporary staging URLs are not promoted as permanent search URLs

## 6. Squarespace/main-site integration

- Add a clear Almanac entry point on `alexlford.com` rather than embedding the app in an iframe.
- Suggested label: `Personal Adventure Almanac` or `Adventure Almanac`.
- Link directly to `https://almanac.alexlford.com/`.
- Preserve the Almanac's own navigation after the visitor crosses into the subdomain.

## 7. Launch-day smoke test

After DNS resolves and HTTPS is active, test from both Wi-Fi and cellular:

- production Overview
- Map and at least one route-heavy Colorado view
- Timeline
- all five activity chapters
- Adventures
- one race record
- one summit record
- one MTB outing
- one Nordic outing
- one ski objective/Adventure
- previous/next record navigation
- a clean `/record/<slug>/` entry from a copied/shared URL
- main-site link from `alexlford.com`

## 8. After launch

- Keep `alexlford.github.io/adventure-map/` available as staging.
- Point future public links to the production subdomain only.
- Use the existing incremental Strava update workflow for ongoing maintenance.
- Periodically regenerate the public index after archive updates.
- Re-run phone/map smoke tests after major route-volume or navigation changes.
