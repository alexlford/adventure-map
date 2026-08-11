# Record rendering architecture

Every canonical Adventures record is rendered through one explicit browser pipeline owned by `record-renderer.js`.

## Contract

The detail page loads shared site utilities, route support, Leaflet, and the renderer. It does not load record-type patch scripts or dynamically inject detail JavaScript after the page starts rendering.

The renderer performs these steps once:

1. Resolve the record key from the staging query string or clean production path.
2. Load the canonical record catalog, relationships, and World Marathon Majors metadata.
3. Determine the record collection and record type.
4. Compose the complete page markup in deterministic order.
5. Insert the page once.
6. Initialize the route/location map against the canonical merged route collection.
7. Finalize metadata and the clean production record URL.

There are no `MutationObserver` composition passes and no delayed cleanup passes.

## Module composition

The controller treats the existing visual sections as pure render modules:

- base hero, metrics, profile, related-record context, route map, and chronology;
- race dossier;
- summit dossier;
- MTB and Nordic outing dossier;
- Story editorial/objective anatomy;
- World Marathon Majors passport detail;
- record photo essay and companion context.

A Story is composed as a Story from the start. Generic metrics/profile sections are never rendered and then removed. Likewise, World Major and media sections are placed during the initial composition instead of waiting for DOM anchors to appear.

## Data precedence

Rendering does not alter the catalog's evidence rules. Official race results own official time/distance/placement when available. Strava/GPS remains route and recorded-activity evidence. Route provenance comes from `AdventureRoutes` and `data/route-catalog.json`.

## Regression protection

`tests/detail-record-classes.spec.mjs` discovers representative records from the current catalog and exercises race, World Major, summit, MTB outing, Nordic outing, Story, and event detail pages. The suite fails on runtime errors and checks that type-specific modules appear where expected.

`scripts/validate-routing.mjs` also enforces the structural contract: the unified renderer must remain active, the retired detail patch files must remain absent, and the renderer may not reintroduce observer-based composition.

## Extending the detail page

When a new record-specific presentation is needed, add a pure render function to the explicit composition path and add browser coverage for the condition that activates it. Do not add a script that waits for another renderer to create DOM and then mutates that DOM afterward.
