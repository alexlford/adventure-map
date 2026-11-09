"""Entirely synthetic packaging and deployment-metadata contract tests."""
import argparse
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

HERE = Path(__file__).resolve().parent


def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


packager = module("package_source")
preflight = module("preflight")


class PackagingTests(unittest.TestCase):
    def fixture(self, directory):
        root = Path(directory)
        for path in [*(root / "scripts/strava_private" / name for name in packager.PRIVATE_MODULES), *(root / "cloud/strava" / name for name in packager.BUILD_FILES), root / "scripts/strava_cloud/worker.py", root / "scripts/strava_cloud/web.py", root / "scripts/strava_cloud/static/review.css", root / "scripts/strava_cloud/static/review.js"]:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("synthetic source\n")
        return root

    def test_archive_contains_static_assets_and_only_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self.fixture(temporary)
            # Excluded sentinels are synthetic; the packager never opens them.
            for name in ("real-cache.json", "reports.json", "test_fixture.py"):
                (root / "scripts/strava_cloud" / name).write_text("synthetic excluded")
            (root / "private-export.json").write_text("synthetic excluded")
            destination = root / "source.tar.gz"
            packager.package(destination, root)
            with tarfile.open(destination) as archive:
                names = archive.getnames()
                self.assertIn("scripts/strava_cloud/static/review.css", names)
                self.assertIn("scripts/strava_cloud/static/review.js", names)
                self.assertNotIn("private-export.json", names)
                self.assertFalse(any("cache" in name or "reports" in name or "test_fixture" in name for name in names))
                self.assertTrue(all(item.mtime == 0 and item.uid == 0 and item.mode == 0o644 for item in archive))

    def test_deterministic_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self.fixture(temporary)
            first, second = root / "first.tar.gz", root / "second.tar.gz"
            packager.package(first, root)
            packager.package(second, root)
            self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_static_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self.fixture(temporary)
            path = root / "scripts/strava_cloud/static/review.js"
            path.unlink()
            path.symlink_to(root / "scripts/strava_cloud/worker.py")
            with self.assertRaisesRegex(ValueError, "source_file_invalid"):
                packager.package(root / "bad.tar.gz", root)

    def test_existing_destination_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self.fixture(temporary)
            destination = root / "existing.tar.gz"
            destination.write_text("synthetic")
            with self.assertRaisesRegex(ValueError, "destination_exists"):
                packager.package(destination, root)


