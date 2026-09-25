#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]

def load(rel):
    return json.loads((root / rel).read_text())

def save(rel, payload):
    (root / rel).write_text(json.dumps(payload, indent=2) + "\n")

manifest = load("data/evidence-sources.json")
source_id = "editorial-granby-ranch-skinning-2025"
if not any(s.get("id") == source_id for s in manifest["sources"]):
    manifest["sources"].append({
        "id": source_id,
        "path": "data/granby-ranch-skinning-2025.json",
        "layer": "editorial",
        "description": "Granby Ranch skinning day recovered from Alex's Strava FIT export and reconciled to the ski log."
    })
if source_id not in manifest["loadOrder"]:
    idx = manifest["loadOrder"].index("official-results-base")
    manifest["loadOrder"].insert(idx, source_id)
manifest["updatedOn"] = "2026-09-25"
save("data/evidence-sources.json", manifest)

catalog = load("data/route-catalog.json")
route_file = "data/strava-route-full-resolution-granby-ranch-skinning-2025.json"
if route_file not in catalog["polylineFiles"]:
    anchor = "data/strava-route-full-resolution-colorado-triathlon-ski-2023.json"
    idx = catalog["polylineFiles"].index(anchor) + 1 if anchor in catalog["polylineFiles"] else len(catalog["polylineFiles"])
    catalog["polylineFiles"].insert(idx, route_file)
catalog["updatedOn"] = "2026-09-25"
save("data/route-catalog.json", catalog)
