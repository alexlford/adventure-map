#!/usr/bin/env python3
"""Regression tests for Strava route-source upgrade prioritization."""

from audit_strava_route_sources import candidate_sort_key, dry_run_command, weakest_detail_quality


def main() -> None:
    assert weakest_detail_quality({"a": "full-source", "b": "backfill"}) == "backfill"
    assert weakest_detail_quality({"a": "full-source", "b": "rdp-3m"}) == "rdp-3m"
    assert weakest_detail_quality({"a": None}) == "unindexed"
    assert weakest_detail_quality({"a": "full-source", "b": None}) == "unindexed"
    assert weakest_detail_quality({}) == "unindexed"

    rows = [
        {"featureId": "strava-rdp-large", "sourcePointCount": 25000, "weakestDetailQuality": "rdp-3m"},
        {"featureId": "strava-backfill-small", "sourcePointCount": 500, "weakestDetailQuality": "backfill"},
        {"featureId": "strava-backfill-large", "sourcePointCount": 9000, "weakestDetailQuality": "backfill"},
        {"featureId": "strava-unindexed", "sourcePointCount": 100, "weakestDetailQuality": "unindexed"},
    ]
    ranked = sorted(rows, key=candidate_sort_key)
    assert [row["featureId"] for row in ranked] == [
        "strava-unindexed",
        "strava-backfill-large",
        "strava-backfill-small",
        "strava-rdp-large",
    ]

    command = dry_run_command("/tmp/Alex Export.zip", ranked[:2])
    assert command == (
        "npm run materialize:strava-routes:selected -- '/tmp/Alex Export.zip' "
        "--feature-id strava-unindexed --feature-id strava-backfill-large --dry-run"
    )
    assert dry_run_command("/tmp/export.zip", []) is None

    print("Route source audit tests passed.")


if __name__ == "__main__":
    main()
