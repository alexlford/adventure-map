# Route detail quality floor

`data/route-detail-quality-floor.json` is an anti-regression contract for source-backed public route detail.

The floor currently protects records whose best published detail is either `full-source` or `rdp-3m`. A protected record may move to a better quality, but `npm run validate:route-detail-audit` fails if it becomes coarser, disappears from the route-detail index, or stops resolving to a public record.

This is intentionally record-level rather than a percentage target. A new high-quality route cannot hide an unrelated downgrade elsewhere in the catalog.

## After a verified route upgrade

1. Materialize and review the intended source route.
2. Rebuild publication artifacts and the route-detail index.
3. Run the full validation stack.
4. Promote the quality floor:

   ```bash
   npm run update:route-detail-quality-floor
   ```

5. Commit the upgraded route, generated index, and updated floor together.

The floor updater is monotonic. It can add newly source-backed records and promote an existing floor from `rdp-3m` to `full-source`, but it does not lower or remove an existing floor when the current index is worse or missing. That makes accidental regressions fail closed instead of becoming the new baseline.

If a protected public record is intentionally retired or its quality policy must genuinely change, edit the floor explicitly as part of the reviewed change rather than using the updater to erase the protection.
