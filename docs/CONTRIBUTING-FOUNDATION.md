# Foundation Development Rules

During the architecture stabilization cycle:

1. Prefer extending existing contracts over creating parallel implementations.
2. New map consumers use the `AdventureMap` facade instead of direct access to map globals.
3. Preserve source-quality GPS geometry; derive lighter display geometry rather than replacing the source route.
4. Avoid new generic `fix`, `polish`, or override files when behavior belongs in an existing module or component.
5. Treat stable IDs and slugs as compatibility contracts.
6. Generated public artifacts must remain reproducible from source data and build scripts.
7. Run `npm run check` before a change is considered complete.

These rules are intended to preserve current behavior while the internal structure is consolidated incrementally.
