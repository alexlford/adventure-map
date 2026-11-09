"""macOS LaunchAgent for private scheduled Strava polling.

This agent uses an existing user-approved Keychain grant. No credentials,
activity data, GPS geometry or secrets are stored in the plist or logs.
It only runs when the owner's Mac is awake and logged in.
"""
from __future__ import annotations

import os
from pathlib import Path
import plistlib
import secrets
import stat
import subprocess
import sys

from .cleanup import _directory
from .storage import StorageError

LABEL = "org.adventurepassport.strava-private-sync"
WEEKLY_CALENDAR = {"Weekday": 1, "Hour": 9, "Minute": 0}  # Monday at 9 AM, Mac local time


def _run(runner, args):
    try:
        return runner(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                      stderr=subprocess.DEVNULL, check=False).returncode
    except OSError:
        raise StorageError("macOS launchctl is unavailable.") from None


def _agent_file(home):
    return _directory(Path.home() if home is None else home) / (LABEL + ".plist")


def install_auto_sync(wrapper_path, home=None, runner=subprocess.run, python=None):
    """Install an owner-only scheduled job without exporting any credentials."""
    wrapper = Path(wrapper_path).absolute()
    executable = Path(sys.executable if python is None else python).absolute()
    if not wrapper.is_file() or not executable.is_file():
        raise StorageError("The private sync script and Python interpreter must exist at their configured paths.")

    path = _agent_file(home)
    data = plistlib.dumps({
        "Label": LABEL,
        "ProgramArguments": [str(executable), str(wrapper), "sync-auto"],
        "StartCalendarInterval": WEEKLY_CALENDAR,
        "RunAtLoad": False,
        "ProcessType": "Background",
        "WorkingDirectory": str(wrapper.parents[1]),
    }, sort_keys=True)

    domain = f"gui/{os.getuid()}"
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid() or info.st_nlink != 1:
            raise StorageError("Scheduled sync plist must be an owner-only regular file (mode 600).")
        if path.read_bytes() == data and _run(runner, ["/bin/launchctl", "print", f"{domain}/{LABEL}"]) == 0:
            return path

    tmp = path.parent / (".strava-auto-" + secrets.token_hex(12))
    try:
        descriptor = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except OSError:
        raise StorageError("Could not safely install the scheduled sync agent.") from None
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass

    _run(runner, ["/bin/launchctl", "bootout", f"{domain}/{LABEL}"])
    if _run(runner, ["/bin/launchctl", "bootstrap", domain, str(path)]) != 0:
        raise StorageError("Could not start scheduled sync. Check the Mac login session and LaunchAgents permissions.")
    return path


def remove_auto_sync(home=None, runner=subprocess.run):
    """Stop future polling. Leave Keychain authorization unchanged."""
    path = _agent_file(home)
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid() or info.st_nlink != 1:
            raise StorageError("Scheduled sync plist is not safe to remove.")
    _run(runner, ["/bin/launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"])
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def auto_sync_status(home=None, runner=subprocess.run):
    path = _agent_file(home)
    if path.is_symlink() or not path.is_file():
        return False
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid():
        return False
    return _run(runner, ["/bin/launchctl", "print", f"gui/{os.getuid()}/{LABEL}"]) == 0
