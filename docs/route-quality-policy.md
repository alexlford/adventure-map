# Route quality policy

Personal GPS routes are published from recorded source geometry. The site must improve fidelity when better source data exists, but it must not create synthetic points merely to make a line look smoother.

The route-quality audit uses two acceptable classes:

- **high-resolution**: the published route meets the zoom-detail spacing and point-density targets.
- **source-limited-complete**: the source recording itself is sparser than the high-resolution target, but the publication retains essentially all available source samples.

Split features that belong to one recorded route are audited together as one route family. This prevents short gap-boundary fragments from being misclassified as standalone low-quality routes.

A route is a CI failure only when it is neither high-resolution nor source-complete. This makes the quality gate strict about preventable simplification while remaining faithful to legacy recordings whose original sampling cadence cannot be improved without fabricating geometry.

Full-source route archives may store Google polyline5 lines as Brotli-compressed base64 payloads. The publication build decodes selected compressed routes with Node and materializes the exact polyline5 strings into a browser-readable route-detail cache. Browsers therefore render the full source geometry without depending on native Brotli stream support and without downgrading to a lower-detail fallback. The generated browser cache is committed as a publication artifact and checked for staleness alongside the route-detail index.

## Public route-status invariant

Published route status is derived from the selected route-detail index, not trusted independently from older evidence-layer labels. Any public record with `full-source`, `reviewed-source`, or `rdp-3m` route detail must publish `routeStatus` and `routeInfo.status` as `gps`, and its selected feature ID must be present in `routeFeatureIds`. Explicit `withheld-privacy` decisions remain authoritative and are never promoted automatically.

The publication build synchronizes this invariant before downstream audits, static pages, and public indexes are generated, and validation fails if a source-backed public route later regresses to stale metadata such as `matched-no-public-route`.
