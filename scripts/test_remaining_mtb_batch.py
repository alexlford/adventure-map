#!/usr/bin/env python3
"""Regression tests for the remaining MTB full-source batch materializer."""

from __future__ import annotations

from materialize_remaining_mtb_routes import (
    MAX_DISTANCE_INFLATION_PERCENT,
    TARGETS,
    canonical_activity_distances_km,
    decode_polyline,
    distance_review,
    route_distance_km,
    target_map,
    update_catalog,
)
from materialize_strava_routes import encode_polyline


expected = {
    "activity-mtb-day-2023-09-24": (["9914293414"], 4614),
    "activity-mtb-day-2024-07-27": (["11997305131"], 10069),
    "activity-mtb-day-2024-08-31": (["12292602651"], 6104),
    "activity-mtb-day-2025-09-28": (["15970284234"], 7095),
    "activity-mtb-day-2025-10-05": (["16044942747"], 5687),
    "activity-mtb-day-2026-05-24": (["18639468697", "18638006859"], 5521),
    "activity-mtb-day-2026-08-05": (["19618505573"], 7981),
}
expected_distances_km = {
    "activity-mtb-day-2023-09-24": 23.07,
    "activity-mtb-day-2024-07-27": 45.55,
    "activity-mtb-day-2024-08-31": 27.60,
    "activity-mtb-day-2025-09-28": 32.51,
    "activity-mtb-day-2025-10-05": 25.55,
    "activity-mtb-day-2026-05-24": 17.75,
    "activity-mtb-day-2026-08-05": 34.41,
}

assert MAX_DISTANCE_INFLATION_PERCENT == 5.0
assert len(TARGETS) == 7
assert len(target_map()) == 7
assert sum(int(item["sourcePointCount"]) for item in TARGETS) == 47071
for item in TARGETS:
    feature_id = str(item["featureId"])
    assert feature_id in expected
    activity_ids, source_points = expected[feature_id]
    assert item["activityIds"] == activity_ids
    assert item["sourcePointCount"] == source_points
    assert item["output"] == f"data/strava-route-full-resolution-{feature_id.removeprefix('activity-')}.json"

# Lock the publication review gate to the Strava-derived activity-day distances.
canonical_distances = canonical_activity_distances_km()
for feature_id, expected_distance in expected_distances_km.items():
    assert canonical_distances[feature_id] == expected_distance

# Polyline distance review must preserve line breaks: no invented distance is
# measured between separate source segments.
first_segment = [(39.0, -105.0), (39.005, -105.0)]
second_segment = [(39.050, -105.0), (39.055, -105.0)]
first_line = encode_polyline(first_segment)
second_line = encode_polyline(second_segment)
assert decode_polyline(first_line) == first_segment
assert decode_polyline(second_line) == second_segment
synthetic_route = {"id": "synthetic", "lines": [first_line, second_line]}
raw_distance = route_distance_km(synthetic_route)
assert 1.10 < raw_distance < 1.12, raw_distance

# A route below the fixed 5% upper inflation boundary is eligible for raw
# full-source publication; one above it must be diverted to reviewed-source.
passes = distance_review(synthetic_route, raw_distance / 1.04)
assert 3.99 < passes["distanceDeltaPercent"] < 4.01
assert passes["passes"] is True
fails = distance_review(synthetic_route, raw_distance / 1.06)
assert 5.99 < fails["distanceDeltaPercent"] < 6.01
assert fails["passes"] is False

catalog = {
    "polylineFiles": ["data/existing.json"],
    "qualityExpectations": {
        "denseRoutes": [
            {"id": "existing", "minPoints": 10, "resolutionPrefix": "full-source-track"},
            {"id": "activity-mtb-day-2023-09-24", "minPoints": 1, "resolutionPrefix": "legacy"},
        ],
        "allowedTailRecoveries": [
            {"routeId": "activity-mtb-day-2026-05-24", "lineIndex": 1, "maxTrimEnd": 8},
            {"routeId": "unrelated-route", "lineIndex": 0, "maxTrimEnd": 2},
        ],
    },
}
updated = update_catalog(catalog)

assert catalog["polylineFiles"] == ["data/existing.json"], "update_catalog must not mutate its input"
assert len(updated["polylineFiles"]) == 8
assert len(set(updated["polylineFiles"])) == 8

dense = {item["id"]: item for item in updated["qualityExpectations"]["denseRoutes"]}
assert dense["existing"]["minPoints"] == 10
for feature_id, (_, source_points) in expected.items():
    assert dense[feature_id] == {
        "id": feature_id,
        "minPoints": source_points,
        "resolutionPrefix": "full-source-track",
    }

recoveries = updated["qualityExpectations"]["allowedTailRecoveries"]
assert recoveries == [{"routeId": "unrelated-route", "lineIndex": 0, "maxTrimEnd": 2}]

print("Remaining MTB batch materializer tests passed.")
