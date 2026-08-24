#!/usr/bin/env python3
"""Regression tests for the remaining MTB full-source batch materializer."""

from __future__ import annotations

from materialize_remaining_mtb_routes import TARGETS, target_map, update_catalog


expected = {
    "activity-mtb-day-2023-09-24": (["9914293414"], 4614),
    "activity-mtb-day-2024-07-27": (["11997305131"], 10069),
    "activity-mtb-day-2024-08-31": (["12292602651"], 6104),
    "activity-mtb-day-2025-09-28": (["15970284234"], 7095),
    "activity-mtb-day-2025-10-05": (["16044942747"], 5687),
    "activity-mtb-day-2026-05-24": (["18639468697", "18638006859"], 5521),
    "activity-mtb-day-2026-08-05": (["19618505573"], 7981),
}

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
