#!/usr/bin/env python3
"""Regression tests for selective canonical Strava route materialization."""

from __future__ import annotations

from materialize_selected_strava_routes import (
    ROOT,
    activity_day_spec,
    record_activity_ids,
    repository_relative_output,
    select_specs,
    summary_rows,
)


specs = {
    "strava-100": {
        "featureId": "strava-100",
        "activityIds": ["100"],
        "adventureIds": ["race-a"],
        "category": "run",
        "mtbMode": None,
    },
    "strava-200": {
        "featureId": "strava-200",
        "activityIds": ["200"],
        "adventureIds": ["summit-b", "story-b"],
        "category": "hike",
        "mtbMode": None,
    },
    "activity-nordic-day-2023-01-28": {
        "featureId": "activity-nordic-day-2023-01-28",
        "activityIds": ["8468053980"],
        "adventureIds": ["nordic-day-2023-01-28"],
        "category": "nordic",
        "mtbMode": None,
    },
}

selected = select_specs(
    specs,
    ["activity-nordic-day-2023-01-28", "activity-nordic-day-2023-01-28"],
    ["summit-b"],
)
assert [item["featureId"] for item in selected] == ["activity-nordic-day-2023-01-28", "strava-200"]

selected_by_owner = select_specs(specs, [], ["race-a", "nordic-day-2023-01-28"])
assert [item["featureId"] for item in selected_by_owner] == ["strava-100", "activity-nordic-day-2023-01-28"]

try:
    select_specs(specs, ["strava-999"], [])
except ValueError as exc:
    assert "strava-999" in str(exc)
else:
    raise AssertionError("Unknown feature IDs must fail closed")

try:
    select_specs(specs, [], ["missing-record"])
except ValueError as exc:
    assert "missing-record" in str(exc)
else:
    raise AssertionError("Unknown adventure IDs must fail closed")

assert record_activity_ids({"stravaActivityId": 100}) == ["100"]
assert record_activity_ids({"stravaActivityIds": [100, "200", 100]}) == ["100", "200"]
assert record_activity_ids({}) == []

nordic = activity_day_spec({
    "id": "nordic-day-2023-01-28",
    "discipline": "nordic",
    "stravaActivityIds": ["8468053980"],
})
assert nordic == {
    "featureId": "activity-nordic-day-2023-01-28",
    "activityIds": ["8468053980"],
    "adventureIds": ["nordic-day-2023-01-28"],
    "category": "nordic",
    "mtbMode": None,
}

mtb = activity_day_spec({
    "id": "mtb-day-2025-06-07",
    "discipline": "mountain-bike",
    "stravaActivityIds": ["1", "2"],
    "mtbMode": "trail",
})
assert mtb == {
    "featureId": "activity-mtb-day-2025-06-07",
    "activityIds": ["1", "2"],
    "adventureIds": ["mtb-day-2025-06-07"],
    "category": "mtb",
    "mtbMode": "trail",
}
assert activity_day_spec({"id": "no-source", "discipline": "nordic"}) is None

assert repository_relative_output(ROOT / "data" / "strava-route-full-resolution-test.json") == (
    "data/strava-route-full-resolution-test.json"
)

try:
    repository_relative_output(ROOT / "tmp" / "strava-route-full-resolution-test.json")
except ValueError as exc:
    assert "under data/" in str(exc)
else:
    raise AssertionError("Registered outputs outside data/ must fail closed")

try:
    repository_relative_output(ROOT / "data" / "selected-route.json")
except ValueError as exc:
    assert "full-resolution" in str(exc)
else:
    raise AssertionError("Registered outputs must advertise full-resolution quality in the filename")

rows = summary_rows([
    {
        "id": "activity-nordic-day-2023-01-28",
        "adventureIds": ["nordic-day-2023-01-28"],
        "stravaActivityIds": ["8468053980"],
        "sourceFiles": ["activities/8468053980.gpx"],
        "sourcePointCount": 3949,
        "retainedPointCount": 3949,
        "sampling": "full-source-track-gap-split-180m",
        "lines": ["abc"],
    }
])
assert rows == [{
    "featureId": "activity-nordic-day-2023-01-28",
    "adventureIds": ["nordic-day-2023-01-28"],
    "stravaActivityIds": ["8468053980"],
    "sourceFiles": ["activities/8468053980.gpx"],
    "sourcePointCount": 3949,
    "retainedPointCount": 3949,
    "lineCount": 1,
    "sampling": "full-source-track-gap-split-180m",
}]

print("Selected route materializer tests passed.")
