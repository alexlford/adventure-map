#!/usr/bin/env python3
"""Regression tests for dependency-free Strava route format decoding."""

from __future__ import annotations

import gzip
import importlib.util
import struct
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("strava_route_formats.py")
spec = importlib.util.spec_from_file_location("strava_route_formats", MODULE_PATH)
formats = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(formats)


def semicircles(degrees: float) -> int:
    return round(degrees * (2**31) / 180.0)


def fit_fixture() -> bytes:
    fields = bytes([
        253, 4, 0x86,  # timestamp, uint32
        0, 4, 0x85,    # position_lat, sint32
        1, 4, 0x85,    # position_long, sint32
    ])
    definition = bytes([0x40, 0, 0]) + struct.pack("<H", 20) + bytes([3]) + fields
    first = bytes([0x00]) + struct.pack(
        "<Iii", 100, semicircles(39.7478666), semicircles(-104.9481134)
    )
    # Compressed timestamp header for local message 0; timestamp bytes are omitted.
    second = bytes([0x81]) + struct.pack(
        "<ii", semicircles(39.7480000), semicircles(-104.9485000)
    )
    payload = definition + first + second
    header = bytes([14, 0x20]) + struct.pack("<H", 0) + struct.pack("<I", len(payload)) + b".FIT" + b"\x00\x00"
    return header + payload + b"\x00\x00"


gpx = b"""<?xml version='1.0'?><gpx><trk><trkseg>
<trkpt lat='39.0' lon='-105.0'/><trkpt lat='39.1' lon='-105.1'/>
</trkseg></trk></gpx>"""
tcx = b"""          <?xml version='1.0' encoding='UTF-8'?>
<TrainingCenterDatabase><Activities><Activity><Lap><Track>
<Trackpoint><Position><LatitudeDegrees>39.0</LatitudeDegrees><LongitudeDegrees>-105.0</LongitudeDegrees></Position></Trackpoint>
<Trackpoint><Position><LatitudeDegrees>39.1</LatitudeDegrees><LongitudeDegrees>-105.1</LongitudeDegrees></Position></Trackpoint>
</Track></Lap></Activity></Activities></TrainingCenterDatabase>"""

assert formats.is_supported_activity_file("activities/example.GPX.GZ")
assert formats.is_supported_activity_file("activities/example.fit.gz")
assert formats.is_supported_activity_file("activities/example.tcx")
assert not formats.is_supported_activity_file("activities/example.csv")

assert formats.parse_activity_segments("example.gpx", gpx) == [[(39.0, -105.0), (39.1, -105.1)]]
assert formats.parse_activity_segments("example.tcx.gz", gzip.compress(tcx)) == [[(39.0, -105.0), (39.1, -105.1)]]
fit_points = formats.parse_activity_segments("example.fit.gz", gzip.compress(fit_fixture()))
assert len(fit_points) == 1 and len(fit_points[0]) == 2
assert abs(fit_points[0][0][0] - 39.7478666) < 1e-5
assert abs(fit_points[0][0][1] + 104.9481134) < 1e-5
assert abs(fit_points[0][1][0] - 39.7480000) < 1e-5
assert abs(fit_points[0][1][1] + 104.9485000) < 1e-5

try:
    formats.parse_activity_segments("example.csv", b"x")
except ValueError:
    pass
else:
    raise AssertionError("Unsupported activity route formats must fail closed")

print("Route materializer format tests passed.")
