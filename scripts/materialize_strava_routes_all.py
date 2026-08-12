#!/usr/bin/env python3
"""Materialize dense Strava routes from GPX, FIT, and TCX exports.

This is a format-complete wrapper around ``materialize_strava_routes.py``.
It preserves the existing full-source-track and source-gap-splitting behavior,
while adding direct extraction of GPS coordinates from Garmin FIT files and
GPS-bearing TCX files. No intermediate route points are fabricated.

Usage:
  python3 scripts/materialize_strava_routes_all.py /path/to/export.zip
  python3 scripts/materialize_strava_routes_all.py /path/to/extracted-export
"""

from __future__ import annotations

import gzip
import xml.etree.ElementTree as ET
from pathlib import Path

import materialize_strava_routes as base

SEMICIRCLE_TO_DEGREES = 180.0 / (2 ** 31)
FIT_INVALID_SINT32 = 0x7FFFFFFF


def parse_tcx(data: bytes) -> list[list[tuple[float, float]]]:
    """Return GPS-bearing TCX tracks, ignoring non-geographic indoor records."""
    root = ET.fromstring(data)
    segments: list[list[tuple[float, float]]] = []
    for track in root.iter():
        if not track.tag.endswith("Track"):
            continue
        points: list[tuple[float, float]] = []
        for trackpoint in track:
            if not trackpoint.tag.endswith("Trackpoint"):
                continue
            lat = None
            lon = None
            for element in trackpoint.iter():
                if element.tag.endswith("LatitudeDegrees") and element.text:
                    lat = float(element.text)
                elif element.tag.endswith("LongitudeDegrees") and element.text:
                    lon = float(element.text)
            if lat is not None and lon is not None:
                points.append((lat, lon))
        if len(points) >= 2:
            segments.append(points)
    return segments


def parse_fit(data: bytes) -> list[list[tuple[float, float]]]:
    """Extract position_lat/position_long from FIT record messages.

    FIT is definition-driven. This reader intentionally decodes only enough of
    the protocol to recover record-message positions while still respecting
    local message definitions, architecture endianness, developer fields, and
    compressed timestamp headers. Unknown fields are skipped by their declared
    byte sizes.
    """
    if len(data) < 12:
        return []

    header_size = data[0]
    if header_size < 12 or header_size > len(data):
        raise ValueError("FIT header is invalid")
    data_size = int.from_bytes(data[4:8], "little")
    index = header_size
    data_end = min(len(data), header_size + data_size)
    definitions: dict[int, tuple[list[tuple[int, int, int]], list[tuple[int, int, int]], str, int]] = {}
    points: list[tuple[float, float]] = []

    def read_data_message(local_message: int) -> None:
        nonlocal index
        definition = definitions.get(local_message)
        if definition is None:
            raise ValueError(f"FIT data message references undefined local message {local_message}")
        fields, developer_fields, byteorder, global_message = definition
        position_lat = None
        position_lon = None
        for field_number, field_size, _base_type in fields:
            raw = data[index:index + field_size]
            if len(raw) != field_size:
                raise ValueError("FIT data message is truncated")
            index += field_size
            if global_message == 20 and field_number in (0, 1) and field_size == 4:
                value = int.from_bytes(raw, byteorder, signed=True)
                if value != FIT_INVALID_SINT32:
                    if field_number == 0:
                        position_lat = value
                    else:
                        position_lon = value
        for _field_number, field_size, _developer_index in developer_fields:
            if index + field_size > data_end:
                raise ValueError("FIT developer field is truncated")
            index += field_size
        if position_lat is not None and position_lon is not None:
            points.append((position_lat * SEMICIRCLE_TO_DEGREES, position_lon * SEMICIRCLE_TO_DEGREES))

    while index < data_end:
        record_header = data[index]
        index += 1

        if record_header & 0x80:
            local_message = (record_header >> 5) & 0x03
            read_data_message(local_message)
            continue

        local_message = record_header & 0x0F
        is_definition = bool(record_header & 0x40)
        has_developer_fields = bool(record_header & 0x20)

        if not is_definition:
            read_data_message(local_message)
            continue

        if index + 5 > data_end:
            raise ValueError("FIT definition message is truncated")
        index += 1  # reserved byte
        architecture = data[index]
        index += 1
        byteorder = "little" if architecture == 0 else "big"
        global_message = int.from_bytes(data[index:index + 2], byteorder)
        index += 2
        field_count = data[index]
        index += 1

        fields: list[tuple[int, int, int]] = []
        for _ in range(field_count):
            if index + 3 > data_end:
                raise ValueError("FIT field definition is truncated")
            fields.append((data[index], data[index + 1], data[index + 2]))
            index += 3

        developer_fields: list[tuple[int, int, int]] = []
        if has_developer_fields:
            if index >= data_end:
                raise ValueError("FIT developer field definition is truncated")
            developer_count = data[index]
            index += 1
            for _ in range(developer_count):
                if index + 3 > data_end:
                    raise ValueError("FIT developer field definition is truncated")
                developer_fields.append((data[index], data[index + 1], data[index + 2]))
                index += 3

        definitions[local_message] = (fields, developer_fields, byteorder, global_message)

    return [points] if len(points) >= 2 else []


class CompleteExport(base.Export):
    def activity_segments(self, activity_id: str) -> tuple[list[list[tuple[float, float]]], str]:
        row = self.by_id.get(str(activity_id))
        if not row:
            raise ValueError(f"Strava activity {activity_id} is not present in activities.csv")
        filename = str(row.get("Filename") or "").strip()
        if not filename:
            raise ValueError(f"Strava activity {activity_id} has no exported activity file")

        lower = filename.lower()
        if lower.endswith((".gpx", ".gpx.gz")):
            return super().activity_segments(activity_id)

        data = self.read(filename)
        if lower.endswith(".gz"):
            data = gzip.decompress(data)

        if lower.endswith((".fit", ".fit.gz")):
            segments = parse_fit(data)
        elif lower.endswith((".tcx", ".tcx.gz")):
            segments = parse_tcx(data)
        else:
            raise ValueError(f"Strava activity {activity_id} uses unsupported route format {filename}")

        if not segments:
            raise ValueError(f"Strava activity {activity_id} contains no usable GPS track points")
        return segments, filename


def main() -> None:
    base.Export = CompleteExport
    base.main()


if __name__ == "__main__":
    main()
