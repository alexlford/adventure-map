"""Synthetic deployment/schedule contracts; no credentials, networks or data."""
from datetime import datetime, timezone
from pathlib import Path
import unittest
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]


class DeploymentContractTests(unittest.TestCase):
    def test_free_allowance_profile_uses_default_database_and_build_machine(self):
        variables = (ROOT / "infra/strava-cloud/variables.tf").read_text()
        self.assertRegex(variables, r'variable "firestore_database"[\s\S]*?default\s*=\s*"\(default\)"')
        self.assertNotIn("machineType:", (ROOT / "cloud/strava/cloudbuild.yaml").read_text())

    def test_monday_nine_follows_both_daylight_saving_transitions(self):
        denver = ZoneInfo("America/Denver")
        for month, day, utc_hour in ((3, 2, 16), (3, 9, 15), (10, 26, 15), (11, 2, 16)):
            local = datetime(2026, month, day, 9, tzinfo=denver)
            self.assertEqual(local.weekday(), 0)
            self.assertEqual(local.astimezone(timezone.utc).hour, utc_hour)
        text = (ROOT / "infra/strava-cloud/main.tf").read_text()
        self.assertIn('"0 9 * * 1"', text)
        self.assertRegex((ROOT / "infra/strava-cloud/run.tf").read_text(), r'time_zone\s*=\s*"America/Denver"')

    def test_container_has_no_mac_or_publication_entrypoints(self):
        docker = (ROOT / "cloud/strava/Dockerfile").read_text()
        self.assertNotIn("COPY . .", docker)
        self.assertNotIn("COPY data", docker)
        self.assertNotIn("strava_private/cli.py", docker)
        self.assertNotIn("strava_private/auth.py", docker)
        self.assertNotIn("strava_private/automation.py", docker)
        self.assertIn("--require-hashes", docker)
        self.assertIn("USER 10001:10001", docker)

    def test_build_source_contains_static_assets_and_no_runtime_data(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("source_packager", ROOT / "cloud/strava/package_source.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        paths = {path.relative_to(ROOT).as_posix() for path in module.source_paths()}
        self.assertIn("scripts/strava_cloud/static/review.css", paths)
        self.assertIn("scripts/strava_cloud/static/review.js", paths)
        self.assertFalse(any(path.startswith("data/") for path in paths))
        self.assertFalse(any(".env" in path or path.endswith("cache.json") for path in paths))


if __name__ == "__main__":
    unittest.main()
