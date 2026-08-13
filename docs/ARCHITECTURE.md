# Adventure Map Architecture

## Purpose

Adventure Map is a statically published, data-driven archive. The architecture should make it easy to add records, GPS detail, media, stories, and new activity types without requiring page-specific patches or weakening existing behavior.

## System boundaries

The repository follows four conceptual layers:

1. **Source data** — curated catalog data, evidence, corrections, raw or source-derived route geometry, and ingestion state.
2. **Build and normalization** — scripts that validate source material and compile stable public records, routes, indexes, and static pages.
3. **Public data contract** — schema-valid records and route references consumed by the browser. Generated public data is derived output, not an independent source of truth.
4. **Presentation runtime** — map, record, chapter, story, and navigation behavior that consumes the public contract.

Changes should move information through these layers rather than bypassing them.

## Canonical record rule

All public adventures should resolve to the shared record contract. Activity-specific behavior belongs in typed metadata, metrics, relationships, media, or presentation fields rather than separate competing record formats.

Stable IDs and slugs are compatibility contracts. Do not repurpose an existing ID or slug for a different real-world record.

## Geometry rule

Source geometry and display geometry are different concerns.

- Preserve the highest-quality route geometry available from the source.
- Normalize route coordinates during the build or ingestion pipeline.
- If simplified geometry is needed for overview performance, generate it from the canonical route rather than replacing the canonical route.
- Route quality, source provenance, and record references must remain independently auditable.

This allows the map to use lighter geometry at broad zoom levels while retaining detailed GPS geometry when users zoom in.

Supplemental browser-loaded routes must be normalized first and merged through the map runtime boundary. Extension scripts must not mutate the route collection or trigger core rendering directly.

## Generated artifacts

Generated files must be reproducible from source inputs and build scripts. They should never become the only place where meaningful record information exists.

`npm run build:publish` materializes public artifacts. CI verifies that committed generated artifacts are current.

## Runtime boundaries

`window.AdventureMap` is the supported, versioned public map facade. External or reusable consumers should use that API instead of reaching into map internals.

`window.AdventureMapRuntime` is a frozen **internal bridge for first-party map extensions**. It is not a public compatibility contract. It exists so legacy extension files can be consolidated incrementally without exposing mutable core state through the public facade.

First-party map extensions must not reach directly into ambient core bindings such as `state`, `CATEGORY`, `window.adventureMap`, `renderMarkers`, `renderPreservingFocus`, or similar implementation details. If an extension genuinely needs a core capability, add the smallest explicit operation to the internal runtime bridge and protect it with a regression test.

Current runtime migration covers:

- route-detail presentation and responsive map sizing
- keyboard accessibility
- coarse-pointer/touch interaction mode
- supplemental GPS route ingestion and merge behavior

Internal map behavior should continue moving toward explicit modules for:

- core state and rendering
- layers and route geometry
- interactions and focus
- accessibility and keyboard behavior
- responsive and touch behavior
- URL state
- presentation hooks for archive rows and popup content

Existing public API behavior is protected by regression tests while internals are consolidated. Runtime-boundary tests also prevent migrated first-party extensions from silently reintroducing direct global access.

## Styling boundaries

New visual work should prefer shared design tokens and component-level styles over another global patch stylesheet. Activity colors, spacing, typography, map treatments, and reusable card treatments should have one authoritative definition whenever practical.

Avoid adding new files whose primary role is a generic `fix`, `polish`, or override layer when the behavior can be incorporated into the owning component or module.

## Quality gate

`npm run check` is the repository-level acceptance gate. A change is not considered complete until this command succeeds.

Use `npm run check:fast` during iteration when browser coverage is not needed yet. The full gate includes publication builds, validators, maintenance-pipeline tests, and browser tests.

GitHub Actions executes the same repository gate so local and CI expectations do not diverge.

## Growth policy

Prefer extending data contracts, build transforms, and reusable components over creating another page-specific implementation. A new activity type should normally require data and presentation configuration, not a parallel architecture.

Major framework migration is not currently required. Static publishing remains the default architecture unless measured scale or product requirements demonstrate a concrete limitation.
