#!/usr/bin/env python3
"""Source/configuration checks only: never load cloud credentials or API data."""
import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
cloud = ROOT / "scripts/strava_cloud"
for path in sorted(cloud.glob("*.py")):
    ast.parse(path.read_text(), filename=str(path.relative_to(ROOT)))
    if not path.name.startswith("test_"):
        for prohibited in ("materialize_strava_routes", "advance_strava_state", "KeychainStore",
                           "from ..strava_private.cli", "from ..strava_private.automation"):
            assert prohibited not in path.read_text(), (path.name, prohibited)
scripts = json.loads((ROOT / "package.json").read_text())["scripts"]
assert scripts["test:strava-cloud"] == 'python3 -m unittest discover -s scripts/strava_cloud -t . -p "test_*.py"'
assert scripts["validate:strava-cloud"] == "python3 scripts/validate_strava_cloud.py"
docker = (ROOT / "cloud/strava/Dockerfile").read_text()
assert re.search(r"^FROM python:[^\s]+@sha256:[a-f0-9]{64}$", docker, re.M)
assert "--require-hashes" in docker and "USER 10001:10001" in docker
assert not re.search(r"^\s*COPY\s+\.\s", docker, re.M)
assert not re.search(r"^\s*(ARG|ENV)\s+.*(CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN)", docker, re.M)
terraform = "\n".join(path.read_text() for path in (ROOT / "infra/strava-cloud").glob("*.tf"))
assert '"0 9 * * 1"' in terraform and '"America/Denver"' in terraform
assert "oauth_and_first_sync_verified" in terraform and "iap_enabled" in terraform
assert "retention_duration_seconds = 0" in terraform
assert "secret_data" not in terraform
assert not re.search(r'member\s*=\s*"(?:allUsers|allAuthenticatedUsers)"', terraform)
print("Cloud Python, isolated build, pinned dependencies, schedule, IAM and publication boundaries passed (source only).")
