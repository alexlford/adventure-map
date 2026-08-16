#!/usr/bin/env python3
"""Decode GPS track geometry from activity files in a Strava account export.

The route materializer intentionally has no third-party Python dependencies, so
fresh account exports can be processed in CI or a clean local checkout. GPX and
TCX are XML. FIT support is intentionally narrow: it implements the parts of the
FIT protocol needed to read record-message latitude/longitude fields while
correctly skipping unrelated standard and developer fields.
"""

from __future__ import annotations

import gzip
import struct
import xml.etree.ElementTree as ET

SUPPORTED_SUFFIXES = (".gpx", ".gpx.gz", ".fit", ".fit.gz", ".tcx", ".tcx.gz")
FIT_MAGIC = b".FIT"
FIT_RECORD_MESSAGE = 20
FIT_POSITION_LAT = 0
FIT_POSITION_LONG = 1
FIT_TIMESTAMP = 253
FIT_INVALID_SINT32 = 0x7FFFFFFF
SEMICIRCLE_TO_DEGREES = 180.0 / (2**31)


def is_supported_activity_file(filename: str) -> bool:
    lower = filename.strip().lower()
    return any(lower.endswith(suffix) for suffix in SUPPORTED_SUFFIXES)


def parse_gpx(data: bytes) -> list[list[tuple[float, float]]]:
    root = ET.fromstring(data.lstrip())
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


def parse_tcx(data: bytes) -> list[list[tuple[float, float]]]:
    # Some Strava exports contain indentation before the XML declaration.
    root = ET.fromstring(data.lstrip())
    tracks = [element for element in root.iter() if element.tag.endswith("Track")]
    if not tracks:
        tracks = [root]

    segments: list[list[tuple[float, float]]] = []
    for track in tracks:
        points: list[tuple[float, float]] = []
        for trackpoint in track.iter():
            if not trackpoint.tag.endswith("Trackpoint"):
                continue
            latitude: float | None = None
            longitude: float | None = None
            for element in trackpoint.iter():
                if element.tag.endswith("LatitudeDegrees") and element.text:
                    latitude = float(element.text)
                elif element.tag.endswith("LongitudeDegrees") and element.text:
                    longitude = float(element.text)
            if latitude is not None and longitude is not None:
                points.append((latitude, longitude))
        if len(points) >= 2:
            segments.append(points)
    return segments


def parse_fit(data: bytes) -> list[list[tuple[float, float]]]:
    """Read position fields from FIT record messages without an SDK dependency.

    FIT data records are interpreted from their local message definitions. A
    compressed-timestamp header replaces the timestamp field, so that field is
    skipped when consuming the record payload. Unknown messages and fields are
    consumed according to their definitions and otherwise ignored.
    """
    if len(data) < 12:
        raise ValueError("FIT file is too short")
    header_size = data[0]
    if header_size < 12 or header_size > len(data):
        raise ValueError("Invalid FIT header size")
    if data[8:12] != FIT_MAGIC:
        raise ValueError("Invalid FIT signature")

    data_size = struct.unpack_from("<I", data, 4)[0]
    position = header_size
    end = header_size + data_size
    if end > len(data):
        raise ValueError("FIT payload is truncated")

    definitions: dict[int, dict[str, object]] = {}
    points: list[tuple[float, float]] = []

    while position < end:
        record_header = data[position]
        position += 1

        if record_header & 0x80:
            local_message = (record_header >> 5) & 0x03
            definition = definitions.get(local_message)
            if definition is None:
                raise ValueError(f"Compressed FIT record references undefined local message {local_message}")
            field_values: list[tuple[int, bytes, bool]] = []
            for number, size, _base_type, is_developer in definition["fields"]:  # type: ignore[index]
                if not is_developer and number == FIT_TIMESTAMP:
                    continue
                if position + size > end:
                    raise ValueError("FIT data record is truncated")
                field_values.append((number, data[position:position + size], is_developer))
                position += size
            global_message = int(definition["global"])

        elif record_header & 0x40:
            local_message = record_header & 0x0F
            has_developer_fields = bool(record_header & 0x20)
            if position + 5 > end:
                raise ValueError("FIT definition record is truncated")

            architecture = data[position + 1]
            if architecture not in (0, 1):
                raise ValueError(f"Unsupported FIT architecture {architecture}")
            endian = "<" if architecture == 0 else ">"
            global_message = struct.unpack_from(f"{endian}H", data, position + 2)[0]
            field_count = data[position + 4]
            position += 5

            fields: list[tuple[int, int, int, bool]] = []
            for _ in range(field_count):
                if position + 3 > end:
                    raise ValueError("FIT field definition is truncated")
                number, size, base_type = data[position:position + 3]
                position += 3
                fields.append((number, size, base_type, False))

            if has_developer_fields:
                if position >= end:
                    raise ValueError("FIT developer field count is truncated")
                developer_count = data[position]
                position += 1
                for _ in range(developer_count):
                    if position + 3 > end:
                        raise ValueError("FIT developer field definition is truncated")
                    number, size, developer_index = data[position:position + 3]
                    position += 3
                    fields.append((number, size, developer_index, True))

            definitions[local_message] = {
                "global": global_message,
                "architecture": architecture,
                "fields": fields,
            }
            continue

        else:
            local_message = record_header & 0x0F
            definition = definitions.get(local_message)
            if definition is None:
                raise ValueError(f"FIT data record references undefined local message {local_message}")
            field_values = []
            for number, size, _base_type, is_developer in definition["fields"]:  # type: ignore[index]
                if position + size > end:
                    raise ValueError("FIT data record is truncated")
                field_values.append((number, data[position:position + size], is_developer))
                position += size
            global_message = int(definition["global"])

        if global_message != FIT_RECORD_MESSAGE:
            continue

        standard_values = {
            number: raw
            for number, raw, is_developer in field_values
            if not is_developer
        }
        latitude_raw = standard_values.get(FIT_POSITION_LAT)
        longitude_raw = standard_values.get(FIT_POSITION_LONG)
        if latitude_raw is None or longitude_raw is None or len(latitude_raw) < 4 or len(longitude_raw) < 4:
            continue

        architecture = int(definition["architecture"])
        endian = "<" if architecture == 0 else ">"
        latitude = struct.unpack(f"{endian}i", latitude_raw[:4])[0]
        longitude = struct.unpack(f"{endian}i", longitude_raw[:4])[0]
        if latitude == FIT_INVALID_SINT32 or longitude == FIT_INVALID_SINT32:
            continue

        point = (latitude * SEMICIRCLE_TO_DEGREES, longitude * SEMICIRCLE_TO_DEGREES)
        if not (-90 <= point[0] <= 90 and -180 <= point[1] <= 180):
            raise ValueError("FIT record contains out-of-range coordinates")
        points.append(point)

    return [points] if len(points) >= 2 else []


def parse_activity_segments(filename: str, data: bytes) -> list[list[tuple[float, float]]]:
    lower = filename.strip().lower()
    if not is_supported_activity_file(lower):
        raise ValueError(f"Unsupported Strava activity route format: {filename}")
    if lower.endswith(".gz"):
        data = gzip.decompress(data)
        lower = lower[:-3]
    if lower.endswith(".gpx"):
        return parse_gpx(data)
    if lower.endswith(".fit"):
        return parse_fit(data)
    if lower.endswith(".tcx"):
        return parse_tcx(data)
    raise ValueError(f"Unsupported Strava activity route format: {filename}")
