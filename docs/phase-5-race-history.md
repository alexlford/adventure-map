# Phase 5 — Race history

The Races chapter now uses a build-time `data/race-history.json` artifact derived from the canonical public archive and relationship data. It powers year-by-year race volume and known mileage, discipline mix, marathon chronology, recurring race series, most-raced places, and conservative summary metrics without duplicating archive logic in the browser.

The generated artifact is materialized and committed by the static-publication workflow, validated for freshness in CI, and covered by browser tests on desktop and phone-width layouts.
