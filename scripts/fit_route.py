#!/usr/bin/env python3
"""Minimal FIT track-position reader for Strava export route materialization.

The Adventures pipeline only needs GPS positions from FIT record messages. This
module intentionally implements that narrow contract rather than depending on a
third-party FIT package: it reads FIT definition messages, skips fields by their
published byte sizes, and extracts record (global message 20) position_lat and
position_long values.
"""

from __future__ import annotations

from dataclasses import dataclass

SEMICIRCLE_TO_DEGREES = 180.0 / (2**31)
FIT_SIGNATURE = b".FIT"
RECORD_MESSAGE = 20
POSITION_LAT_FIELD = 0
POSITION_LON_FIELD = 1
TIMESTAMP_FIELD = 253
INVALID_SINT32 = 0x7FFFFFFF


@dataclass(frozen=True)
class FieldDefinition:
    number: int
    size: int
    base_type: int


@dataclass(frozen=True)
class MessageDefinition:
    architecture: int
    global_message: int
    fields: tuple[FieldDefinition, ...]
    developer_field_sizes: tuple[int, ...]

    @property
    def byteorder(self) -> str:
        return "little" if self.architecture == 0 else "big"


def _require(data: bytes, index: int, size: int, label: str) -> None:
    if index < 0 or size < 0 or index + size > len(data):
        raise ValueError(f"Truncated FIT {label}")


def _read_sint32(raw: bytes, byteorder: str) -> int:
    if len(raw) < 4:
        raise ValueError("FIT position field is shorter than four bytes")
    return int.from_bytes(raw[:4], byteorder=byteorder, signed=True)


def _decode_record(
    data: bytes,
    index: int,
    definition: MessageDefinition,
    *,
    compressed_timestamp: bool,
) -> tuple[int, tuple[float, float] | None]:
    lat: int | None = None
    lon: int | None = None

    for field in definition.fields:
        if compressed_timestamp and field.number == TIMESTAMP_FIELD:
            continue
        _require(data, index, field.size, "data field")
        raw = data[index:index + field.size]
        index += field.size
        if definition.global_message != RECORD_MESSAGE:
            continue
        if field.number == POSITION_LAT_FIELD:
            lat = _read_sint32(raw, definition.byteorder)
        elif field.number == POSITION_LON_FIELD:
            lon = _read_sint32(raw, definition.byteorder)

    for size in definition.developer_field_sizes:
        _require(data, index, size, "developer field")
        index += size

    if definition.global_message != RECORD_MESSAGE or lat is None or lon is None:
        return index, None
    if lat == INVALID_SINT32 or lon == INVALID_SINT32:
        return index, None

    latitude = lat * SEMICIRCLE_TO_DEGREES
    longitude = lon * SEMICIRCLE_TO_DEGREES
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise ValueError("FIT record contains an out-of-range coordinate")
    return index, (latitude, longitude)


def parse_fit(data: bytes) -> list[list[tuple[float, float]]]:
    """Return source-order FIT GPS positions as one track segment.

    Large recording gaps are deliberately not interpreted here. The route
    materializer applies its existing distance-based gap splitter afterward so
    GPX and FIT sources share the same publication behavior.
    """
    if len(data) < 12:
        raise ValueError("FIT file is shorter than the minimum header")

    header_size = data[0]
    if header_size < 12:
        raise ValueError(f"Unsupported FIT header size: {header_size}")
    _require(data, 0, header_size, "header")
    if data[8:12] != FIT_SIGNATURE:
        raise ValueError("FIT signature is missing")

    data_size = int.from_bytes(data[4:8], byteorder="little", signed=False)
    index = header_size
    data_end = index + data_size
    if data_end > len(data):
        raise ValueError("FIT data section extends beyond the file")

    definitions: dict[int, MessageDefinition] = {}
    positions: list[tuple[float, float]] = []

    while index < data_end:
        header = data[index]
        index += 1

        if header & 0x80:
            local_message = (header >> 5) & 0x03
            definition = definitions.get(local_message)
            if definition is None:
                raise ValueError(f"FIT compressed data references undefined local message {local_message}")
            index, point = _decode_record(
                data,
                index,
                definition,
                compressed_timestamp=True,
            )
            if point is not None:
                positions.append(point)
            continue

        is_definition = bool(header & 0x40)
        has_developer_fields = bool(header & 0x20)
        local_message = header & 0x0F

        if is_definition:
            _require(data, index, 5, "definition header")
            index += 1
            architecture = data[index]
            index += 1
            if architecture not in (0, 1):
                raise ValueError(f"Unsupported FIT architecture value: {architecture}")
            byteorder = "little" if architecture == 0 else "big"
            global_message = int.from_bytes(data[index:index + 2], byteorder=byteorder, signed=False)
            index += 2
            field_count = data[index]
            index += 1

            fields: list[FieldDefinition] = []
            _require(data, index, field_count * 3, "field definitions")
            for _ in range(field_count):
                fields.append(FieldDefinition(data[index], data[index + 1], data[index + 2]))
                index += 3

            developer_field_sizes: list[int] = []
            if has_developer_fields:
                _require(data, index, 1, "developer field count")
                developer_count = data[index]
                index += 1
                _require(data, index, developer_count * 3, "developer field definitions")
                for _ in range(developer_count):
                    developer_field_sizes.append(data[index + 1])
                    index += 3

            definitions[local_message] = MessageDefinition(
                architecture=architecture,
                global_message=global_message,
                fields=tuple(fields),
                developer_field_sizes=tuple(developer_field_sizes),
            )
            continue

        definition = definitions.get(local_message)
        if definition is None:
            raise ValueError(f"FIT data references undefined local message {local_message}")
        index, point = _decode_record(
            data,
            index,
            definition,
            compressed_timestamp=False,
        )
        if point is not None:
            positions.append(point)

    if index != data_end:
        raise ValueError("FIT parser did not terminate at the declared data boundary")
    return [positions] if len(positions) >= 2 else []
