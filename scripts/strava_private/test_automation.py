"""Synthetic LaunchAgent tests; no Keychain, credentials, or API calls."""
import os
from pathlib import Path
import plistlib
import stat
import sys
import tempfile
import unittest

from . import automation
from .storage import StorageError


class Runner:
    def __init__(self):
        self.calls = []

    def __call__(self, args, **_kwargs):
        self.calls.append(tuple(args))
        class Result:
            returncode = 0
        return Result()


class AutomationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.wrapper = self.home / "source" / "scripts" / "strava_private_sync.py"
        self.wrapper.parent.mkdir(mode=0o700, parents=True)
        self.wrapper.write_text("# synthetic local script\n")
        self.runner = Runner()

    def test_job_contains_no_credentials_or_private_api_data(self):
        path = automation.install_auto_sync(self.wrapper, home=self.home,
                                            runner=self.runner, python=sys.executable)
        data = path.read_bytes()
        config = plistlib.loads(data)
        self.assertEqual(config["ProgramArguments"][-1], "sync-auto")
        self.assertEqual(config["StartInterval"], 21600)
        self.assertFalse(config["RunAtLoad"])
        self.assertNotIn("EnvironmentVariables", config)
        self.assertNotIn("StandardOutPath", config)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertNotIn(b"strava-client-secret", data)
        self.assertEqual(config["WorkingDirectory"], str(self.wrapper.parents[1]))

    def test_install_is_idempotent_and_disable_removes_file(self):
        path = automation.install_auto_sync(self.wrapper, home=self.home,
                                            runner=self.runner, python=sys.executable)
        first = path.read_bytes()
        automation.install_auto_sync(self.wrapper, home=self.home,
                                     runner=self.runner, python=sys.executable)
        self.assertEqual(path.read_bytes(), first)
        self.assertTrue(automation.auto_sync_status(home=self.home, runner=self.runner))
        automation.remove_auto_sync(home=self.home, runner=self.runner)
        self.assertFalse(path.exists())
        self.assertFalse(automation.auto_sync_status(home=self.home, runner=self.runner))

    def test_unsafe_agent_symlink_is_rejected(self):
        directory = self.home / "Library" / "LaunchAgents"
        directory.mkdir(parents=True, mode=0o700)
        path = directory / (automation.LABEL + ".plist")
        target = self.home / "other"
        target.write_text("synthetic")
        path.symlink_to(target)
        with self.assertRaises(StorageError):
            automation.install_auto_sync(self.wrapper, home=self.home,
                                         runner=self.runner, python=sys.executable)


if __name__ == "__main__":
    unittest.main()
