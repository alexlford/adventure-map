#!/usr/bin/env python3
"""Regression tests for source route extraction from FIT and TCX."""

from __future__ import annotations

import struct

from materialize_strava_routes_all import parse_fit, parse_tcx


def semicircles(degrees: float) -> int:
    return round(degrees * (2 ** 31) / 180.0)


def synthetic_fit(points: list[tuple[float, float]]) -> bytes:
    definition = bytes([
        0x40,  # definition message, local message 0
        0x00,  # reserved
        0x00,  # little-endian architecture
    ]) + struct.pack('<H', 20) + bytes([
        0x02,        # two fields
        0x00, 0x04, 0x85,  # position_lat, sint32
        0x01, 0x04, 0x85,  # position_long, sint32
    ])
    records = b''.join(
        bytes([0x00]) + struct.pack('<ii', semicircles(lat), semicircles(lon))
        for lat, lon in points
    )
    payload = definition + records
    header = bytes([12, 0x10]) + struct.pack('<H', 1000) + struct.pack('<I', len(payload)) + b'.FIT'
    return header + payload


def assert_close(actual: tuple[float, float], expected: tuple[float, float], tolerance: float = 1e-5) -> None:
    if abs(actual[0] - expected[0]) > tolerance or abs(actual[1] - expected[1]) > tolerance:
        raise AssertionError(f'{actual} is not within {tolerance} degrees of {expected}')


def test_fit() -> None:
    expected = [
        (39.7392, -104.9903),
        (39.7395, -104.9898),
        (39.7400, -104.9891),
    ]
    segments = parse_fit(synthetic_fit(expected))
    if len(segments) != 1 or len(segments[0]) != len(expected):
        raise AssertionError(f'FIT parser returned unexpected segment structure: {segments!r}')
    for actual, target in zip(segments[0], expected):
        assert_close(actual, target)


def test_tcx() -> None:
    payload = b'''<?xml version="1.0" encoding="UTF-8"?>
    <TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
      <Activities><Activity Sport="Biking"><Lap StartTime="2026-01-01T00:00:00Z"><Track>
        <Trackpoint><Position><LatitudeDegrees>39.7392</LatitudeDegrees><LongitudeDegrees>-104.9903</LongitudeDegrees></Position></Trackpoint>
        <Trackpoint><Position><LatitudeDegrees>39.7395</LatitudeDegrees><LongitudeDegrees>-104.9898</LongitudeDegrees></Position></Trackpoint>
      </Track></Lap></Activity></Activities>
    </TrainingCenterDatabase>'''
    segments = parse_tcx(payload)
    if segments != [[(39.7392, -104.9903), (39.7395, -104.9898)]]:
        raise AssertionError(f'TCX parser returned unexpected geometry: {segments!r}')


if __name__ == '__main__':
    test_fit()
    test_tcx()
    print('FIT and TCX source-route extraction tests passed.')
