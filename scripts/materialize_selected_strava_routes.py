#!/usr/bin/env python3
"""Materialize a reviewed subset of canonical Strava GPS routes.

The bulk materializer is intentionally deterministic and rewrites all generated
full-resolution shards. This companion command is for surgical upgrades: select
one or more already-reviewed canonical Strava features (or their public record
owners), inspect exactly what the export contains, and write only that subset.

Examples:
  npm run materialize:strava-routes:selected -- /path/to/export.zip \
    --feature-id strava-14522257426 --dry-run

  npm run materialize:strava-routes:selected -- /path/to/export.zip \
    --adventure-id colfax-marathon-2025 \
    --output data/strava-route-full-resolution-colfax-marathon-2025.json \
    --register

No geometry is synthesized or simplified. Route encoding and discontinuity
handling are delegated to the same source-preserving functions used by the bulk
materializer.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from materialize_strava_routes import DATA, ROOT, Export, encoded_route, read_json


def canonical_feature_specs(catalog: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Return the reviewed canonical Strava feature inventory keyed by feature ID."""
    specs: dict[str, dict[str, Any]] = {}
    for rel in catalog.get("routeFiles", []):
        collection = read_json(ROOT / rel)
        for feature in collection.get("features", []):
            feature_id = feature.get("id") or feature.get("properties", {}).get("featureId")
            feature_id = str(feature_id or "")
            if not re.fullmatch(r"strava-\d+", feature_id):
                continue
            props = dict(feature.get("properties") or {})
            override = catalog.get("featureOverrides", {}).get(feature_id, {})
            adventure_ids = override.get("adventureIds", props.get("adventureIds", []))
            specs[feature_id] = {
                "featureId": feature_id,
                "activityId": str(props.get("stravaActivityId") or feature_id[7:]),
                "adventureIds": [str(value) for value in adventure_ids],
                "category": props.get("category"),
                "mtbMode": props.get("mtbMode"),
            }
    return specs


def select_specs(
    specs: dict[str, dict[str, Any]],
    feature_ids: list[str],
    adventure_ids: list[str],
) -> list[dict[str, Any]]:
    """Select canonical specs in stable order and fail closed on unknown selectors."""
    requested_features = list(dict.fromkeys(str(value).strip() for value in feature_ids if str(value).strip()))
    requested_adventures = list(dict.fromkeys(str(value).strip() for value in adventure_ids if str(value).strip()))

    missing_features = [feature_id for feature_id in requested_features if feature_id not in specs]
    if missing_features:
        raise ValueError(f"Unknown canonical Strava feature(s): {', '.join(missing_features)}")

    matched_adventures: set[str] = set()
    selected_ids: list[str] = []
    selected_set: set[str] = set()

    def add(feature_id: str) -> None:
        if feature_id not in selected_set:
            selected_ids.append(feature_id)
            selected_set.add(feature_id)

    for feature_id in requested_features:
        add(feature_id)

    for feature_id, spec in specs.items():
        owners = set(spec.get("adventureIds") or [])
        matches = owners.intersection(requested_adventures)
        if matches:
            matched_adventures.update(matches)
            add(feature_id)

    missing_adventures = [adventure_id for adventure_id in requested_adventures if adventure_id not in matched_adventures]
    if missing_adventures:
        raise ValueError(
            "No canonical Strava feature owns public record(s): " + ", ".join(missing_adventures)
        )

    return [specs[feature_id] for feature_id in selected_ids]


def build_selected_routes(
    export: Export,
    selected: list[dict[str, Any]],
    max_gap_m: float,
) -> list[dict[str, Any]]:
    routes: list[dict[str, Any]] = []
    for spec in selected:
        owners = list(spec.get("adventureIds") or [])
        if not owners:
            raise ValueError(
                f"{spec['featureId']}: selected canonical route has no public adventureIds ownership"
            )
        routes.append(encoded_route(
            export,
            spec["featureId"],
            [spec["activityId"]],
            owners,
            spec.get("category"),
            spec.get("mtbMode"),
            max_gap_m,
        ))
    return routes