class PreflightTests(unittest.TestCase):
    def bucket(self):
        return {"public_access_prevention": "enforced", "uniform_bucket_level_access": True, "versioning_enabled": False, "soft_delete_policy": {"retentionDurationSeconds": "0"}, "lifecycle_config": {"rule": [{"action": {"type": "Delete"}, "condition": {"age": 2}}]}}

    def test_safe_bucket_and_every_retention_regression(self):
        self.assertTrue(preflight.safe_bucket(self.bucket()))
        for key, value in (("public_access_prevention", "inherited"), ("uniform_bucket_level_access", False), ("versioning_enabled", True), ("soft_delete_policy", {"retentionDurationSeconds": "604800"}), ("retention_policy", {"retentionPeriod": "172800"}), ("lifecycle_config", {"rule": []})):
            data = self.bucket()
            data[key] = value
            self.assertFalse(preflight.safe_bucket(data), key)

    def test_public_bindings_rejected(self):
        for member in ("allUsers", "allAuthenticatedUsers"):
            self.assertTrue(preflight.public_binding({"bindings": [{"members": [member]}]}))
        self.assertFalse(preflight.public_binding({"bindings": [{"members": ["user:owner@example.com"]}]}))

    def test_scheduler_state_requires_exact_expected_state(self):
        self.assertTrue(preflight.scheduler_state("PAUSED", False))
        self.assertFalse(preflight.scheduler_state("ENABLED", False))
        self.assertTrue(preflight.scheduler_state("ENABLED", True))
        self.assertFalse(preflight.scheduler_state("PAUSED", True))
        self.assertFalse(preflight.scheduler_state("DISABLED", True))
        self.assertFalse(preflight.scheduler_state(None, False))

    def test_custom_logging_sink_fails_closed(self):
        self.assertTrue(preflight.safe_project_sinks([{"name": "_Default"}, {"name": "_Required"}]))
        self.assertTrue(preflight.safe_project_sinks([{"name": "custom", "disabled": True}]))
        self.assertFalse(preflight.safe_project_sinks([{"name": "custom", "disabled": False}]))
        self.assertFalse(preflight.safe_project_sinks([{"name": "custom"}]))

    def test_bootstrap_queries_no_content_services(self):
        commands = []
        def fake(arguments):
            commands.append(arguments)
            if arguments[0] == "projects":
                return {"lifecycleState": "ACTIVE"}
            if arguments[0] == "billing":
                return {"billingEnabled": True}
            return [{"config": {"name": name}} for name in preflight.APIS]
        results = preflight.check(argparse.Namespace(project="synthetic-project", phase="bootstrap"), fake)
        self.assertTrue(all(passed for _, passed in results))
        self.assertEqual({command[0] for command in commands}, {"projects", "billing", "services"})

    def test_deployed_preflight_reads_default_sink_metadata_and_fails_closed(self):
        args = argparse.Namespace(project="synthetic-project", phase="deployed", prefix="synthetic",
                                  region="us-central1", database="(default)", owner_email="owner@example.com",
                                  ancestor_sinks_reviewed=False, expect_active=False)
        exclusions = [
            {"name": "synthetic-no-request-urls", "filter": 'log_id("run.googleapis.com/requests")'},
            {"name": "synthetic-no-iap-access-urls", "filter": 'log_id("cloudaudit.googleapis.com/data_access")'},
            {"name": "synthetic-fixed-status-only", "filter": 'log_id("run.googleapis.com/stdout") NOT jsonPayload.status="completed"'},
        ]
        commands = []

        def fake(command):
            commands.append(command)
            group = command[:3]
            if command[0] == "projects":
                return {"lifecycleState": "ACTIVE", "projectNumber": "123456789012"}
            if command[0] == "billing":
                return {"billingEnabled": True}
            if command[0] == "services":
                return [{"config": {"name": name}} for name in preflight.APIS]
            if group == ["logging", "sinks", "list"]:
                return [{"name": "_Default"}, {"name": "_Required"}]
            if group == ["logging", "sinks", "describe"]:
                self.assertEqual(command[3], "_Default")
                return {"exclusions": exclusions}
            if group == ["storage", "buckets", "describe"]:
                return self.bucket()
            if group == ["storage", "buckets", "get-iam-policy"]:
                return {"bindings": []}
            if group == ["firestore", "databases", "describe"]:
                return {"pointInTimeRecoveryEnablement": "POINT_IN_TIME_RECOVERY_DISABLED"}
            if command[:4] == ["firestore", "backups", "schedules", "list"]:
                return []
            if group == ["run", "services", "describe"]:
                return {"metadata": {"annotations": {"run.googleapis.com/iap-enabled": "true"}}}
            if group == ["run", "services", "get-iam-policy"]:
                return {"bindings": [{"role": "roles/run.invoker", "members": [
                    "serviceAccount:service-123456789012@gcp-sa-iap.iam.gserviceaccount.com"]}]}
            if group == ["iap", "web", "get-iam-policy"]:
                return {"bindings": [{"role": "roles/iap.httpsResourceAccessor", "members": ["user:owner@example.com"]}]}
            if group == ["scheduler", "jobs", "describe"]:
                mode = command[3].removeprefix("synthetic-")
                return {"state": "PAUSED", "schedule": {"weekly": "0 9 * * 1", "recovery": "17 * * * *", "cleanup": "37 * * * *"}[mode],
                        "timeZone": "America/Denver", "httpTarget": {"oauthToken": {
                            "serviceAccountEmail": "synthetic-scheduler@synthetic-project.iam.gserviceaccount.com"}}}
            self.fail("Unexpected metadata or content command: " + repr(command))

        self.assertTrue(all(passed for _, passed in preflight.check(args, fake)))
        self.assertIn(["logging", "sinks", "describe", "_Default", "--project=synthetic-project", "--format=json(exclusions)"], commands)
        for entry, check in zip(exclusions, ("request_logs_excluded", "iap_access_urls_excluded", "unstructured_runtime_excluded")):
            entry["disabled"] = True
            self.assertFalse(dict(preflight.check(args, fake))[check])
            entry.pop("disabled")


if __name__ == "__main__":
    unittest.main()
