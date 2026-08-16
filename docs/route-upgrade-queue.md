# Strava route upgrade queue

Use the source audit before materializing additional full-resolution GPS routes:

```bash
npm run audit:strava-route-sources -- /path/to/export.zip
```

The audit is read-only. It matches reviewed canonical Strava route features to the supplied export, parses GPX/FIT/TCX source geometry, and ranks routes that can improve their current published detail.

Upgrade order is intentionally quality-first:

1. unindexed or overview/backfill routes;
2. catalog/story detail;
3. `rdp-3m` routes;
4. `full-source` routes are already complete and are not upgrade candidates.

Within the same quality tier, routes with more recoverable source GPS points rank first. This favors the largest visible fidelity gain without allowing a very dense but already-good RDP route to hide a coarse backfill route.

By default the audit prints the top 20 candidates plus a `SUGGESTED_DRY_RUN` command that passes those exact feature IDs to the selective materializer. Use `--limit 10` for a smaller reviewed batch or `--limit 0` to print all candidates.

Always inspect the dry-run output before writing geometry. Materialization remains a separate explicit step because route ownership and privacy review are part of the publication contract.
