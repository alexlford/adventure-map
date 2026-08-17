#!/usr/bin/env python3
"""Audit canonical Strava-backed routes and rank source-detail upgrades.

This is intentionally read-only. It reports source formats, usable GPS point
counts, and the current route-detail quality for each linked public record. The
upgrade queue ranks the weakest currently published geometry first so a fresh
Strava export can be turned directly into a reviewed materialization batch.

Usage:
  python3 scripts/audit_strava_route_sources.py /path/to/export.zip
  python3 scripts/audit_strava_route_sources.py /path/to/export.zip --limit 10
  npm run audit:strava-route-sources -- /path/to/export.zip
"""

from __future__ import annotations

import argparse
import json
import shlex
from collections import Counter
from pathlib import Path
from typing import Any

from materialize_strava_routes import DATA, ROOT, Export, read_json
from strava_route_formats import is_supported_activity_file


QUALITY_PRIORITY: dict[str | None, int] = {
    None: 6,
    "unindexed": 6,
    "activity-overview": 5,
    "backfill": 5,
    "catalog-detail": 4,
    "story-detail": 3,
    "rdp-3m": 2,
    "full-source": 0,
}


def source_format(filename: str) -> str:
    lower = filename.strip().lower()
    if lower.endswith(".gz"):
        lower = lower[:-3]
    suffix = Path(lower).suffix.lstrip(".")
    return suffix or "none"


def canonical_strava_features(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    features: dict[str, dict[str, Any]] = {}
    for rel in catalog.get("routeFiles", []):
        collection = read_json(ROOT / rel)
        for feature in collection.get("features", []):
            feature_id = feature.get("id") or feature.get("properties", {}).get("featureId")
            feature_id = str(feature_id or "")
            if not feature_id.startswith("strava-") or not feature_id[7:].isdigit():
                continue
            props = dict(feature.get("properties") or {})
            override = catalog.get("featureOverrides", {}).get(feature_id, {})
            adventure_ids = override.get("adventureIds", props.get("adventureIds", []))
            features[feature_id] = {
                "featureId": feature_id,
                "activityId": str(props.get("stravaActivityId") or feature_id[7:]),
                "adventureIds": [str(value) for value in adventure_ids],
            }
    return list(features.values())


def weakest_detail_quality(qualities: dict[str, str | None]) -> str:
    if not qualities or any(quality is None for quality in qualities.values()):
        return "unindexed"
    linked = [str(quality) for quality in qualities.values()]
    return max(linked, key=lambda quality: QUALITY_PRIORITY.get(quality, QUALITY_PRIORITY[None]))


def candidate_sort_key(row: dict[str, Any]) -> tuple[int, int, str]:
    quality = str(row.get("weakestDetailQuality") or "unindexed")
    priority = QUALITY_PRIORITY.get(quality, QUALITY_PRIORITY[None])
    return (-priority, -int(row.get("sourcePointCount") or 0), str(row.get("featureId") or ""))


def dry_run_command(source: str, candidates: list[dict[str, Any]]) -> str | None:
    if not candidates:
        return None
    selectors = " ".join(
        f"--feature-id {shlex.quote(str(row['featureId']))}"
        for row in candidates
    )
    return f"npm run materialize:strava-routes:selected -- {shlex.quote(source)} {selectors} --dry-run"


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit canonical Strava route source coverage and rank upgrades.")
    parser.add_argument("source", help="Strava export ZIP or extracted export directory")
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Maximum upgrade candidates to print and include in the suggested dry-run command (default: 20; 0 = all).",
    )
    args = parser.parse_args()
    if args.limit < 0:
        raise SystemExit("--limit must be zero or positive")

    export = Export(Path(args.source).expanduser())
    catalog = read_json(DATA / "route-catalog.json")
    detail_index = read_json(DATA / "route-detail-index.json")
    detail_records = detail_index.get("records", {})

    rows: list[dict[str, Any]] = []
    format_counts: Counter[str] = Counter()
    matched = 0
    supported = 0
    gps_sources = 0
    parse_errors = 0

    for feature in canonical_strava_features(catalog):
        activity_id = feature["activityId"]
        activity = export.by_id.get(activity_id)
        filename = str((activity or {}).get("Filename") or "").strip()
        fmt = source_format(filename)
        format_counts[fmt] += 1
        if activity:
            matched += 1

        point_count = 0
        error: str | None = None
        if filename and is_supported_activity_file(filename):
            supported += 1
            try:
                segments, _ = export.activity_segments(activity_id)
                point_count = sum(len(segment) for segment in segments)
                if point_count:
                    gps_sources += 1
            except (KeyError, OSError, ValueError) as exc:
                error = str(exc)
                parse_errors += 1

        qualities = {
            adventure_id: detail_records.get(adventure_id, {}).get("quality")
            for adventure_id in feature["adventureIds"]
        }
        full_source_current = bool(qualities) and all(quality == "full-source" for quality in qualities.values())
        weakest_quality = weakest_detail_quality(qualities)
        upgrade_candidate = point_count > 0 and not full_source_current

        rows.append({
            **feature,
            "sourceFile": filename or None,
            "sourceFormat": fmt,
            "sourcePointCount": point_count,
            "detailQuality": qualities,
            "weakestDetailQuality": weakest_quality,
            "upgradePriority": QUALITY_PRIORITY.get(weakest_quality, QUALITY_PRIORITY[None]),
            "upgradeCandidate": upgrade_candidate,
            "error": error,
        })

    candidates = sorted(
        (row for row in rows if row["upgradeCandidate"]),
        key=candidate_sort_key,
    )
    visible_candidates = candidates if args.limit == 0 else candidates[: args.limit]
    candidate_quality_counts = Counter(str(row["weakestDetailQuality"]) for row in candidates)
    summary = {
        "canonicalStravaRoutes": len(rows),
        "matchedExportActivities": matched,
        "supportedRouteSources": supported,
        "gpsSourceRoutes": gps_sources,
        "upgradeCandidates": len(candidates),
        "printedCandidates": len(visible_candidates),
        "parseErrors": parse_errors,
        "sourceFormats": dict(sorted(format_counts.items())),
        "upgradeCandidatesByWeakestQuality": dict(sorted(candidate_quality_counts.items())),
    }
    print(json.dumps(summary, indent=2))
    print("\nUPGRADE_CANDIDATES")
    for row in visible_candidates:
        print(json.dumps(row, separators=(",", ":")))

    command = dry_run_command(args.source, visible_candidates)
    if command:
        print("\nSUGGESTED_DRY_RUN")
        print(command)

    errors = [row for row in rows if row["error"]]
    if errors:
        print("\nSOURCE_ERRORS")
        for row in errors:
            print(json.dumps(row, separators=(",", ":")))


if __name__ == "__main__":
    main()
