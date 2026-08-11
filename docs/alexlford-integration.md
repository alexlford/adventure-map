# alexlford.com integration plan

## Canonical home

Publish **Alex Ford Adventures** as a first-class companion site to the existing personal website rather than embedding it in an iframe.

**Production home:** `https://adventures.alexlford.com/`

The `adventures` subdomain is preferred because the same Squarespace-managed DNS pattern is already used for another alexlford.com subdomain. It keeps this static application self-contained while still clearly belonging to alexlford.com.

## Why the subdomain works well

- It mirrors an existing deployment pattern already used under alexlford.com.
- The Map gets full control of viewport sizing, Leaflet resize behavior, browser history, and mobile layout.
- The static app can deploy independently of the main Squarespace site.
- Individual records can have clean direct URLs.
- DNS/canonical changes stay isolated from the primary alexlford.com website.
- Search metadata, sitemap generation, and redirects can be managed entirely within this repository.

## Public information architecture

The public front door is intentionally simple:

- `/` — **Home**
- `/explore` — **Explore**
- `/map` — **Map**
- `/stories` — **Stories**

Explore opens the deeper activity chapters:

- `/races` — Races
- `/summits` — Summits
- `/skiing` — Skiing
- `/nordic` — Nordic
- `/mtb` — Mountain Biking
- `/timeline` — full chronology

Individual records use:

- `/record/<slug>/` — canonical record identity

The old static `.html` and `detail.html?record=...` forms remain compatibility/rendering routes, not the intended public information architecture.

## Deployment requirements

Production metadata should be generated with:

```bash
SITE_URL=https://adventures.alexlford.com npm run build:public-index
```

This writes `sitemap.xml` and `robots.txt` for the production host. CI verifies that committed public-index files match the configured/default deployment base.

## Deployment sequence

1. Keep `alexlford.github.io/adventure-map/` as the staging site.
2. Complete visual/mobile QA against staging and the custom domain.
3. Keep the GitHub Pages custom domain set to `adventures.alexlford.com`.
4. In Squarespace DNS, keep only the `adventures` CNAME required for this site, pointing to `alexlford.github.io`.
5. Confirm DNS resolution and HTTPS/TLS without changing the root `alexlford.com` site.
6. Enable GitHub Pages **Enforce HTTPS** once the certificate is available.
7. Regenerate production sitemap/robots if deployment metadata changes.
8. Add a clear **Adventures** entry point on the main alexlford.com site.
9. Keep the GitHub Pages repository URL available as staging/testing rather than promoting it publicly.

## DNS guardrails

- Do not modify root `alexlford.com` records merely to operate Adventures.
- The Squarespace record should be `CNAME adventures -> alexlford.github.io` with no protocol, path, or repository name in Alias Data.
- Do not remove or overwrite the existing `sports.alexlford.com` record.
- Verify TLS/HTTPS on Adventures independently of the main site.

## Routing behavior

GitHub Pages is a static host. `404.html` recognizes clean routes such as `/record/<slug>/`, forwards internally to the shared detail renderer, and the renderer restores the clean production identity after its relative data/map assets have loaded.

If the hosting platform ever gains true rewrite support, the preferred future implementation is a transparent rewrite from `/record/<slug>/` to the record renderer without a browser redirect.

## Main-site language

The alexlford.com navigation/link should simply say **Adventures**. Avoid resurrecting “Personal Adventure Almanac” or “Adventure Almanac” in public labels. Within Adventures, use **Stories**, **Explore**, **Map**, **Timeline**, **records**, and **archive** where those terms are more precise.

## Do not do

- Do not point the apex/root domain at GitHub Pages.
- Do not point the CNAME at `alexlford.github.io/adventure-map`; GitHub requires the user-site hostname only.
- Do not index query-string compatibility URLs as permanent canonical identities.
- Do not iframe Adventures inside the Squarespace site.
