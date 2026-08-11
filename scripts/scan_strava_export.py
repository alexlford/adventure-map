#!/usr/bin/env python3
"""Build a review queue from a fresh Strava export.

Usage:
  python3 scripts/scan_strava_export.py /path/to/export.zip
  python3 scripts/scan_strava_export.py /path/to/activities.csv --output tmp/update-queue.json
  python3 scripts/scan_strava_export.py /path/to/export.zip --since 2026-01-01

The scanner never publishes records. By default it uses data/ingest-state.json as a
watermark so old unpublished training activities do not reappear on every scan.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
STATE_PATH = DATA_DIR / "ingest-state.json"

ID_KEYS = {"stravaActivityId", "activityId", "strava_activity_id"}
RACE_HINT = re.compile(r"\b(race|marathon|half|5k|10k|15k|20k|25k|50k|relay|classic|stampede|groove|run\s*ride)\b", re.I)

TYPE_MAP = {
    "run": "run",
    "trail run": "run",
    "trailrun": "run",
    "virtual run": "run",
    "virtualrun": "run",
    "ride": "bike",
    "mountain bike ride": "bike",
    "mountainbikeride": "bike",
    "nordic ski": "nordic",
    "nordicski": "nordic",
    "cross country ski": "nordic",
    "alpine ski": "skiing",
    "alpineski": "skiing",
    "backcountry ski": "skiing",
    "backcountryski": "skiing",
    "snowboard": "skiing",
}

HEADER_ALIASES = {
    "id": ["Activity ID", "Activity Id", "activity_id"],
    "date": ["Activity Date", "Date", "Start Date", "start_date"],
    "name": ["Activity Name", "Name", "activity_name"],
    "type": ["Activity Type", "Type", "activity_type"],
    "description": ["Activity Description", "Description", "activity_description"],
    "distance": ["Distance", "distance"],
    "elapsed": ["Elapsed Time", "elapsed_time"],
    "moving": ["Moving Time", "moving_time"],
    "gain": ["Elevation Gain", "elevation_gain"],
    "filename": ["Filename", "File Name", "filename"],
}


def hash_activity_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def walk_ids(value: Any, known: set[str]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in ID_KEYS and child not in (None, ""):
                known.add(str(child))
            walk_ids(child, known)
    elif isinstance(value, list):
        for child in value:
            walk_ids(child, known)


def known_published_activity_ids() -> set[str]:
    known: set[str] = set()
    for file in DATA_DIR.glob("*.json"):
        if file.name == STATE_PATH.name:
            continue
        try:
            walk_ids(json.loads(file.read_text(encoding="utf-8")), known)
        except Exception as exc:  # pragma: no cover - maintenance diagnostic
            print(f"WARN could not inspect {file.name}: {exc}", file=sys.stderr)
    return known


def load_state() -> dict[str, Any]:
    if not STATE_PATH.exists():
        return {}
    return json.loads(STATE_PATH.read_text(encoding="utf-8"))


def first(row: dict[str, str], key: str) -> str:
    for alias in HEADER_ALIASES[key]:
        value = row.get(alias)
        if value not in (None, ""):
            return str(value).strip()
    return ""


def number(value: str) -> float | None:
    if not value:
        return None
    try:
        return float(value.replace(",", ""))
    except ValueError:
        return None


def integer(value: str) -> int | None:
    n = number(value)
    return int(round(n)) if n is not None else None


def parse_datetime(value: str) -> datetime | None:
    if not value:
        return None
    value = value.strip()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=None)
    except ValueError:
        pass
    formats = [
        "%b %d, %Y, %I:%M:%S %p",
        "%b %d, %Y, %I:%M %p",
        "%Y-%m-%d %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def normalized_type(raw: str) -> str | None:
    value = re.sub(r"\s+", " ", raw.strip().lower())
    return TYPE_MAP.get(value)


def default_action(category: str, name: str, description: str) -> str:
    hinted = bool(RACE_HINT.search(f"{name} {description}"))
    if category == "run":
        return "race-review" if hinted else "review-only"
    if category == "bike":
        return "race-review" if hinted else "bike-review"
    if category == "nordic":
        return "race-review" if hinted else "candidate-outing"
    if category == "skiing":
        return "ski-passport"
    return "review-only"


def rows_from_source(source: Path) -> tuple[Iterable[dict[str, str]], str]:
    if source.suffix.lower() == ".zip":
        archive = zipfile.ZipFile(source)
        candidates = [n for n in archive.namelist() if n.lower().endswith("activities.csv")]
        if not candidates:
            raise SystemExit("No activities.csv found inside the Strava ZIP.")
        member = sorted(candidates, key=len)[0]
        text = io.TextIOWrapper(archive.open(member), encoding="utf-8-sig", newline="")
        return csv.DictReader(text), f"{source.name}:{member}"
    if source.is_dir():
        source = source / "activities.csv"
    if not source.exists():
        raise SystemExit(f"Strava source not found: {source}")
    handle = source.open("r", encoding="utf-8-sig", newline="")
    return csv.DictReader(handle), str(source)


def build_queue(source: Path, since: str | None = None) -> dict[str, Any]:
    published = known_published_activity_ids()
    state = load_state()
    watermark = None if since else parse_datetime(state.get("lastSeenActivityLocalDateTime", ""))
    watermark_hashes = set(state.get("seenAtWatermarkActivityIdHashes", []))
    since_dt = datetime.fromisoformat(since) if since else None
    rows, source_label = rows_from_source(source)
    candidates: list[dict[str, Any]] = []
    ignored_published = 0
    ignored_before_watermark = 0
    ignored_type = 0
    source_count = 0
    max_source_dt: datetime | None = None
    max_source_hashes: set[str] = set()

    for row in rows:
        source_count += 1
        activity_id = first(row, "id")
        if not activity_id:
            continue
        activity_hash = hash_activity_id(activity_id)
        dt = parse_datetime(first(row, "date"))

        if dt and (max_source_dt is None or dt > max_source_dt):
            max_source_dt = dt
            max_source_hashes = {activity_hash}
        elif dt and dt == max_source_dt:
            max_source_hashes.add(activity_hash)

        if activity_id in published:
            ignored_published += 1
            continue
        if since_dt and dt and dt < since_dt:
            ignored_before_watermark += 1
            continue
        if watermark and dt:
            if dt < watermark or (dt == watermark and activity_hash in watermark_hashes):
                ignored_before_watermark += 1
                continue

        category = normalized_type(first(row, "type"))
        if not category:
            ignored_type += 1
            continue

        name = first(row, "name") or f"Strava activity {activity_id}"
        description = first(row, "description")
        # In the account export used for this project, Strava's duplicate Distance
        # header resolves to the detailed field measured in meters.
        distance_m = number(first(row, "distance"))
        gain_m = number(first(row, "gain"))
        candidate = {
            "stravaActivityId": activity_id,
            "date": dt.date().isoformat() if dt else None,
            "activityLocalDateTime": dt.isoformat(timespec="seconds") if dt else None,
            "name": name,
            "activityType": first(row, "type"),
            "maintenanceCategory": category,
            "suggestedAction": default_action(category, name, description),
            "distanceKm": round(distance_m / 1000, 3) if distance_m is not None else None,
            "distanceMi": round(distance_m / 1609.344, 2) if distance_m is not None else None,
            "elapsedSeconds": integer(first(row, "elapsed")),
            "movingSeconds": integer(first(row, "moving")),
            "elevationGainM": round(gain_m, 1) if gain_m is not None else None,
            "filename": first(row, "filename") or None,
            "description": description or None,
            "review": {
                "publish": None,
                "destination": None,
                "location": None,
                "classification": None,
                "routePrivacy": None,
                "notes": None,
            },
        }
        candidates.append(candidate)

    candidates.sort(key=lambda x: (x.get("activityLocalDateTime") or "", x["stravaActivityId"]))
    counts = Counter(x["maintenanceCategory"] for x in candidates)
    actions = Counter(x["suggestedAction"] for x in candidates)
    state_proposal = None
    if max_source_dt:
        state_proposal = {
            "schemaVersion": 2,
            "source": "Strava account export snapshot",
            "snapshotOn": datetime.now(timezone.utc).date().isoformat(),
            "activityCount": source_count,
            "lastSeenActivityLocalDateTime": max_source_dt.isoformat(timespec="seconds"),
            "seenAtWatermarkActivityIdHashes": sorted(max_source_hashes),
            "privacyNote": "Timestamp watermark plus one-way hashes for activities sharing the exact watermark time; unpublished activity IDs are not stored in ingest state.",
            "backfillNote": "Activities added later with an older Strava activity date require an intentional --since rescan."
        }
    return {
        "schemaVersion": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source_label,
        "baseline": {
            "snapshotOn": state.get("snapshotOn"),
            "activityCount": state.get("activityCount"),
            "lastSeenActivityLocalDateTime": state.get("lastSeenActivityLocalDateTime"),
        },
        "summary": {
            "sourceActivities": source_count,
            "newRelevantActivities": len(candidates),
            "byCategory": dict(sorted(counts.items())),
            "bySuggestedAction": dict(sorted(actions.items())),
            "publishedIdsSkipped": ignored_published,
            "atOrBeforeWatermarkSkipped": ignored_before_watermark,
            "unsupportedNewTypesSkipped": ignored_type,
        },
        "stateProposal": state_proposal,
        "candidates": candidates,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an incremental review queue from a Strava export.")
    parser.add_argument("source", help="Strava export ZIP, extracted export directory, or activities.csv")
    parser.add_argument("--output", default="tmp/update-queue.json", help="Output JSON path (default: tmp/update-queue.json)")
    parser.add_argument("--since", help="Optional YYYY-MM-DD lower bound for an intentional historical rescan")
    args = parser.parse_args()

    if args.since and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.since):
        raise SystemExit("--since must use YYYY-MM-DD")

    queue = build_queue(Path(args.source).expanduser(), args.since)
    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    summary = queue["summary"]
    print(f"Wrote {summary['newRelevantActivities']} new relevant activities to {output}")
    for category, count in summary["byCategory"].items():
        print(f"  {category}: {count}")
    print("Queue is review-only; nothing was published and the ingest watermark was not advanced.")


if __name__ == "__main__":
    main()
