"""Entirely synthetic tests: no API, Keychain or personal activity files."""

import json
import os
from pathlib import Path
import plistlib
import stat
import tempfile
import unittest
from unittest import mock

from .cleanup import LABEL, cleanup_status, install_cleanup
from .storage import CACHE_TTL, PrivateStore, StorageError


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.clock = 1000000.0
        self.store = PrivateStore(self.base / "private", repo_root=self.base / "repo", now=lambda: self.clock)

    def test_private_atomic_roundtrip_and_non_sliding_expiry(self):
        self.store.save_cache({"activities": {"synthetic": {"name": "Synthetic fixture"}}})
        deadline = self.store.read_json("cache.json")["expires_at"]
        self.clock += 100
        self.store.save_cache({"activities": {"synthetic": {"name": "Synthetic edit"}}})
        self.assertEqual(self.store.read_json("cache.json")["expires_at"], deadline)
        self.assertEqual(stat.S_IMODE(self.store.root.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((self.store.root / "cache.json").stat().st_mode), 0o600)
        self.assertEqual(self.store.load_cache()["activities"]["synthetic"]["name"], "Synthetic edit")

    def test_expiry_purges_queue_report_and_orphan_temporary(self):
        self.store.save_cache({"activities": [], "queue": [], "report": {"synthetic": True}})
        orphan = self.store.root / ".pending-synthetic"
        orphan.write_text("synthetic private content")
        orphan.chmod(0o600)
        os.utime(orphan, (self.clock, self.clock))
        self.clock += CACHE_TTL + 1
        self.assertIsNone(self.store.load_cache())
        self.assertFalse((self.store.root / "cache.json").exists())
        self.assertFalse(orphan.exists())

    def test_control_does_not_retain_activity_identifiers(self):
        value = {"schemaVersion": 1, "authorization_uncertain": True, "checkpoint": self.clock, "pending": {
            "after": 0, "before": self.clock, "page": 1, "mode": "incremental", "started_at": self.clock,
        }, "rate": {"read": {"limits": [100, 1000], "usage": [1, 1], "window": 1, "day": 1}},
            "events": [{"event": "started", "at": self.clock}]}
        self.store.save_control(value)
        self.assertEqual(self.store.load_control(), value)
        for invalid in ({"authorization_uncertain": "synthetic"}, {"activity_id": "synthetic"}, {"checkpoint": "synthetic"}, {"rate": {"activity": "synthetic"}},
                        {"events": [{"event": "synthetic private name", "at": self.clock}]}):
            with self.assertRaises(StorageError):
                self.store.save_control(invalid)
        self.assertEqual(self.store.load_control(), value)

    def test_rejects_repository_and_cloud_locations(self):
        for root, repo in ((self.base / "repo/private", self.base / "repo"),
                           (self.base / "outside/../repo/private", self.base / "repo"),
                           (self.base / "Dropbox/private", self.base / "repo")):
            with self.assertRaises(StorageError):
                PrivateStore(root, repo_root=repo)

    def test_rejects_directory_and_file_symlinks_and_weak_permissions(self):
        alias = self.base / "alias"
        alias.symlink_to(self.store.root, target_is_directory=True)
        with self.assertRaises(StorageError):
            PrivateStore(alias, repo_root=self.base / "repo")
        self.store.root.chmod(0o755)
        with self.assertRaises(StorageError):
            self.store.load_cache()
        self.store.root.chmod(0o700)
        destination = self.store.root / "cache.json"
        destination.symlink_to(self.base / "outside")
        with self.assertRaises(StorageError):
            self.store.save_cache({})
        destination.unlink()
        destination.write_text(json.dumps({"expires_at": self.clock + 1, "payload": {}}))
        destination.chmod(0o644)
        with self.assertRaises(StorageError):
            self.store.load_cache()

    def test_atomic_failure_preserves_previous_state(self):
        self.store.save_cache({"synthetic": "old"})
        with mock.patch("os.replace", side_effect=OSError("synthetic failure")):
            with self.assertRaises(StorageError):
                self.store.save_cache({"synthetic": "new"})
        self.assertEqual(self.store.load_cache(), {"synthetic": "old"})
        self.assertFalse(list(self.store.root.glob(".pending-*")))

    def test_lock_blocks_second_command_and_releases_on_failure(self):
        with self.store.locked():
            with self.assertRaises(StorageError):
                with self.store.locked():
                    self.fail("second lock acquired")
        with self.assertRaises(ValueError):
            with self.store.locked():
                raise ValueError("synthetic failure")
        with self.store.locked():
            pass

    def test_cache_envelope_and_paths_are_fail_closed(self):
        with self.assertRaises(StorageError):
            self.store.write_json("../../escape", {})
        with self.assertRaises(StorageError):
            self.store.save_cache({}, self.clock + CACHE_TTL + 1)
        with self.assertRaises(StorageError):
            self.store.write_json("cache.json", {"activity": "synthetic"})
        self.store.save_cache({"synthetic": True})
        self.store.clear_activity_data()
        self.assertIsNone(self.store.load_cache())

    def test_invalid_cache_cannot_block_purge_or_disconnect(self):
        path = self.store.root / "cache.json"
        for invalid in ("not synthetic JSON", json.dumps({"invalid": "synthetic envelope"})):
            path.write_text(invalid)
            path.chmod(0o600)
            with self.store.locked():
                self.assertIsNone(self.store.load_cache())
                self.store.clear_activity_data()
            self.assertFalse(path.exists())


class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name).resolve()
        self.calls = []

    def runner(self, arguments, **kwargs):
        self.calls.append(arguments)
        return mock.Mock(returncode=0)

    def test_hourly_cleanup_has_only_local_command_no_logs_or_credentials(self):
        path = install_cleanup("/synthetic/repo/scripts/strava_private_sync.py", home=self.home,
                               runner=self.runner, python="/synthetic/python3")
        config = plistlib.loads(path.read_bytes())
        self.assertEqual(config["StartInterval"], 3600)
        self.assertTrue(config["RunAtLoad"])
        self.assertEqual(config["ProgramArguments"], ["/synthetic/python3", "/synthetic/repo/scripts/strava_private_sync.py", "purge-local"])
        self.assertNotIn("StandardOutPath", config)
        self.assertNotIn("StandardErrorPath", config)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertTrue(any("bootstrap" in call for call in self.calls))
        self.calls.clear()
        install_cleanup("/synthetic/repo/scripts/strava_private_sync.py", home=self.home,
                        runner=self.runner, python="/synthetic/python3")
        self.assertFalse(any("bootstrap" in call for call in self.calls))
        self.assertTrue(cleanup_status(home=self.home, runner=self.runner))

    def test_launchctl_failure_is_required_before_authorization(self):
        with self.assertRaises(StorageError):
            install_cleanup(home=self.home, runner=lambda *args, **kwargs: mock.Mock(returncode=1))

    def test_unsafe_cleanup_plist_is_rejected(self):
        directory = self.home / "Library/LaunchAgents"
        directory.mkdir(parents=True, mode=0o700)
        path = directory / (LABEL + ".plist")
        path.symlink_to(self.home / "outside")
        with self.assertRaises(StorageError):
            install_cleanup(home=self.home, runner=self.runner)


if __name__ == "__main__":
    unittest.main()
