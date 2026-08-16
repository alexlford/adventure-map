#!/usr/bin/env python3
"""Regression tests for selective canonical Strava route materialization."""

from __future__ import annotations

from materialize_selected_strava_routes import ROOT, repository_relative_output, select_specs, summary_rows


specs = {
    "strava-100": {
        "featureId": "strava-100",
        "activityId": "100",
        "adventureIds": ["race-a"],
        "category": "run",
        "mtbMode": None,
    },
    "strava-200": {
        "featureId": "strava-200",
        "activityId": "200",
        "adventureIds": ["summit-b", "story-b"],
        "category": "hike",
        "mtbMode": None,
    },
    "strava-300": {
        "featureId": "strava-300",
        "activityId": "300",
        "adventureIds": ["race-c"],
        "category": "run",
        "mtbMode": None,
    },
}

selected = select_specs(specs, ["strava-300", "strava-300"], ["summit-b"])
assert [item["featureId"] for item in selected] == ["strava-300", "strava-200"]

selected_by_owner = select_specs(specs, [], ["race-a", "story-b"])
assert [item["featureId"] for item in selected_by_owner] == ["strava-100", "strava-200"]

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
        "id": "strava-100",
        "adventureIds": ["race-a"],
        "stravaActivityIds": ["100"],
        "sourceFiles": ["activities/100.fit.gz"],
        "sourcePointCount": 1000,
        "retainedPointCount": 998,
        "sampling": "full-source-track-gap-split-180m",
        "lines": ["abc", "def"],
    }
])
assert rows == [{
    "featureId": "strava-100",
    "adventureIds": ["race-a"],
    "stravaActivityIds": ["100"],
    "sourceFiles": ["activities/100.fit.gz"],
    "sourcePointCount": 1000,
    "retainedPointCount": 998,
    "lineCount": 2,
    "sampling": "full-source-track-gap-split-180m",
}]

print("Selected route materializer tests passed.")
