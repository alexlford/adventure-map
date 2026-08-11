# alexlford.com integration plan

## Recommended canonical home

Publish the Personal Adventure Almanac as a first-class companion site to the existing personal website rather than embedding it in an iframe.

**Preferred production home:** `https://almanac.alexlford.com/`

**Fallback production home:** `https://alexlford.com/almanac/`

The subdomain is preferred because the user already operates `sports.alexlford.com` through Squarespace-managed DNS and has successfully used that deployment pattern before. It lets the Almanac remain a self-contained static application while still clearly belonging to alexlford.com.

## Why a subdomain is now preferred

- It mirrors an existing proven deployment pattern used for `sports.alexlford.com`.
- The Map gets full control of viewport sizing, Leaflet resize behavior, browser history, and mobile layout.
- The static app can deploy independently of the main Squarespace site.
- Individual detail pages can have clean direct URLs.
- DNS/canonical changes can be isolated from the primary alexlford.com website.
- Search metadata, sitemap generation, and redirects can be managed entirely within this repository.

A `/almanac/` subpath remains technically viable if the final hosting environment makes subpath mounting materially easier, but it is no longer the default recommendation.

## Proposed URL structure

Using the preferred subdomain:

- `https://almanac.alexlford.com/` — Overview / front cover
- `/map/` — Map
- `/timeline/` — Timeline
- `/activities/` — Activity hub
- `/races/` — Races
- `/summits/` — Summits
- `/skiing/` — Ski Passport
- `/nordic/` — Nordic
- `/mtb/` — Mountain Biking
- `/adventures/` — Adventures
- `/record/<slug>/` — canonical record URLs

The current static `.html` and `detail.html?record=...` routes continue to work during migration and can redirect to these cleaner routes later.

## Deployment requirements

The application intentionally uses relative links and relative data-file paths, so it can operate from the current GitHub Pages subdirectory, a dedicated subdomain, or an `/almanac/` subdirectory with minimal code changes.

Before production cutover, generate deployment metadata using the chosen canonical host. Preferred form:

```bash
SITE_URL=https://almanac.alexlford.com npm run build:public-index
```

Fallback subpath form:

```bash
SITE_URL=https://alexlford.com/almanac npm run build:public-index
```

This rewrites `sitemap.xml` and `robots.txt` for the production host. CI verifies that the committed public-index files match the configured/default deployment base.

## Migration sequence

1. Keep `alexlford.github.io/adventure-map/` as the staging site.
2. Complete visual/mobile QA against staging.
3. Confirm the exact DNS/hosting pattern used for `sports.alexlford.com` and mirror it for `almanac.alexlford.com` when practical.
4. Point the new subdomain at the Almanac hosting target without changing the root `alexlford.com` site.
5. Generate production sitemap/robots using `SITE_URL=https://almanac.alexlford.com`.
6. Publish clean `/record/<slug>/` routes and add them to the production sitemap.
7. Add redirects from the GitHub Pages staging URLs to their production equivalents where practical.
8. Only after the new URLs are live, switch canonical metadata and search indexing to the production host.

## DNS cutover guardrails

- Do not modify the root `alexlford.com` records merely to launch the Almanac.
- Prefer adding only the new `almanac` host record needed by the final hosting provider, following the already-proven `sports` pattern when available.
- Do not remove or overwrite the existing `sports.alexlford.com` record.
- Verify TLS/HTTPS on the new subdomain before switching canonical metadata.
- Keep the GitHub Pages deployment usable as staging until production verification is complete.

## Do not do yet

- Do not add a GitHub Pages `CNAME` for `alexlford.com` itself; that could interfere with the existing main site.
- Do not assume the exact DNS target for `sports.alexlford.com` without verifying the existing Squarespace DNS configuration.
- Do not index temporary query-string record URLs as permanent canonical URLs.
- Do not iframe the Almanac inside an existing page.
