# Route quality policy

Personal GPS routes are published from recorded source geometry. The site must improve fidelity when better source data exists, but it must not create synthetic points merely to make a line look smoother.

The route-quality audit uses two acceptable classes:

- **high-resolution**: the published route meets the zoom-detail spacing and point-density targets.
- **source-limited-complete**: the source recording itself is sparser than the high-resolution target, but the publication retains essentially all available source samples.

Split features that belong to one recorded route are audited together as one route family. This prevents short gap-boundary fragments from being misclassified as standalone low-quality routes.

A route is a CI failure only when it is neither high-resolution nor source-complete. This makes the quality gate strict about preventable simplification while remaining faithful to legacy recordings whose original sampling cadence cannot be improved without fabricating geometry.
