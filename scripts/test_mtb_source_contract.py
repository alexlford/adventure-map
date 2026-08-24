#!/usr/bin/env python3
"""Lock reviewed MTB activity-day wrappers to their authoritative Strava sources."""

from __future__ import annotations

from materialize_selected_strava_routes import canonical_feature_specs
from materialize_strava_routes import DATA, read_json


specs = canonical_feature_specs(read_json(DATA / "route-catalog.json"))

expected_mtb_sources = {
    "activity-mtb-day-2023-09-24": ["9914293414"],
    "activity-mtb-day-2024-07-27": ["11997305131"],
    "activity-mtb-day-2024-08-31": ["12292602651"],
    "activity-mtb-day-2025-09-28": ["15970284234"],
    "activity-mtb-day-2025-10-05": ["16044942747"],
    "activity-mtb-day-2026-05-24": ["18639468697", "18638006859"],
    "activity-mtb-day-2026-08-05": ["19618505573"],
}

for feature_id, activity_ids in expected_mtb_sources.items():
    spec = specs[feature_id]
    adventure_id = feature_id.removeprefix("activity-")
    assert spec["activityIds"] == activity_ids, (
        f"{feature_id}: expected Strava source IDs {activity_ids}, found {spec['activityIds']}"
    )
    assert spec["adventureIds"] == [adventure_id], (
        f"{feature_id}: expected public owner {adventure_id}, found {spec['adventureIds']}"
    )
    assert spec["category"] == "mtb", (
        f"{feature_id}: expected MTB category, found {spec['category']}"
    )

print("MTB source-contract tests passed.")
