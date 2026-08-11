# Static publishing architecture

Adventures is authored from the provenance-rich source tree but deployed as a generated static site.

## Deployment artifact

`npm run build:site` creates the public artifact. The generated site includes:

- `/index.html`
- `/explore/index.html`
- `/map/index.html`
- `/stories/index.html`
- `/timeline/index.html`
- `/races/index.html`
- `/summits/index.html`
- `/skiing/index.html`
- `/nordic/index.html`
- `/mtb/index.html`
- `/record/<slug>/index.html` for every public record
- compiled browser-facing records, relationships, routes, and Map entities under `/data/`
- a generated `sitemap.xml` containing every clean section URL and every public record URL
- `robots.txt`, CNAME, media, styles, JavaScript, and other public runtime assets

The source `.html` files remain in the artifact as compatibility URLs, but their canonical metadata points to the clean routes.

## Generated runtime

Generated pages set `window.ADVENTURE_PUBLIC_BUILD=true`. In that mode the browser reads the compiled publication layer rather than reconstructing the provenance model on every visit:

- `data/public-records.json` for records and relationships;
- `data/public-routes.geojson` for route geometry and route provenance overrides;
- `data/public-map-entities.json` for ski-resort Map entities.

The source development mode continues to read the provenance-rich catalog and route manifests directly.

## Static metadata

Every generated section document receives a static description, canonical URL, Open Graph metadata, and Twitter metadata. Every generated record document receives its record-specific title, description, canonical URL, Open Graph URL/title/description/type, and Twitter title/description before JavaScript runs. The browser renderer still supplies the interactive record body after load.

## Source of truth

Generated files are disposable publication outputs. The source of truth remains:

- `data/catalog.json` and its ordered provenance layers;
- `data/route-catalog.json` and route evidence;
- record relationships, World Marathon Majors metadata, ski data, and media references;
- the source HTML/CSS/JavaScript templates.

Do not hand-edit generated pages or compiled publication data.

## Validation

CI tests both forms of the site:

1. the authoring/source tree, to preserve local development and data behavior;
2. the generated static artifact, to verify that clean section and record URLs are real HTTP 200 documents, static metadata exists before JavaScript executes, the generated Map and record pages use compiled publication data, direct record rendering works, and the deployment sitemap includes every public record.

This removes clean-route correctness from the custom 404 page. The 404 document remains only as a compatibility fallback; normal clean routes do not depend on it.

## GitHub Pages activation

`.github/workflows/deploy-pages.yml` is intentionally `workflow_dispatch` only during migration. It validates the source, builds `dist`, uploads exactly that static artifact, and deploys through the `github-pages` environment.

Before the first deployment, change the repository's Pages publishing source from the current branch-based configuration to **GitHub Actions** in **Settings → Pages → Build and deployment → Source**. Then run **Deploy Adventures static site** manually from Actions. Keep the current custom domain configured in Pages settings; the generated artifact also retains the repository `CNAME` file.

After the generated deployment is verified on the custom domain, the deploy workflow can be changed from manual-only to automatic deployment on pushes to `main`.
