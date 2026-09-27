# Media quality policy

Phase 3 keeps the existing static publishing architecture and improves media incrementally rather than introducing a heavyweight image service.

## Current guarantees

- Canonical photo identity and repository paths live in `data/event-photo-manifest.json`.
- Restored originals retain their verified pixel dimensions in the manifest when known.
- Homepage images use explicit `width` and `height` when those dimensions are verified, plus `decoding="async"` for non-blocking decode.
- Below-the-fold images remain lazy-loaded; the lead hero keeps high fetch priority.
- Record media continue to require descriptive alternative text before rendering.

## Next enrichment step

When more original assets are recovered, add verified dimensions to the manifest first. Responsive derivatives (for example 400/800/1200/1600 widths and modern formats) should be generated from those originals in a deterministic build step, not hand-authored or inferred from previews.

This keeps the source image as the archival object and treats optimized variants as reproducible publication artifacts.
