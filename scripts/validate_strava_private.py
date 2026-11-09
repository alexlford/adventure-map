#!/usr/bin/env python3
"""Static checks limited to private-sync source and safe configuration, no data."""
import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "scripts/strava_private"
for path in sorted(source.glob("*.py")):
    ast.parse(path.read_text(), filename=path.name)
ast.parse((ROOT / "scripts/strava_private_sync.py").read_text())
package = json.loads((ROOT / "package.json").read_text())
for command in ("auth", "reauth", "status", "sync", "report", "disconnect", "purge",
                "auto-enable", "auto-disable", "auto-status"):
    assert package["scripts"]["strava:"+command] == "python3 scripts/strava_private_sync.py "+command
# There must be no connection to publication/import/watermark writers.
for name in ("auth.py", "transport.py", "sync.py", "review.py", "cli.py"):
    content = (source/name).read_text()
    for prohibited in ("materialize_strava_routes", "materialize_selected_strava_routes", "advance_strava_state"):
        assert prohibited not in content
print("Private-sync Python syntax, command wiring, and publication separation passed (no activity data read).")
