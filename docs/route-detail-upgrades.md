# Route detail upgrade workflow

The map keeps lightweight overview geometry for normal browsing and loads denser route detail when a record is focused or the map is zoomed in. Route quality should therefore improve by promoting reviewed personal GPS sources to `full-source`, not by adding synthetic points to coarse lines.

## Current reviewed priority batch

The current priority is a mixed set of raw Strava features and stable activity-day wrappers. All six currently resolve to `rdp-3m`; the authoritative Strava export contains clean full-source tracks for each.

| Public record | Feature ID | Export format | Source points | Full-source lines | Current detail | Target |
| --- | --- | --- | ---: | ---: | --- | --- |
| Clingmans Dome | `strava-5301627345` | FIT.GZ | 2,161 | 1 | `rdp-3m` | `full-source` |
| Frisco Nordic — 2023-01-28 | `activity-nordic-day-2023-01-28` | GPX | 3,949 | 1 | `rdp-3m` | `full-source` |
| Breckenridge Nordic — 2023-01-08 | `activity-nordic-day-2023-01-08` | GPX | 1,422 | 1 | `rdp-3m` | `full-source` |
| Breckenridge Nordic — 2023-01-11 | `activity-nordic-day-2023-01-11` | GPX | 1,028 | 1 | `rdp-3m` | `full-source` |
| Breckenridge Nordic — 2023-01-21 | `activity-nordic-day-2023-01-21` | GPX | 1,075 | 1 | `rdp-3m` | `full-source` |
| Haleakalā | `strava-4854788986` | FIT.GZ | 17,479 | 1 | `rdp-3m` | `full-source` |

The 180 m discontinuity rule retains every recorded point in this batch. No synthetic connector or interpolation is required.

The stable `activity-*` feature IDs are sourced from `data/activity-days.json`. Generated RDP/full-resolution files are outputs only and must never become the specification for their own replacement.

## Inspect before writing

Use the selective materializer to decode only the intended records and report source files, point counts, retained counts, and line counts without changing the repository:

```bash
npm run materialize:strava-routes:selected -- /path/to/export.zip \
  --feature-id strava-5301627345 \
  --feature-id activity-nordic-day-2023-01-28 \
  --feature-id activity-nordic-day-2023-01-08 \
  --feature-id activity-nordic-day-2023-01-11 \
  --feature-id activity-nordic-day-2023-01-21 \
  --feature-id strava-4854788986 \
  --dry-run
```

Selection can also use stable public record IDs, including activity-day records:

```bash
npm run materialize:strava-routes:selected -- /path/to/export.zip \
  --adventure-id nordic-day-2023-01-28 \
  --dry-run
```

Unknown feature IDs or public record IDs fail closed instead of silently producing a partial batch.

## Materialize and register

Prefer one lazy-loaded output file per upgraded route. This keeps focused-record downloads small and avoids forcing a Haleakalā view to download unrelated Colorado geometry.

For example:

```bash
npm run materialize:strava-routes:selected -- /path/to/export.zip \
  --feature-id activity-nordic-day-2023-01-28 \
  --output data/strava-route-full-resolution-frisco-nordic-2023-01-28.json \
  --register

npm run build:publish
npm run check
```

Repeat for the reviewed routes, then regenerate publication artifacts and advance the route-detail quality floor only after the deterministic index selects the new `full-source` files.

The command refuses to replace an existing output unless `--force` is explicit. Registered outputs must remain under `data/` and include `full-resolution` in the filename so the deterministic route-detail index assigns the intended quality tier.

Do not hand-edit or copy encoded polylines between systems. Regenerate them from the authoritative export with the repository tooling so the encoded bytes, source point counts, gap splitting, and provenance remain reproducible.

## Subsequent candidates

After the current batch, continue ranking upgrades by visible quality improvement first and source density second. Strong candidates already identified include Colfax Marathon 2025, Boulderthon 2024, Chicago Marathon 2021, Kansas City Marathon 2019, Mount Sherman, Mount Evans, Mount Le Conte, DeCaLiBron, and Mauna Kea.
