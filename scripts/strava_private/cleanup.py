"""Install an owner-local, credential-free cache-expiration LaunchAgent."""

from __future__ import annotations

import os
from pathlib import Path
import plistlib
import secrets
import stat
import subprocess
import sys

from .storage import StorageError


LABEL = "org.adventurepassport.strava-private-cleanup"
WRAPPER = Path(__file__).resolve().parents[1] / "strava_private_sync.py"


def _directory(home):
    directory = Path(home).absolute() / "Library/LaunchAgents"
    for component in reversed((directory, *directory.parents)):
        if component.is_symlink():
            raise StorageError("Cache cleanup cannot use a symbolic-link LaunchAgents path.")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o022:
        raise StorageError("The LaunchAgents directory must be owned by you and not writable by others.")
    return directory


def _run(runner, arguments):
    try:
        return runner(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                      stderr=subprocess.DEVNULL, check=False).returncode
    except OSError:
        raise StorageError("macOS launchctl is unavailable; automatic cache cleanup is required before authorization.") from None


def install_cleanup(wrapper_path=None, home=None, runner=subprocess.run, python=None):
    """Idempotently install and load cleanup before asking for credentials.

    The LaunchAgent has no network or Keychain operation: it only invokes the
    local purge command. Its executable and script paths are explicit so moving
    a checkout requires reinstalling the agent by running strava:auth again.
    """
    directory = _directory(Path.home() if home is None else home)
    wrapper = Path(WRAPPER if wrapper_path is None else wrapper_path).absolute()
    executable = str(Path(sys.executable if python is None else python).absolute())
    path = directory / (LABEL + ".plist")
    content = plistlib.dumps({
        "Label": LABEL,
        "ProgramArguments": [executable, str(wrapper), "purge-local"],
        "StartInterval": 3600,
        "RunAtLoad": True,
        "ProcessType": "Background",
    }, sort_keys=True)
    domain = f"gui/{os.getuid()}"
    current = None
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.getuid() or info.st_nlink != 1:
            raise StorageError("The cache cleanup plist must be an owner-only regular file (mode 600).")
        current = path.read_bytes()
    if current == content and _run(runner, ["/bin/launchctl", "print", f"{domain}/{LABEL}"]) == 0:
        return path
    temporary = directory / (".strava-cleanup-" + secrets.token_hex(12))
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except OSError:
        raise StorageError("Could not safely install automatic cache cleanup.") from None
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
    _run(runner, ["/bin/launchctl", "bootout", f"{domain}/{LABEL}"])
    if _run(runner, ["/bin/launchctl", "bootstrap", domain, str(path)]) != 0:
        raise StorageError("Automatic cache cleanup could not start. Run strava:auth in your Mac login session before authorizing.")
    return path


def cleanup_status(home=None, runner=subprocess.run):
    path = Path(Path.home() if home is None else home) / "Library/LaunchAgents" / (LABEL + ".plist")
    if path.is_symlink() or not path.is_file():
        return False
    return _run(runner, ["/bin/launchctl", "print", f"gui/{os.getuid()}/{LABEL}"]) == 0

