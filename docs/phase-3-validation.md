# Phase 3 validation

Phase 3 is protected by the existing publication and browser gates plus two freshness-specific checks:

- `npm run validate:archive-additions` verifies record references, first-seen dates, source provenance, sort order, and featured uniqueness.
- `npm run validate:home-freshness` verifies the static homepage fallback matches the featured addition in the ledger.
- Playwright covers JavaScript-enhanced Recently Added rendering, archive snapshot hydration, no-JavaScript freshness fallback, and verified homepage image dimensions.

The normal `npm run check` remains the release gate.
