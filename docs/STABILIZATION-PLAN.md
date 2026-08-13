# Architecture Stabilization Plan

## Objective

Strengthen the Adventure Map foundation before the next major feature wave. Preserve current behavior while reducing architectural drift, clarifying ownership boundaries, and making route and record growth predictable.

## Phase 1 — One quality gate

Status: in progress on `agent/architecture-stabilization`.

- Centralize validation under `npm run check`.
- Ensure browser tests start and stop their own static server.
- Make CI execute the same repository-level quality gate used locally.
- Keep generated-artifact verification as a final publication check.

Exit criterion: pull-request CI passes using the unified quality gate.

## Phase 2 — Map runtime consolidation

- Inventory map scripts by responsibility and dependency.
- Move new consumers behind `window.AdventureMap` rather than browser globals.
- Consolidate route rendering, focus, URL state, touch, keyboard, and responsive behavior into explicit map-owned modules.
- Preserve API version 1 and existing regression contracts during the migration.

Exit criterion: no generic map patch layer is required for normal feature development, and all existing map tests remain green.

## Phase 3 — Styling consolidation

- Establish shared tokens for activity colors, typography, spacing, borders, map treatments, and reusable surfaces.
- Identify overlapping rules across base, map, chapter, editorial, passport, and polish stylesheets.
- Move component rules into the owning stylesheet and retire obsolete override layers incrementally.

Exit criterion: activity colors and core visual tokens each have one authoritative definition.

## Phase 4 — Record and geometry contract hardening

- Keep one canonical public Adventure record contract across activity types.
- Add typed extension points instead of parallel record models.
- Preserve source-quality GPS geometry and derive display simplifications from it.
- Add explicit route-quality metadata where useful for choosing overview versus detailed geometry.

Exit criterion: adding a new activity type or denser GPS source primarily changes data/configuration rather than application architecture.

## Phase 5 — Repository organization

- Separate source-oriented code, build tooling, generated artifacts, and presentation modules more clearly.
- Explicitly classify legacy compatibility entrypoints versus canonical generated routes.
- Keep redirects and compatibility pages only when they have a documented purpose.

Exit criterion: a new contributor can identify the source of truth, generated outputs, browser runtime, and validation path without tracing page-specific patches.

## Development rule during stabilization

Avoid large feature additions that introduce new architectural patterns. Small data corrections, content additions, and regression fixes may continue as long as they use existing contracts and pass `npm run check`.
