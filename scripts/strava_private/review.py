"""Pure, local review helpers. Inputs and outputs are transient private API data.

These helpers never select a canonical public record or publish geometry. API
streams are a distinct evidence source from the archive's original export GPS.
"""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
import math
import re
from typing import Any


TYPE_MAP = {
    "Run": "run", "TrailRun": "run", "VirtualRun": "run",
    "Ride": "bike", "MountainBikeRide": "bike", "GravelRide": "bike",
    "EMountainBikeRide": "bike", "EBikeRide": "bike", "VirtualRide": "bike",
    "NordicSki": "nordic", "AlpineSki": "skiing", "BackcountrySki": "skiing",
    "Snowboard": "skiing",
}
RACE_HINT = re.compile(r"\b(race|marathon|half|5k|10k|15k|20k|25k|50k|relay|classic|stampede|groove|run\s*ride)\b", re.I)
STORY_HINT = re.compile(r"\b(challenge|traverse|expedition|ultra|summit)\b", re.I)
MAJOR_HINTS = {
    "Boston Marathon": r"\bboston\b.*\bmarathon\b",
    "Berlin Marathon": r"\bberlin\b.*\bmarathon\b",
    "Chicago Marathon": r"\bchicago\b.*\bmarathon\b",
    "London Marathon": r"\blondon\b.*\bmarathon\b",
    "New York City Marathon": r"\b(?:new york(?: city)?|nyc)\b.*\bmarathon\b",
    "Tokyo Marathon": r"\btokyo\b.*\bmarathon\b",
    "Sydney Marathon": r"\bsydney\b.*\bmarathon\b",
}


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def _local_datetime(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        # Strava start_date_local uses a Z suffix to represent local wall time;
        # do not convert it to UTC or use it as a UTC sync checkpoint.
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None).isoformat(timespec="seconds")
    except ValueError:
        return None


def candidate(activity: dict[str, Any]) -> dict[str, Any]:
    """Suggest review actions using the archive's queue vocabulary, never promotion."""
    activity_id = activity.get("id")
    if isinstance(activity_id, bool) or not str(activity_id).isdigit():
        raise ValueError("Activity lacks a valid source identifier.")
    activity_type = activity.get("sport_type") or activity.get("type")
    category = TYPE_MAP.get(activity_type, "other")
    name = activity.get("name") if isinstance(activity.get("name"), str) else "Untitled activity"
    description = activity.get("description") if isinstance(activity.get("description"), str) else None
    hinted = bool(RACE_HINT.search(f"{name} {description or ''}"))
    race = hinted or (category == "run" and activity.get("workout_type") == 1)
    action = {
        "run": "review-only", "bike": "bike-review",
        "nordic": "candidate-outing", "skiing": "ski-passport",
    }.get(category, "review-only")
    if race and category in {"run", "bike", "nordic"}:
        action = "race-review"
    distance = _number(activity.get("distance"))
    gain = _number(activity.get("total_elevation_gain"))
    local_dt = _local_datetime(activity.get("start_date_local"))
    local_date = local_dt[:10] if local_dt else None
    story_hint = bool(STORY_HINT.search(f"{name} {description or ''}")) or (
        category == "run" and distance is not None and distance >= 42000
    )
    distance_hint = None
    if distance is not None:
        for label, meters in (("5K", 5000), ("10K", 10000), ("half marathon", 21097.5), ("marathon", 42195)):
            if abs(distance - meters) <= meters * .05:
                distance_hint = label
                break
        if distance > 44305:
            distance_hint = "ultramarathon distance"
    signals = []
    if hinted:
        signals.append("race term in source name or description")
    if category == "run" and activity.get("workout_type") == 1:
        signals.append("Strava race workout flag")
    major_hint = next((label for label, pattern in MAJOR_HINTS.items()
                       if category == "run" and re.search(pattern, name, re.I)), None)
    return {
        "stravaActivityId": str(activity_id),
        "date": local_date,
        "activityLocalDateTime": local_dt,
        "activityStartDateUtc": activity.get("start_date"),
        "sourceExternalId": activity.get("external_id"),
        "sourceUploadId": str(activity["upload_id"]) if activity.get("upload_id") is not None else None,
        "name": name,
        "activityType": activity_type,
        "maintenanceCategory": category,
        "suggestedAction": action,
        "distanceKm": round(distance / 1000, 3) if distance is not None else None,
        "distanceMi": round(distance / 1609.344, 2) if distance is not None else None,
        "elapsedSeconds": _number(activity.get("elapsed_time")),
        "movingSeconds": _number(activity.get("moving_time")),
        "elevationGainM": round(gain, 1) if gain is not None else None,
        "filename": None,
        "description": description,
        "source": "strava-api",
        "sourceAttribution": {"provider": "Strava", "device": activity.get("device_name")},
        "privateOnly": True,
        "publicationAllowed": False,
        "canonicalRecordId": None,
        "possibleStoryReview": story_hint,
        "raceEvidence": {"signals": signals, "distanceCategorySuggestion": distance_hint,
                         "worldMajorNameSuggestion": major_hint,
                         "identityStatus": "requires-owner-review", "officialResultVerified": False},
        "dayGroupingSuggestion": {"category": category, "date": local_date, "requiresReview": True}
            if category in {"nordic", "skiing"} and local_date else None,
        "classificationRequired": category == "bike",
        "slopesReconciliationRequired": category == "skiing",
        "privacy": {
            "private": activity.get("private"),
            "visibility": activity.get("visibility"),
            "routePrivacy": "unverified",
            "publicRoute": None,
        },
        "review": dict.fromkeys(("publish", "destination", "location", "classification", "routePrivacy", "notes")),
    }


