#!/usr/bin/env python3
"""Smoke-test the incremental Strava maintenance pipeline against a tiny fixture."""

from __future__ import annotations

import csv
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN_PATH = ROOT / "scripts" / "scan_strava_export.py"
ADVANCE_PATH = ROOT / "scripts" / "advance_strava_state.py"

spec = importlib.util.spec_from_file_location("scan_strava_export", SCAN_PATH)
scanner = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(scanner)

headers = [
    "Activity ID", "Activity Date", "Activity Name", "Activity Type",
    "Activity Description", "Elapsed Time", "Distance", "Moving Time",
    "Elevation Gain", "Filename"
]
rows = [
    ["90000000001", "Aug 09, 2026, 11:00:00 PM", "Old training run", "Run", "", "1800", "5000", "1700", "20", "activities/old.fit.gz"],
    ["90000000002", "Aug 10, 2026, 08:00:00 AM", "Morning Run", "Run", "", "3600", "10000", "3500", "50", "activities/run.fit.gz"],
    ["90000000003", "Aug 10, 2026, 09:00:00 AM", "Morning Ride", "Ride", "", "5400", "20000", "5000", "400", "activities/ride.fit.gz"],
    ["90000000004", "Aug 10, 2026, 10:00:00 AM", "Nordic Morning", "Nordic Ski", "", "4000", "12000", "3800", "180", "activities/nordic.fit.gz"],
    ["90000000005", "Aug 10, 2026, 11:00:00 AM", "Ski Day", "Alpine Ski", "", "15000", "30000", "9000", "2500", "activities/ski.fit.gz"],
    ["90000000006", "Aug 10, 2026, 01:00:00 PM", "Strength", "Weight Training", "", "2400", "0", "2400", "0", "activities/strength.fit.gz"],
]

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    csv_path = tmp / "activities.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        writer.writerows(rows)

    queue = scanner.build_queue(csv_path)
    assert queue["summary"]["sourceActivities"] == 6
    assert queue["summary"]["newRelevantActivities"] == 4
    assert queue["summary"]["atOrBeforeWatermarkSkipped"] == 1
    assert queue["summary"]["unsupportedNewTypesSkipped"] == 1

    by_category = {item["maintenanceCategory"]: item for item in queue["candidates"]}
    assert by_category["run"]["suggestedAction"] == "review-only"
    assert by_category["bike"]["suggestedAction"] == "bike-review"
    assert by_category["nordic"]["suggestedAction"] == "candidate-outing"
    assert by_category["skiing"]["suggestedAction"] == "ski-passport"
    assert by_category["run"]["distanceKm"] == 10.0
    assert by_category["run"]["distanceMi"] == 6.21
    assert queue["stateProposal"]["lastSeenActivityLocalDateTime"] == "2026-08-10T13:00:00"

    queue_path = tmp / "queue.json"
    queue_path.write_text(json.dumps(queue), encoding="utf-8")
    state_path = tmp / "state.json"
    subprocess.run([
        sys.executable, str(ADVANCE_PATH), str(queue_path),
        "--state", str(state_path), "--confirm-reviewed"
    ], check=True, capture_output=True, text=True)
    state = json.loads(state_path.read_text(encoding="utf-8"))
    assert state["lastSeenActivityLocalDateTime"] == "2026-08-10T13:00:00"
    assert state["activityCount"] == 6

print("Update pipeline smoke test passed.")
