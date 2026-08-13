#!/usr/bin/env python3
"""Regression tests for the minimal FIT GPS-position reader."""

from __future__ import annotations

from fit_route import SEMICIRCLE_TO_DEGREES, parse_fit


def sint32(value: int) -> bytes:
    return int(value).to_bytes(4, byteorder="little", signed=True)


def uint32(value: int) -> bytes:
    return int(value).to_bytes(4, byteorder="little", signed=False)


def synthetic_fit() -> bytes:
    definition = bytes([
        0x40,
        0x00,
        0x00,
        20, 0,
        3,
        253, 4, 0x86,
        0, 4, 0x85,
        1, 4, 0x85,
    ])

    first = bytes([0x00]) + uint32(1_000) + sint32(1_000) + sint32(2_000)
    second = bytes([0x81]) + sint32(1_100) + sint32(2_100)
    third = bytes([0x00]) + uint32(1_002) + sint32(1_200) + sint32(2_200)
    data = definition + first + second + third

    header = bytearray(12)
    header[0] = 12
    header[1] = 0x20
    header[4:8] = len(data).to_bytes(4, "little")
    header[8:12] = b".FIT"
    return bytes(header) + data


def main() -> None:
    segments = parse_fit(synthetic_fit())
    assert len(segments) == 1
    assert len(segments[0]) == 3
    expected_raw = [(1_000, 2_000), (1_100, 2_100), (1_200, 2_200)]
    for actual, raw in zip(segments[0], expected_raw):
        assert abs(actual[0] - raw[0] * SEMICIRCLE_TO_DEGREES) < 1e-12
        assert abs(actual[1] - raw[1] * SEMICIRCLE_TO_DEGREES) < 1e-12

    try:
        parse_fit(b"not a fit file")
    except ValueError:
        pass
    else:
        raise AssertionError("invalid FIT input must fail closed")

    print("FIT route parser regression tests passed.")


if __name__ == "__main__":
    main()
