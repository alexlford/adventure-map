#!/usr/bin/env python3
"""Audit legacy 3 m MTB route lengths against canonical Strava distances.

This does not certify a route as clean. RDP simplification replaces a recorded
polyline subpath with direct endpoint chords, so its geodesic length cannot be
longer than that same source path. Therefore a legacy RDP route that is already
more than the fixed full-source inflation threshold above the canonical Strava
activity distance is a strong, fail-safe signal that the raw source requires
reviewed-source handling rather than automatic full-source publication.
"""

from __future__ import annotations

import json
from typing import Any

from materialize_remaining_mtb_routes import (
    MAX_DISTANCE_INFLATION_PERCENT,
    TARGETS,
    canonical_activity_distances_km,
    decode_polyline,
)
from materialize_strava_routes import DATA, haversine_m, read_json


def tail_recovery_limits(catalog: dict[str, Any]) -> dict[tuple[str, int], int]:
    limits: dict[tuple[str, int], int] = {}
    quality = catalog.get("qualityExpectations") or {}
    for item in quality.get("allowedTailRecoveries") or []:
        route_id = str(item.get("routeId") or "")
        line_index = int(item.get("lineIndex") or 0)
        max_trim = int(item.get("maxTrimEnd") or 0)
        if route_id and max_trim > 0:
            limits[(route_id, line_index)] = max_trim
    return limits


def decode_legacy_line(route_id: str, line_index: int, line: str, recoveries: dict[tuple[str, int], int]):
    try:
        return decode_polyline(line), 0
    except ValueError as original_error:
        max_trim = recoveries.get((route_id, line_index), 0)
        for trim in range(1, max_trim + 1):
            try:
                return decode_polyline(line[:-trim]), trim
            except ValueError:
                continue
        raise original_error


def legacy_route_distance_km(
    route: dict[str, Any],
    recoveries: dict[tuple[str, int], int],
) -> tuple[float, list[dict[str, int]]]:
    distance_m = 0.0
    repairs: list[dict[str, int]] = []
    for line_index, line in enumerate(route.get("lines") or []):
        points, trimmed = decode_legacy_line(str(route["id"]), line_index, str(line), recoveries)
        if trimmed:
            repairs.append({"lineIndex": line_index, "trimEnd": trimmed})
        for previous, point in zip(points, points[1:]):
            distance_m += haversine_m(previous, point)
    return distance_m / 1000.0, repairs


def legacy_target_routes() -> dict[str, dict[str, Any]]:
    target_ids = {str(item["featureId"]) for item in TARGETS}
    found: dict[str, dict[str, Any]] = {}
    for path in sorted(DATA.glob("strava-route-rdp3-*.json")):
        payload = read_json(path)
        for route in payload.get("routes") or []:
            route_id = str(route.get("id") or "")
            if route_id not in target_ids:
                continue
            if route_id in found:
                raise ValueError(f"Duplicate legacy route {route_id}")
            found[route_id] = route
    missing = sorted(target_ids - set(found))
    if missing:
        raise ValueError(f"Missing legacy target route(s): {', '.join(missing)}")
    return found


def build_audit() -> dict[str, Any]:
    catalog = read_json(DATA / "route-catalog.json")
    recoveries = tail_recovery_limits(catalog)
    canonical = canonical_activity_distances_km()
    legacy = legacy_target_routes()
    rows: list[dict[str, Any]] = []
    for target in TARGETS:
        route_id = str(target["featureId"])
        canonical_km = canonical[route_id]
        legacy_km, repairs = legacy_route_distance_km(legacy[route_id], recoveries)
        delta_percent = ((legacy_km / canonical_km) - 1.0) * 100.0
        rows.append({
            "featureId": route_id,
            "legacyRdpDistanceKm": round(legacy_km, 3),
            "canonicalDistanceKm": round(canonical_km, 3),
            "legacyDistanceDeltaPercent": round(delta_percent, 3),
            "guaranteedReviewedSourceCandidate": delta_percent > MAX_DISTANCE_INFLATION_PERCENT,
            "legacyTailRecoveries": repairs,
        })
    return {
        "routeCount": len(rows),
        "thresholdPercent": MAX_DISTANCE_INFLATION_PERCENT,
        "interpretation": (
            "true means even simplified geometry exceeds the raw full-source inflation gate; "
            "the original GPS therefore requires reviewed-source fidelity review"
        ),
        "routes": rows,
    }


def main() -> None:
    print(json.dumps(build_audit(), indent=2))


if __name__ == "__main__":
    main()
