#!/usr/bin/env python3
"""Inspect and selectively publish the remaining legacy MTB routes from Strava.

The seven remaining MTB activity-day wrappers are locked to reviewed Strava
activity IDs and expected source point counts. Every source route is rebuilt
without simplification and with only genuine source gaps (>180 m by default)
split into separate rendered lines.

Point preservation is necessary but not sufficient for automatic publication.
Each recovered raw route is independently compared with the canonical
Strava-derived activity-day distance. Raw geometry no more than 5% longer than
the canonical distance is classified ``full-source-eligible``. Geometry above
that threshold is classified ``reviewed-source-required`` and is not published
by this command.

This per-route classification is deliberate: noisy GPS on one ride must not
block a different clean ride from being promoted to full-source. Routes that
need review remain on their existing published geometry until a corrected
GPS-backed representation is explicitly accepted as reviewed-source.

Usage:
  python3 scripts/materialize_remaining_mtb_routes.py /path/to/export.zip --dry-run
  python3 scripts/materialize_remaining_mtb_routes.py /path/to/export.zip --write
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any

from materialize_selected_strava_routes import canonical_feature_specs
from materialize_strava_routes import DATA, ROOT, Export, encoded_route, haversine_m, read_json


MAX_DISTANCE_INFLATION_PERCENT = 5.0
FULL_SOURCE_ELIGIBLE = "full-source-eligible"
REVIEWED_SOURCE_REQUIRED = "reviewed-source-required"

TARGETS: tuple[dict[str, Any], ...] = (
    {
        "featureId": "activity-mtb-day-2023-09-24",
        "activityIds": ["9914293414"],
        "sourcePointCount": 4614,
        "output": "data/strava-route-full-resolution-mtb-day-2023-09-24.json",
    },
    {
        "featureId": "activity-mtb-day-2024-07-27",
        "activityIds": ["11997305131"],
        "sourcePointCount": 10069,
        "output": "data/strava-route-full-resolution-mtb-day-2024-07-27.json",
    },
    {
        "featureId": "activity-mtb-day-2024-08-31",
        "activityIds": ["12292602651"],
        "sourcePointCount": 6104,
        "output": "data/strava-route-full-resolution-mtb-day-2024-08-31.json",
    },
    {
        "featureId": "activity-mtb-day-2025-09-28",
        "activityIds": ["15970284234"],
        "sourcePointCount": 7095,
        "output": "data/strava-route-full-resolution-mtb-day-2025-09-28.json",
    },
    {
        "featureId": "activity-mtb-day-2025-10-05",
        "activityIds": ["16044942747"],
        "sourcePointCount": 5687,
        "output": "data/strava-route-full-resolution-mtb-day-2025-10-05.json",
    },
    {
        "featureId": "activity-mtb-day-2026-05-24",
        "activityIds": ["18639468697", "18638006859"],
        "sourcePointCount": 5521,
        "output": "data/strava-route-full-resolution-mtb-day-2026-05-24.json",
    },
    {
        "featureId": "activity-mtb-day-2026-08-05",
        "activityIds": ["19618505573"],
        "sourcePointCount": 7981,
        "output": "data/strava-route-full-resolution-mtb-day-2026-08-05.json",
    },
)


def target_map() -> dict[str, dict[str, Any]]:
    return {str(item["featureId"]): dict(item) for item in TARGETS}


def decode_polyline(line: str) -> list[tuple[float, float]]:
    """Decode a Google polyline5 string into latitude/longitude pairs."""
    points: list[tuple[float, float]] = []
    index = 0
    latitude = 0
    longitude = 0
    while index < len(line):
        deltas: list[int] = []
        for _ in range(2):
            result = 0
            shift = 0
            while True:
                if index >= len(line):
                    raise ValueError("Encoded polyline is truncated")
                value = ord(line[index]) - 63
                index += 1
                result |= (value & 0x1F) << shift
                shift += 5
                if value < 0x20:
                    break
                if shift > 35:
                    raise ValueError("Encoded polyline value is invalid")
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        latitude += deltas[0]
        longitude += deltas[1]
        points.append((latitude / 1e5, longitude / 1e5))
    return points


def route_distance_km(route: dict[str, Any]) -> float:
    """Measure rendered recorded geometry without bridging source line breaks."""
    distance_m = 0.0
    lines = route.get("lines") or []
    if not isinstance(lines, list) or not lines:
        raise ValueError(f"{route.get('id', '(missing id)')}: route has no line geometry")
    for line in lines:
        if not isinstance(line, str) or not line:
            raise ValueError(f"{route.get('id', '(missing id)')}: route contains invalid line geometry")
        points = decode_polyline(line)
        for previous, point in zip(points, points[1:]):
            distance_m += haversine_m(previous, point)
    return distance_m / 1000.0


def canonical_activity_distances_km() -> dict[str, float]:
    """Return canonical Strava-derived activity-day distances keyed by route ID."""
    payload = read_json(DATA / "activity-days.json")
    distances: dict[str, float] = {}
    for record in payload.get("adventures", []):
        record_id = str(record.get("id") or "").strip()
        if not record_id:
            continue
        raw_distance = record.get("distanceKm")
        if raw_distance is None:
            continue
        distance = float(raw_distance)
        if distance > 0:
            distances[f"activity-{record_id}"] = distance
    return distances


def distance_review(route: dict[str, Any], canonical_distance_km: float) -> dict[str, Any]:
    """Return the fixed upper-bound raw-GPS fidelity review for one route."""
    if canonical_distance_km <= 0:
        raise ValueError("Canonical activity distance must be positive")
    raw_distance_km = route_distance_km(route)
    delta_percent = ((raw_distance_km / canonical_distance_km) - 1.0) * 100.0
    passes = delta_percent <= MAX_DISTANCE_INFLATION_PERCENT
    return {
        "rawDistanceKm": raw_distance_km,
        "canonicalDistanceKm": canonical_distance_km,
        "distanceDeltaPercent": delta_percent,
        "maxDistanceInflationPercent": MAX_DISTANCE_INFLATION_PERCENT,
        "passes": passes,
        "classification": FULL_SOURCE_ELIGIBLE if passes else REVIEWED_SOURCE_REQUIRED,
    }


def route_reviews(routes: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    canonical = canonical_activity_distances_km()
    reviews: dict[str, dict[str, Any]] = {}
    for route in routes:
        feature_id = str(route.get("id") or "")
        canonical_distance = canonical.get(feature_id)
        if canonical_distance is None:
            raise ValueError(f"{feature_id}: missing canonical activity-day distance")
        reviews[feature_id] = distance_review(route, canonical_distance)
    return reviews


def eligible_route_ids(reviews: dict[str, dict[str, Any]]) -> set[str]:
    return {
        feature_id
        for feature_id, review in reviews.items()
        if review.get("classification") == FULL_SOURCE_ELIGIBLE
    }


def build_routes(export: Export, catalog: dict[str, Any], max_gap_m: float) -> list[dict[str, Any]]:
    """Rebuild and source-validate all seven routes without deciding publication."""
    specs = canonical_feature_specs(catalog)
    routes: list[dict[str, Any]] = []
    for target in TARGETS:
        feature_id = str(target["featureId"])
        spec = specs.get(feature_id)
        if spec is None:
            raise ValueError(f"Missing canonical route specification for {feature_id}")
        expected_ids = [str(value) for value in target["activityIds"]]
        actual_ids = [str(value) for value in spec.get("activityIds") or []]
        if actual_ids != expected_ids:
            raise ValueError(
                f"{feature_id}: expected Strava activity IDs {expected_ids}, found {actual_ids}"
            )
        owners = [str(value) for value in spec.get("adventureIds") or []]
        if owners != [feature_id.removeprefix("activity-")]:
            raise ValueError(f"{feature_id}: unexpected public ownership {owners}")

        route = encoded_route(
            export,
            feature_id,
            expected_ids,
            owners,
            spec.get("category"),
            spec.get("mtbMode"),
            max_gap_m,
        )
        expected_points = int(target["sourcePointCount"])
        source_points = int(route.get("sourcePointCount") or 0)
        retained_points = int(route.get("retainedPointCount") or 0)
        if source_points != expected_points:
            raise ValueError(
                f"{feature_id}: source point count changed; expected {expected_points}, found {source_points}"
            )
        if retained_points != expected_points:
            raise ValueError(
                f"{feature_id}: source-preserving reconstruction would drop points; "
                f"expected {expected_points} retained, found {retained_points}"
            )
        sampling = str(route.get("sampling") or "")
        expected_sampling = f"full-source-track-gap-split-{max_gap_m:g}m"
        if sampling != expected_sampling:
            raise ValueError(f"{feature_id}: unexpected sampling {sampling!r}")
        routes.append(route)
    return routes


def update_catalog(catalog: dict[str, Any], published_feature_ids: set[str]) -> dict[str, Any]:
    """Register only routes actually accepted for full-source publication."""
    targets = target_map()
    unknown = sorted(published_feature_ids - set(targets))
    if unknown:
        raise ValueError(f"Unknown remaining-MTB publication target(s): {', '.join(unknown)}")

    updated = copy.deepcopy(catalog)
    polyline_files = list(updated.get("polylineFiles") or [])
    for feature_id in sorted(published_feature_ids):
        output = str(targets[feature_id]["output"])
        if output not in polyline_files:
            polyline_files.append(output)
    updated["polylineFiles"] = polyline_files

    quality = updated.setdefault("qualityExpectations", {})
    dense_routes = list(quality.get("denseRoutes") or [])
    by_id = {str(item.get("id")): item for item in dense_routes if item.get("id")}
    for feature_id in sorted(published_feature_ids):
        expected_points = int(targets[feature_id]["sourcePointCount"])
        item = by_id.get(feature_id)
        if item is None:
            item = {"id": feature_id}
            dense_routes.append(item)
            by_id[feature_id] = item
        item["minPoints"] = expected_points
        item["resolutionPrefix"] = "full-source-track"
    quality["denseRoutes"] = dense_routes

    if "activity-mtb-day-2026-05-24" in published_feature_ids:
        quality["allowedTailRecoveries"] = [
            item
            for item in list(quality.get("allowedTailRecoveries") or [])
            if str(item.get("routeId")) != "activity-mtb-day-2026-05-24"
        ]
    return updated


def write_routes(
    routes: list[dict[str, Any]],
    catalog: dict[str, Any],
    max_gap_m: float,
    force: bool,
) -> dict[str, Any]:
    """Publish only independently eligible routes; leave review-required routes untouched."""
    reviews = route_reviews(routes)
    publish_ids = eligible_route_ids(reviews)
    targets = target_map()

    for route in routes:
        feature_id = str(route["id"])
        review = reviews[feature_id]
        if feature_id not in publish_ids:
            print(
                f"SKIP {feature_id}: {REVIEWED_SOURCE_REQUIRED}; raw "
                f"{review['rawDistanceKm']:.3f} km vs canonical "
                f"{review['canonicalDistanceKm']:.3f} km "
                f"({review['distanceDeltaPercent']:+.2f}%)."
            )
            continue

        output = ROOT / str(targets[feature_id]["output"])
        if output.exists() and not force:
            raise ValueError(f"Output already exists: {output}; pass --force to replace it")
        output.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "encoding": "google-polyline5",
            "source": "Strava account export",
            "sampling": f"full-source-track-gap-split-{max_gap_m:g}m",
            "routes": [route],
        }
        output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"Wrote {output.relative_to(ROOT)}")

    if publish_ids:
        updated_catalog = update_catalog(catalog, publish_ids)
        (DATA / "route-catalog.json").write_text(json.dumps(updated_catalog, indent=2) + "\n", encoding="utf-8")
        print(
            f"Registered {len(publish_ids)} independently accepted full-source route(s) "
            "with exact density contracts."
        )
    else:
        print("No recovered raw routes passed the full-source distance-fidelity gate; catalog unchanged.")

    review_required = set(reviews) - publish_ids
    return {
        "publishedFeatureIds": sorted(publish_ids),
        "reviewedSourceRequiredFeatureIds": sorted(review_required),
    }


def summary(routes: list[dict[str, Any]]) -> dict[str, Any]:
    reviews = route_reviews(routes)
    publish_ids = eligible_route_ids(reviews)
    return {
        "routeCount": len(routes),
        "sourcePointCount": sum(int(route["sourcePointCount"]) for route in routes),
        "retainedPointCount": sum(int(route["retainedPointCount"]) for route in routes),
        "maxDistanceInflationPercent": MAX_DISTANCE_INFLATION_PERCENT,
        "fullSourceEligibleCount": len(publish_ids),
        "reviewedSourceRequiredCount": len(routes) - len(publish_ids),
        "routes": [
            {
                "featureId": route["id"],
                "stravaActivityIds": route["stravaActivityIds"],
                "sourceFiles": route["sourceFiles"],
                "sourcePointCount": route["sourcePointCount"],
                "retainedPointCount": route["retainedPointCount"],
                "lineCount": len(route["lines"]),
                "sampling": route["sampling"],
                "rawDistanceKm": round(reviews[str(route["id"])]["rawDistanceKm"], 3),
                "canonicalDistanceKm": round(reviews[str(route["id"])]["canonicalDistanceKm"], 3),
                "distanceDeltaPercent": round(reviews[str(route["id"])]["distanceDeltaPercent"], 3),
                "classification": reviews[str(route["id"])]["classification"],
            }
            for route in routes
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect and selectively publish the remaining MTB source routes.")
    parser.add_argument("source", help="Strava export ZIP or extracted export directory")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Rebuild and classify all seven routes without writing files")
    mode.add_argument(
        "--write",
        action="store_true",
        help="Publish only routes classified full-source-eligible; leave review-required routes untouched",
    )
    parser.add_argument("--force", action="store_true", help="Allow replacing existing eligible output files")
    parser.add_argument(
        "--max-gap-m",
        type=float,
        default=180.0,
        help="Start a new line at source gaps larger than this (default: 180 m)",
    )
    args = parser.parse_args()
    if args.max_gap_m <= 0:
        raise SystemExit("--max-gap-m must be positive")
    if args.force and not args.write:
        raise SystemExit("--force is only valid with --write")

    catalog = read_json(DATA / "route-catalog.json")
    export = Export(Path(args.source).expanduser())
    try:
        routes = build_routes(export, catalog, args.max_gap_m)
        report = summary(routes)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    print(json.dumps(report, indent=2))
    if args.dry_run:
        return

    try:
        result = write_routes(routes, catalog, args.max_gap_m, args.force)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    print(json.dumps(result, indent=2))
    print("Next: npm run build:route-detail-index && npm run update:route-detail-quality-floor && npm run check")


if __name__ == "__main__":
    main()
