# Record renderer migration plan

Phase 4 replaces the current detail-page mutation stack with one explicit render pipeline while preserving the existing visual modules and record semantics.

## Target flow

1. Resolve the record key.
2. Load canonical records and relationships once.
3. Load optional module data needed by the resolved record type.
4. Build the base record view.
5. Compose record-type modules in a deterministic order.
6. Render the page once.
7. Initialize the route map and any progressive media behavior.
8. Publish final metadata and clean production URL.

## Module order

- Base hero and record facts
- Type dossier: race, summit, MTB/Nordic outing, or Adventure
- World Marathon Majors dossier when applicable
- Story objective/editorial module for Adventure records
- Media and companions when present
- Related records
- Course/location map
- Chronology navigation

## Migration constraints

- Preserve existing public content and visual classes during the architecture change.
- Do not invent narrative or media.
- Do not use `MutationObserver` or timeout-based cleanup to compose record content.
- Do not load the canonical record archive independently in each module.
- Keep official race results authoritative over GPS values.
- Preserve Story-specific removal of generic metrics/profile by choosing the correct initial composition rather than rendering and deleting those sections.
- Keep route provenance and privacy behavior unchanged.

## Regression gate

The browser suite must cover representative race, World Major, summit, MTB outing, Nordic outing, Story, and generic Adventure records before the old mutation modules are removed.
