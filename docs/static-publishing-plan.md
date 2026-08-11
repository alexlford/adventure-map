# Static publishing architecture

Adventures is authored from the provenance-rich source tree but should be deployed as a generated static site.

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
- compiled browser-facing records, routes, and Map entities under `/data/`
- a generated `sitemap.xml` containing every clean section URL and every public record URL
- `robots.txt`, CNAME, media, styles, JavaScript, and other public runtime assets

The source `.html` files remain in the artifact as compatibility URLs, but their canonical metadata points to the clean routes.

## Record metadata

Every generated record document has its title, description, canonical URL, Open Graph URL/title/description/type, and Twitter title/description written into the HTML before JavaScript runs. The browser renderer still supplies the interactive body after load.

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
2. the generated static artifact, to verify that clean section and record URLs are real HTTP 200 documents, record metadata exists before JavaScript executes, direct record rendering works, and the deployment sitemap includes every public record.

This removes clean-route correctness from the custom 404 page. The 404 document may remain as a compatibility fallback, but normal clean routes no longer depend on it.
