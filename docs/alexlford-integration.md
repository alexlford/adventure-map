# alexlford.com integration plan

## Recommended canonical home

Publish the Personal Adventure Almanac as a first-class companion site to the existing personal website rather than embedding it in an iframe.

**Preferred production home:** `https://adventures.alexlford.com/`

**Fallback production home:** `https://alexlford.com/adventures/`

The `adventures` subdomain is preferred because the user already operates `sports.alexlford.com` through Squarespace-managed DNS and has successfully used that deployment pattern before. It lets the Almanac remain a self-contained static application while still clearly belonging to alexlford.com, and the word “adventures” better matches the public-facing identity of the project than “almanac” as a hostname.

## Why a subdomain is preferred

- It mirrors an existing proven deployment pattern used for `sports.alexlford.com`.
- The Map gets full control of viewport sizing, Leaflet resize behavior, browser history, and mobile layout.
- The static app can deploy independently of the main Squarespace site.
- Individual detail pages can have clean direct URLs.
- DNS/canonical changes can be isolated from the primary alexlford.com website.
- Search metadata, sitemap generation, and redirects can be managed entirely within this repository.

An `/adventures/` subpath remains technically viable if the final hosting environment makes subpath mounting materially easier, but it is no longer the default recommendation.

## Proposed URL structure

Using the preferred subdomain:

- `https://adventures.alexlford.com/` — Overview / front cover
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

The application intentionally uses relative links and relative data-file paths, so it can operate from the current GitHub Pages subdirectory, a dedicated subdomain, or an `/adventures/` subdirectory with minimal code changes.

Before production cutover, generate deployment metadata using the chosen canonical host. Preferred form:

```bash
SITE_URL=https://adventures.alexlford.com npm run build:public-index
```

Fallback subpath form:

```bash
SITE_URL=https://alexlford.com/adventures npm run build:public-index
```

This rewrites `sitemap.xml` and `robots.txt` for the production host. CI verifies that the committed public-index files match the configured/default deployment base.

## Migration sequence

1. Keep `alexlford.github.io/adventure-map/` as the staging site.
2. Complete visual/mobile QA against staging.
3. Configure `adventures.alexlford.com` in the GitHub Pages repository settings before creating the DNS record, following GitHub's custom-domain guidance.
4. In Squarespace DNS, create only the `adventures` CNAME pointing to `alexlford.github.io`.
5. Confirm DNS resolution and HTTPS/TLS without changing the root `alexlford.com` site.
6. Generate production sitemap/robots using `SITE_URL=https://adventures.alexlford.com`.
7. Publish clean `/record/<slug>/` routes and add them to the production sitemap.
8. Add redirects from the GitHub Pages staging URLs to their production equivalents where practical.
9. Only after the new URLs are live, switch canonical metadata and search indexing to the production host.

## DNS cutover guardrails

- Do not modify the root `alexlford.com` records merely to launch the Adventures site.
- Add only the new `adventures` host record needed by GitHub Pages.
- The Squarespace record should be `CNAME adventures -> alexlford.github.io` with no protocol, path, or repository name in Alias Data.
- Do not remove or overwrite the existing `sports.alexlford.com` record.
- Verify TLS/HTTPS on the new subdomain before switching canonical metadata.
- Keep the GitHub Pages deployment usable as staging until production verification is complete.

## Do not do yet

- Do not add a GitHub Pages custom domain for `alexlford.com` itself; that could interfere with the existing main site.
- Do not point the DNS CNAME at `alexlford.github.io/adventure-map`; GitHub requires the user-site hostname only.
- Do not index temporary query-string record URLs as permanent canonical URLs.
- Do not iframe the Almanac inside an existing page.