def _stream(streams: dict[str, Any], name: str) -> list[Any]:
    value = streams.get(name)
    return value.get("data", []) if isinstance(value, dict) and isinstance(value.get("data"), list) else []


def _point(value: Any) -> bool:
    return (isinstance(value, (tuple, list)) and len(value) == 2
            and _number(value[0]) is not None and _number(value[1]) is not None
            and -90 <= value[0] <= 90 and -180 <= value[1] <= 180)


def _distance_m(a: list[float], b: list[float]) -> float:
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    dlat, dlon = lat2 - lat1, math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(h)))


def inspect_streams(streams: dict[str, Any], activity=None, previous=None) -> dict[str, Any]:
    """Preserve valid recorded points and split uncertainty; never bridge a gap.

    Segments include singleton observations so a gap or missing time cannot be
    converted into invented continuity. Coordinates retain Strava's lat/lng
    order. Flags describe possible quality problems without changing evidence.
    """
    previous_review = previous
    points, times = _stream(streams, "latlng"), _stream(streams, "time")
    segments: list[dict[str, Any]] = []
    flags: list[dict[str, Any]] = []
    current: list[list[float]] = []
    indices: list[int] = []
    previous: tuple[int, list[float], float | None] | None = None

    def flush() -> None:
        if current:
            segments.append({
                "evidenceType": "recorded", "geometryClass": "recorded-clean",
                "coordinatesLatLng": list(current), "sourcePointIndices": list(indices),
            })
            current.clear()
            indices.clear()

    for index, raw in enumerate(points):
        timestamp = _number(times[index]) if index < len(times) else None
        if timestamp is not None and timestamp < 0:
            timestamp = None
        if not _point(raw):
            flush()
            previous = None
            reversed_point = (isinstance(raw, (list, tuple)) and len(raw) == 2
                              and _point([raw[1], raw[0]]))
            flags.append({"sourcePointIndex": index, "reason":
                          "possible-coordinate-order-error" if reversed_point else "missing-or-invalid-gps"})
            continue
        point = list(raw)
        reason = None
        if timestamp is None or timestamp < 0:
            reason = "missing-time"
        elif previous is not None:
            previous_time = previous[2]
            if previous_time is None:
                reason = "missing-time"
            else:
                elapsed = timestamp - previous_time
                distance = _distance_m(previous[1], point)
                if elapsed <= 0:
                    reason = "non-increasing-time"
                elif elapsed > 120:
                    reason = "recording-gap"
                elif distance > 1000 or distance / elapsed > 60:
                    reason = "possible-gps-jump"
        if reason:
            flush()
            flags.append({"sourcePointIndex": index, "reason": reason})
        current.append(point)
        indices.append(index)
        previous = (index, point, timestamp)
    flush()
    mapped_distance = sum(_distance_m(a, b) for segment in segments
                          for a, b in zip(segment["coordinatesLatLng"], segment["coordinatesLatLng"][1:]))
    recorded_distance = _number(activity.get("distance")) if isinstance(activity, dict) else None
    difference = ((mapped_distance - recorded_distance) / recorded_distance * 100
                  if recorded_distance is not None and recorded_distance > 0 else None)
    if difference is not None and abs(difference) > 5:
        flags.append({"reason": "recorded-distance-disagreement", "requiresReview": True})
    old_distance = (_number(previous_review.get("mappedRecordedDistanceM"))
                    if isinstance(previous_review, dict) else None)
    if old_distance is not None and old_distance > 0 and mapped_distance < old_distance * .8:
        flags.append({"reason": "recorded-geometry-shortened", "requiresReview": True})
    recorded_points = [point for segment in segments for point in segment["coordinatesLatLng"]]
    geometry_digest = (hashlib.sha256(json.dumps(recorded_points, separators=(",", ":"),
                                                 allow_nan=False).encode()).hexdigest()
                       if recorded_points else None)
    return {
        "source": "strava-api-streams",
        "sourceEvidence": "transient-api-observation",
        "originalExportGps": False,
        "privateOnly": True,
        "publicationAllowed": False,
        "publicRoute": None,
        "routePrivacy": "unverified",
        "visibilityCompleteness": "unknown-do-not-reconstruct-hidden-sections",
        "status": "recorded-observations" if segments else "missing-gps",
        "sourcePointCount": len(points),
        "validPointCount": sum(len(segment["sourcePointIndices"]) for segment in segments),
        "mappedRecordedDistanceM": round(mapped_distance, 3),
        "recordedActivityDistanceM": recorded_distance,
        "distanceDifferencePercent": round(difference, 3) if difference is not None else None,
        "transientGeometryFingerprint": geometry_digest,
        "qualityReviewRequired": bool(flags),
        "flags": flags,
        "segments": segments,
        "inferredSegments": [],
    }
