# Static publishing

Adventures publishes clean URLs as real files in the GitHub Pages source tree.

## Source and generated layers

Authoritative archive evidence remains in `data/catalog.json` and its source, match, override, relationship, and route layers. `scripts/build-public-records.mjs` resolves those layers with the same precedence, tombstone, override, shared-Strava-activity deduplication, slug, and normalization rules used by the browser catalog and writes the deterministic browser-facing artifact `data/public-records.json`.

`scripts/build-static-site.mjs` then materializes:

- `map/index.html`
- `explore/index.html`
- `timeline/index.html`
- `stories/index.html`
- `races/index.html`
- `summits/index.html`
- `skiing/index.html`
- `nordic/index.html`
- `mtb/index.html`
- `record/<slug>/index.html` for every public record

The generated documents include a root `<base>` so CSS, JavaScript, data, route, and image assets continue to resolve from the repository root. Record documents also contain static title, description, canonical, and Open Graph metadata before JavaScript runs. `record-renderer.js` supplies the full interactive record body in one deterministic pass.

## Publication index

`npm run build:publish` rebuilds `data/public-records.json`, all clean-path documents, `sitemap.xml`, and `robots.txt`. The sitemap includes every public record URL.

`npm run validate:static` verifies generated directories exactly match the canonical public slug set, checks metadata and renderer loading, checks sitemap coverage, and rejects a 404 page that performs client-side route rescue.

## GitHub Pages materialization

The site currently uses GitHub Pages' legacy root-source publishing mode. `.github/workflows/materialize-static-publishing.yml` is therefore intentionally scoped to the static-publishing development branch: it materializes and commits generated outputs so the PR and eventual merge contain the exact files Pages will serve. Normal CI rebuilds those artifacts and fails if the committed tree drifts from the generator.

After this architecture is merged, future archive changes should run `npm run build:publish` before merge so new records receive their clean page and sitemap entry automatically.
