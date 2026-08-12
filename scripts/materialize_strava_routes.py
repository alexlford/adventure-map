#!/usr/bin/env python3
"""Materialize dense public GPS polylines from a Strava account export.

This deliberately preserves the recorded track geometry. It does not invent
intermediate points and it does not run Douglas-Peucker/RDP simplification.

By default it refreshes:
  * day-level MTB/Nordic routes from data/activity-days.json
  * GPX-backed personal GPS features already present in route-catalog route files

The output is sharded so the generated files stay reviewable in GitHub. The
script also refreshes the generated shard paths in data/route-catalog.json.

Usage:
  python3 scripts/materialize_strava_routes.py /path/to/export.zip
  python3 scripts/materialize_strava_routes.py /path/to/extracted-export
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ACTIVITY_PREFIX = "data/activity-route-full-resolution-"
CANONICAL_PREFIX = "data/strava-route-full-resolution-gpx-"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def encode_value(value: int) -> str:
    value = ~(value << 1) if value < 0 else value << 1
    chars: list[str] = []
    while value >= 0x20:
        chars.append(chr((0x20 | (value & 0x1F)) + 63))
        value >>= 5
    chars.append(chr(value + 63))
    return "".join(chars)


def encode_polyline(points: Iterable[tuple[float, float]]) -> str:
    out: list[str] = []
    last_lat = 0
    last_lon = 0
    for lat, lon in points:
        lat_i = round(lat * 1e5)
        lon_i = round(lon * 1e5)
        out.append(encode_value(lat_i - last_lat))
        out.append(encode_value(lon_i - last_lon))
        last_lat = lat_i
        last_lon = lon_i
    return "".join(out)


def parse_gpx(data: bytes) -> list[list[tuple[float, float]]]:
    root = ET.fromstring(data)
    segments: list[list[tuple[float, float]]] = []
    for segment in root.iter():
        if not segment.tag.endswith("trkseg"):
            continue
        points: list[tuple[float, float]] = []
        for element in segment:
            if element.tag.endswith("trkpt"):
                points.append((float(element.attrib["lat"]), float(element.attrib["lon"])))
        if len(points) >= 2:
            segments.append(points)
    if segments:
        return segments

    points = [
        (float(element.attrib["lat"]), float(element.attrib["lon"]))
        for element in root.iter()
        if element.tag.endswith("trkpt")
    ]
    return [points] if len(points) >= 2 else []


class Export:
    def __init__(self, source: Path):
        self.source = source
        self.archive: zipfile.ZipFile | None = None
        if source.is_file() and source.suffix.lower() == ".zip":
            self.archive = zipfile.ZipFile(source)
            candidates = [name for name in self.archive.namelist() if name.lower().endswith("activities.csv")]
            if not candidates:
                raise SystemExit("No activities.csv found inside the Strava ZIP.")
            self.csv_name = sorted(candidates, key=len)[0]
        elif source.is_dir():
            self.csv_name = "activities.csv"
            if not (source / self.csv_name).exists():
                raise SystemExit(f"No activities.csv found in {source}")
        else:
            raise SystemExit(f"Strava export not found: {source}")

        text = self.read(self.csv_name).decode("utf-8-sig")
        self.rows = list(csv.DictReader(io.StringIO(text)))
        self.by_id = {str(row.get("Activity ID") or "").strip(): row for row in self.rows}

    def read(self, relative: str) -> bytes:
        relative = relative.replace("\\", "/")
        if self.archive:
            return self.archive.read(relative)
        return (self.source / relative).read_bytes()

    def activity_segments(self, activity_id: str) -> tuple[list[list[tuple[float, float]]], str]:
        row = self.by_id.get(str(activity_id))
        if not row:
            raise ValueError(f"Strava activity {activity_id} is not present in activities.csv")
        filename = str(row.get("Filename") or "").strip()
        if not filename:
            raise ValueError(f"Strava activity {activity_id} has no exported activity file")
        lower = filename.lower()
        if not (lower.endswith(".gpx") or lower.endswith(".gpx.gz")):
            raise ValueError(f"Strava activity {activity_id} uses {filename}; only GPX/GPX.GZ is materialized by this script")
        data = self.read(filename)
        if lower.endswith(".gz"):
            data = gzip.decompress(data)
        segments = parse_gpx(data)
        if not segments:
            raise ValueError(f"Strava activity {activity_id} contains no usable GPX track points")
        return segments, filename


def encoded_route(
    export: Export,
    route_id: str,
    activity_ids: list[str],
    adventure_ids: list[str],
    category: str | None,
    mtb_mode: str | None,
) -> dict[str, Any]:
    lines: list[str] = []
    point_counts: list[int] = []
    source_files: list[str] = []
    for activity_id in activity_ids:
        segments, source_file = export.activity_segments(activity_id)
        source_files.append(source_file)
        for segment in segments:
            lines.append(encode_polyline(segment))
            point_counts.append(len(segment))
    return {
        "id": route_id,
        "adventureIds": adventure_ids,
        "category": category,
        "mtbMode": mtb_mode,
        "stravaActivityIds": [str(value) for value in activity_ids],
        "sourceFiles": source_files,
        "sourcePointCount": sum(point_counts),
        "sourcePointCounts": point_counts,
        "lines": lines,
    }


def activity_day_routes(export: Export) -> list[dict[str, Any]]:
    payload = read_json(DATA / "activity-days.json")
    routes: list[dict[str, Any]] = []
    for record in payload.get("adventures", []):
        ids = [str(value) for value in record.get("stravaActivityIds", [])]
        if not ids and record.get("stravaActivityId") is not None:
            ids = [str(record["stravaActivityId"])]
        if not ids:
            continue
        discipline = record.get("discipline")
        category = "mtb" if discipline == "mountain-bike" else discipline
        routes.append(encoded_route(
            export,
            f"activity-{record['id']}",
            ids,
            [record["id"]],
            category,
            record.get("mtbMode"),
        ))
    return routes


def canonical_gpx_routes(export: Export, catalog: dict[str, Any]) -> list[dict[str, Any]]:
    features: dict[str, dict[str, Any]] = {}
    for rel in catalog.get("routeFiles", []):
        collection = read_json(ROOT / rel)
        for feature in collection.get("features", []):
            fid = feature.get("id") or feature.get("properties", {}).get("featureId")
            if not fid or not re.fullmatch(r"strava-\d+", str(fid)):
                continue
            props = dict(feature.get("properties") or {})
            activity_id = str(props.get("stravaActivityId") or str(fid)[7:])
            row = export.by_id.get(activity_id)
            filename = str((row or {}).get("Filename") or "").lower()
            if not (filename.endswith(".gpx") or filename.endswith(".gpx.gz")):
                continue
            override = catalog.get("featureOverrides", {}).get(str(fid), {})
            adventure_ids = override.get("adventureIds", props.get("adventureIds", []))
            features[str(fid)] = encoded_route(
                export,
                str(fid),
                [activity_id],
                [str(value) for value in adventure_ids],
                props.get("category"),
                props.get("mtbMode"),
            )
    return list(features.values())


def shard_payload(routes: list[dict[str, Any]], shard_size: int) -> list[list[dict[str, Any]]]:
    return [routes[index:index + shard_size] for index in range(0, len(routes), shard_size)]


def write_shards(prefix: str, routes: list[dict[str, Any]], shard_size: int) -> list[str]:
    old = list(ROOT.glob(f"{prefix}*.json"))
    for path in old:
        path.unlink()

    paths: list[str] = []
    for index, shard in enumerate(shard_payload(routes, shard_size), start=1):
        rel = f"{prefix}{index:02d}.json"
        path = ROOT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "encoding": "google-polyline5",
            "source": "Strava account export",
            "sampling": "full-source-track",
            "routes": shard,
        }
        path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
        paths.append(rel)
    return paths


def refresh_catalog(catalog: dict[str, Any], generated: list[str]) -> None:
    existing = [
        rel for rel in catalog.get("polylineFiles", [])
        if not rel.startswith(ACTIVITY_PREFIX) and not rel.startswith(CANONICAL_PREFIX)
    ]
    catalog["polylineFiles"] = existing + generated
    (DATA / "route-catalog.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize dense GPX routes from a Strava export.")
    parser.add_argument("source", help="Strava export ZIP or extracted export directory")
    parser.add_argument("--activity-shard-size", type=int, default=6)
    parser.add_argument("--canonical-shard-size", type=int, default=5)
    args = parser.parse_args()

    export = Export(Path(args.source).expanduser())
    catalog = read_json(DATA / "route-catalog.json")
    activity_routes = activity_day_routes(export)
    canonical_routes = canonical_gpx_routes(export, catalog)

    activity_paths = write_shards(ACTIVITY_PREFIX, activity_routes, args.activity_shard_size)
    canonical_paths = write_shards(CANONICAL_PREFIX, canonical_routes, args.canonical_shard_size)
    refresh_catalog(catalog, activity_paths + canonical_paths)

    activity_points = sum(route["sourcePointCount"] for route in activity_routes)
    canonical_points = sum(route["sourcePointCount"] for route in canonical_routes)
    print(f"Materialized {len(activity_routes)} activity-day routes with {activity_points:,} source GPS points.")
    print(f"Materialized {len(canonical_routes)} canonical GPX routes with {canonical_points:,} source GPS points.")
    print(f"Updated route catalog with {len(activity_paths) + len(canonical_paths)} full-resolution shards.")


if __name__ == "__main__":
    main()
