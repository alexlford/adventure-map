# Route detail upgrade workflow

The map keeps lightweight overview geometry for normal browsing and loads denser route detail when a record is focused or the map is zoomed in. Route quality should therefore improve by promoting reviewed personal GPS sources to `full-source`, not by adding synthetic points to coarse lines.

## Current high-priority full-source candidates

The August 2026 Strava export audit identified the following visible records as strong first upgrades. Each already has canonical public ownership and a usable source track, but the route-detail index currently selects an `rdp-3m` derivative.

| Public record | Feature ID | Export format | Source points | Current detail | Target |
| --- | --- | --- | ---: | --- | --- |
| Colfax Marathon 2025 | `strava-14522257426` | FIT.GZ | 3,835 | `rdp-3m` | `full-source` |
| Boulderthon 2024 | `strava-12535362010` | FIT.GZ | 3,829 | `rdp-3m` | `full-source` |
| Chicago Marathon 2021 | `strava-6094685711` | FIT.GZ | 3,666 | `rdp-3m` | `full-source` |
| Kansas City Marathon 2019 | `strava-4312788772` | FIT.GZ | 3,618 | `rdp-3m` | `full-source` |
| Clingmans Dome | `strava-5301627345` | FIT.GZ | 2,161 | `rdp-3m` | `full-source` |

The 180 m discontinuity rule retains every recorded point in this batch. Chicago is emitted as two source-derived lines because its recording contains a gap large enough that drawing a connector would fabricate geometry.

## Inspect before writing

Use the selective materializer to decode only the intended records and report source files, point counts, retained counts, and line counts without changing the repository:

```bash
npm run materialize:strava-routes:selected -- /path/to/export.zip \
  --feature-id strava-14522257426 \
  --feature-id strava-12535362010 \
  --feature-id strava-6094685711 \
  --feature-id strava-4312788772 \
  --feature-id strava-5301627345 \
  --dry-run
```

Selection can also use a stable public record ID, for example:

```bash
npm run materialize:strava-routes:selected -- /path/to/export.zip \
  --adventure-id colfax-marathon-2025 \
  --dry-run
```

Unknown feature IDs or public record IDs fail closed instead of silently producing a partial batch.

## Materialize and register the batch

After reviewing the dry-run output, write the selected full-source derivatives and register the file with the route catalog:

```bash
npm run materialize:strava-routes:selected -- /path/to/export.zip \
  --feature-id strava-14522257426 \
  --feature-id strava-12535362010 \
  --feature-id strava-6094685711 \
  --feature-id strava-4312788772 \
  --feature-id strava-5301627345 \
  --output data/strava-route-full-resolution-priority-2026-08.json \
  --register

npm run build:publish
npm run check
```

The command refuses to replace an existing output unless `--force` is explicit. Registered outputs must remain under `data/` and include `full-resolution` in the filename so the deterministic route-detail index assigns the intended quality tier.

Do not hand-edit or copy encoded polylines between systems. Regenerate them from the authoritative export with the repository tooling so the encoded bytes, source point counts, gap splitting, and provenance remain reproducible.

## Next density tier

Several mountain routes have much larger source tracks and should be promoted after the first batch confirms the repository-size and browser-detail behavior at full source resolution. The current audit found approximately 15,965 to 24,186 source points for Mount Sherman, Mount Evans, Haleakala, Mount Le Conte, DeCaLiBron, and Mauna Kea. Those are intentionally a second tier rather than being bulk-promoted without measuring payload and interaction performance.