def summary_rows(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "featureId": route["id"],
            "adventureIds": route["adventureIds"],
            "stravaActivityIds": route["stravaActivityIds"],
            "sourceFiles": route["sourceFiles"],
            "sourcePointCount": route["sourcePointCount"],
            "retainedPointCount": route["retainedPointCount"],
            "lineCount": len(route["lines"]),
            "sampling": route["sampling"],
        }
        for route in routes
    ]


def resolve_output_path(raw: str) -> Path:
    path = Path(raw).expanduser()
    return path if path.is_absolute() else ROOT / path


def repository_relative_output(path: Path) -> str:
    try:
        rel = path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError as exc:
        raise ValueError("--register requires --output to be inside the repository") from exc
    if not rel.startswith("data/"):
        raise ValueError("--register requires --output under data/")
    if "full-resolution" not in Path(rel).name.lower():
        raise ValueError("Registered selected route files must include 'full-resolution' in the filename")
    return rel


def register_output(catalog: dict[str, Any], output_path: Path) -> bool:
    rel = repository_relative_output(output_path)
    files = list(catalog.get("polylineFiles", []))
    if rel in files:
        return False
    catalog["polylineFiles"] = files + [rel]
    (DATA / "route-catalog.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize selected reviewed Strava routes.")
    parser.add_argument("source", help="Strava export ZIP or extracted export directory")
    parser.add_argument(
        "--feature-id",
        action="append",
        default=[],
        help="Canonical feature ID to materialize (repeatable, e.g. strava-14522257426).",
    )
    parser.add_argument(
        "--adventure-id",
        action="append",
        default=[],
        help="Public record ID whose canonical Strava feature should be materialized (repeatable).",
    )
    parser.add_argument("--output", help="Output JSON path. Required unless --dry-run is used.")
    parser.add_argument("--register", action="store_true", help="Add --output to route-catalog polylineFiles.")
    parser.add_argument("--force", action="store_true", help="Allow replacing an existing output file.")
    parser.add_argument("--dry-run", action="store_true", help="Inspect selected source geometry without writing files.")
    parser.add_argument(
        "--max-gap-m",
        type=float,
        default=180.0,
        help="Start a new line when consecutive source GPS points are farther apart than this (default: 180 m).",
    )
    args = parser.parse_args()

    if args.max_gap_m <= 0:
        raise SystemExit("--max-gap-m must be positive")
    if not args.feature_id and not args.adventure_id:
        raise SystemExit("Select at least one --feature-id or --adventure-id")
    if not args.dry_run and not args.output:
        raise SystemExit("--output is required unless --dry-run is used")
    if args.register and args.dry_run:
        raise SystemExit("--register cannot be combined with --dry-run")
    if args.register and not args.output:
        raise SystemExit("--register requires --output")

    output = resolve_output_path(args.output) if args.output else None
    if args.register:
        assert output is not None
        try:
            repository_relative_output(output)
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc

    catalog = read_json(DATA / "route-catalog.json")
    specs = canonical_feature_specs(catalog)
    try:
        selected = select_specs(specs, args.feature_id, args.adventure_id)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    if not selected:
        raise SystemExit("No canonical Strava routes matched the requested selectors")

    export = Export(Path(args.source).expanduser())
    try:
        routes = build_selected_routes(export, selected, args.max_gap_m)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    summary = summary_rows(routes)
    print(json.dumps({"routeCount": len(routes), "routes": summary}, indent=2))
    if args.dry_run:
        return

    assert output is not None
    if output.exists() and not args.force:
        raise SystemExit(f"Output already exists: {output}. Pass --force to replace it.")
    output.parent.mkdir(parents=True, exist_ok=True)
    sampling = f"full-source-track-gap-split-{args.max_gap_m:g}m"
    payload = {
        "encoding": "google-polyline5",
        "source": "Strava account export",
        "sampling": sampling,
        "routes": routes,
    }
    output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {output}")

    if args.register:
        added = register_output(catalog, output)
        rel = repository_relative_output(output)
        if added:
            print(f"Registered {rel} in data/route-catalog.json")
        else:
            print(f"Route catalog already references {rel}")
        print("Run npm run build:publish so data/route-detail-index.json selects the new full-source geometry.")


if __name__ == "__main__":
    main()
