# Phase 3 — Alive

Phase 3 makes the archive feel current and personal without changing its static architecture.

## Implemented in this slice

- A persistent archive-additions ledger separates "recently added" from event chronology.
- Homepage Recently Added is driven from that ledger, with a static fallback that remains useful without JavaScript.
- The homepage keeps Explore immediately below the hero, then surfaces archive freshness, favorite memories, a compact archive snapshot, and the active World Marathon Majors pursuit.
- Archive snapshot counts reuse the Phase 1 archive-health report instead of creating a second definition of route/photo completeness.
- Known homepage image dimensions are emitted when verified by the photo manifest, with async decoding and lazy loading below the fold.
- Validation covers ledger integrity, homepage/ledger parity, and browser behavior.

## Media direction

The archival original remains the source object. More responsive sizes and modern formats should be deterministic publication artifacts generated only after source dimensions are verified. See `docs/media-pipeline.md`.
