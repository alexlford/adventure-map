# alexlford.com integration plan

## Recommended canonical home

Publish the Personal Adventure Almanac as a first-class section of the existing personal site rather than embedding it in an iframe.

**Recommended path:** `https://alexlford.com/almanac/`

This keeps the Almanac clearly part of alexlford.com while preserving its own navigation, map application, data files, and visual identity.

## Why a subpath instead of an embed

- The Map needs full control of viewport sizing, Leaflet resize behavior, browser history, and mobile layout.
- Individual detail pages need direct URLs that can be linked and shared.
- Search metadata, canonical URLs, and future record indexing work naturally when the Almanac owns its routes.
- The project can still link back to the main alexlford.com navigation through the ALEX FORD brand link.

## Proposed URL structure

- `/almanac/` — Overview / front cover
- `/almanac/map/` — Map
- `/almanac/timeline/` — Timeline
- `/almanac/activities/` — Activity hub
- `/almanac/races/` — Races
- `/almanac/summits/` — Summits
- `/almanac/skiing/` — Ski Passport
- `/almanac/nordic/` — Nordic
- `/almanac/mtb/` — Mountain Biking
- `/almanac/adventures/` — Adventures
- `/almanac/record/<slug>/` — eventual canonical record URLs

The current static `.html` and `detail.html?id=...` routes can continue to work during migration and redirect to these cleaner routes later.

## Deployment requirements

The application intentionally uses relative links and relative data-file paths, so it can operate from either the current GitHub Pages subdirectory or an `/almanac/` subdirectory without code changes.

Before production cutover, generate deployment metadata with the canonical base URL:

```bash
SITE_URL=https://alexlford.com/almanac npm run build:public-index
```

This rewrites `sitemap.xml` and `robots.txt` for the production host. CI verifies that the committed public-index files match the configured/default deployment base.

## Migration sequence

1. Keep `alexlford.github.io/adventure-map/` as the staging site.
2. Complete visual/mobile QA against staging.
3. Mount or publish the repo output at `/almanac/` on alexlford.com.
4. Generate production sitemap/robots using `SITE_URL=https://alexlford.com/almanac`.
5. Add redirects from the GitHub Pages URLs to their alexlford.com equivalents where practical.
6. Replace query-string record URLs with stable record slugs and then add them to the production sitemap.
7. Only after the new URLs are live, switch canonical metadata and search indexing to the alexlford.com paths.

## Do not do yet

- Do not add a GitHub Pages `CNAME` file for `alexlford.com`; that could interfere with the existing main site.
- Do not index every `detail.html?id=...` URL as a permanent canonical record URL.
- Do not iframe the Almanac inside an existing page.
