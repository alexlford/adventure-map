"""Private, bounded local cache. Never import this directory into publication.

The only API-content file is cache.json, a single atomic transaction containing
activities, review queue and report. Its deadline never slides on subsequent
writes. control.json accepts operational metadata only, not API identifiers.
"""

from __future__ import annotations

from contextlib import contextmanager
import copy
import fcntl
import json
import math
import os
from pathlib import Path
import secrets
import stat
import time


CACHE_TTL = 48 * 60 * 60
DEFAULT_ROOT = Path.home() / "Library/Application Support/Adventure Passport Private Sync"
REPO_ROOT = Path(__file__).resolve().parents[2]
_FILES = {"cache.json", "control.json"}
_EVENTS = {"started", "completed", "interrupted", "revoked", "authorized"}
_MODES = {"incremental", "backfill", "reconcile"}


class StorageError(RuntimeError):
    """A fixed diagnostic which never includes private file contents."""


class _InvalidState(StorageError):
    pass


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def _private_file(info):
    return stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o600 and info.st_uid == os.getuid() and info.st_nlink == 1


def _validate_control(value):
    allowed = {"schemaVersion", "checkpoint", "last_complete_scan", "pending", "rate", "events", "authorization_uncertain"}
    if not isinstance(value, dict) or set(value) - allowed:
        raise StorageError("Invalid private control state; activity data belongs in the expiring cache.")
    if value.get("schemaVersion", 1) != 1:
        raise StorageError("Unsupported private control state version.")
    for field in ("checkpoint", "last_complete_scan"):
        if field in value and value[field] is not None and not _number(value[field]):
            raise StorageError("Invalid private control timestamp.")
    if "authorization_uncertain" in value and not isinstance(value["authorization_uncertain"], bool):
        raise StorageError("Invalid authorization control state.")
    pending = value.get("pending")
    if pending is not None:
        if not isinstance(pending, dict) or set(pending) - {"after", "before", "page", "mode", "started_at", "streams", "candidateStreams"}:
            raise StorageError("Invalid pending operation state.")
        if not isinstance(pending.get("streams", False), bool):
            raise StorageError("Invalid pending stream option.")
        if not isinstance(pending.get("candidateStreams", False), bool):
            raise StorageError("Invalid pending candidate stream option.")
        if pending.get("mode") not in _MODES or pending.get("page", 1) != 1:
            raise StorageError("Invalid pending operation mode.")
        if any(not _number(pending.get(key)) for key in ("after", "before", "started_at")):
            raise StorageError("Invalid pending operation timestamp.")
    rate = value.get("rate", {})
    if not isinstance(rate, dict):
        raise StorageError("Invalid rate-limit control state.")
    # Quota arrays and numeric reset deadlines contain no activity identifiers.
    if set(rate) - {"overall", "read", "blocked_until"}:
        raise StorageError("Invalid rate-limit control field.")
    if "blocked_until" in rate and not _number(rate["blocked_until"]):
        raise StorageError("Invalid rate-limit deadline.")
    for key in ("overall", "read"):
        if key not in rate:
            continue
        item = rate[key]
        if not isinstance(item, dict) or set(item) != {"limits", "usage", "window", "day"}:
            raise StorageError("Invalid rate-limit bucket.")
        for array in (item["limits"], item["usage"]):
            if not isinstance(array, (list, tuple)) or len(array) != 2 or any(not _number(number) for number in array):
                raise StorageError("Invalid rate-limit quota.")
        if any(not _number(item[field]) for field in ("window", "day")):
            raise StorageError("Invalid rate-limit window.")
    events = value.get("events", [])
    if not isinstance(events, list) or len(events) > 100:
        raise StorageError("Invalid operational event log.")
    for event in events:
        if not isinstance(event, dict) or set(event) != {"event", "at"} or event["event"] not in _EVENTS or not _number(event["at"]):
            raise StorageError("Invalid operational event log entry.")


class PrivateStore:
    def __init__(self, root=None, repo_root=None, now=time.time):
        supplied = Path(root if root is not None else DEFAULT_ROOT).expanduser().absolute()
        for component in reversed((supplied, *supplied.parents)):
            if component.is_symlink():
                raise StorageError("Private storage cannot use symbolic links.")
        # Collapse lexical '..' before the repository containment test, while
        # checking the original components first so normalization cannot hide
        # a symlink traversal.
        self.root = Path(os.path.abspath(supplied))
        self.repo_root = Path(os.path.abspath(repo_root if repo_root is not None else REPO_ROOT))
        self.now = now
        try:
            self.root.relative_to(self.repo_root)
        except ValueError:
            pass
        else:
            raise StorageError("Private storage must be outside the repository.")
        # Reject familiar automatically synchronized locations. This is an
        # additional guard, not a claim to detect every possible backup agent.
        forbidden = ("dropbox", "onedrive", "google drive", "googledrive", "icloud", "mobile documents", "cloudstorage")
        if any(any(word in part.lower() for word in forbidden) for part in self.root.parts):
            raise StorageError("Private storage must be outside cloud-synchronized folders.")
        self._validate_path(create=True)

    def _validate_path(self, create=False):
        for component in reversed((self.root, *self.root.parents)):
            if component.is_symlink():
                raise StorageError("Private storage cannot use symbolic links.")
        if create:
            self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        try:
            info = self.root.lstat()
        except OSError:
            raise StorageError("Private storage is unavailable.") from None
        if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700 or info.st_uid != os.getuid():
            raise StorageError("Private storage must be an owner-only directory (mode 700).")

    @contextmanager
    def _directory(self):
        self._validate_path()
        try:
            descriptor = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        except OSError:
            raise StorageError("Cannot safely open private storage.") from None
        try:
            yield descriptor
        finally:
            os.close(descriptor)

    @contextmanager
    def locked(self):
        """Serialize authentication, refresh, sync and disconnect processes."""
        with self._directory() as directory:
            try:
                descriptor = os.open(".lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            except OSError:
                raise StorageError("Cannot safely open the private sync lock.") from None
            try:
                if not _private_file(os.fstat(descriptor)):
                    raise StorageError("The private sync lock must be owner-only (mode 600).")
                try:
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise StorageError("Another private Strava command is running; wait for it to finish.") from None
                self.purge_expired()
                yield self
            finally:
                os.close(descriptor)

    acquire_lock = locked

    def _check_name(self, name):
        if name not in _FILES:
            raise StorageError("Unrecognized private storage file.")

    def _read(self, name, default=None):
        self._check_name(name)
        with self._directory() as directory:
            try:
                descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
            except FileNotFoundError:
                return copy.deepcopy(default)
            except OSError:
                raise StorageError("Cannot safely read private storage.") from None
            try:
                if not _private_file(os.fstat(descriptor)):
                    raise StorageError("Private files must be owner-only regular files (mode 600).")
                with os.fdopen(descriptor, "r", encoding="utf-8") as handle:
                    descriptor = None
                    return json.load(handle)
            except (ValueError, UnicodeError):
                raise _InvalidState("Private state is invalid; no private contents were displayed.") from None
            finally:
                if descriptor is not None:
                    os.close(descriptor)

    def _write(self, name, value):
        self._check_name(name)
        # Validate an existing destination too: never replace a malicious link.
        self._read(name)
        temporary = ".pending-" + secrets.token_hex(12)
        with self._directory() as directory:
            descriptor = None
            try:
                descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    descriptor = None
                    json.dump(value, handle, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
                    handle.write("\n")
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
                os.fsync(directory)
            except (OSError, ValueError, TypeError):
                raise StorageError("Cannot complete the atomic private-state save.") from None
            finally:
                if descriptor is not None:
                    os.close(descriptor)
                try:
                    os.unlink(temporary, dir_fd=directory)
                except FileNotFoundError:
                    pass

    def delete(self, name):
        self._check_name(name)
        with self._directory() as directory:
            try:
                os.unlink(name, dir_fd=directory)
                os.fsync(directory)
            except FileNotFoundError:
                pass

    def purge_expired(self):
        """No expired content can be returned by a public storage method."""
        # A crash before rename can leave an owner-only temporary file. Never
        # let such a file become an indefinite alternate activity archive.
        with self._directory() as directory:
            for name in os.listdir(directory):
                if not name.startswith(".pending-"):
                    continue
                try:
                    info = os.stat(name, dir_fd=directory, follow_symlinks=False)
                    if not _private_file(info):
                        raise StorageError("Unsafe temporary private state file.")
                    # Commands serialize access with locked(); any surviving
                    # temporary belongs to an interrupted previous transaction.
                    os.unlink(name, dir_fd=directory)
                except FileNotFoundError:
                    pass
        try:
            cache = self._read("cache.json")
        except _InvalidState:
            # _read verified regular-file ownership and permissions before
            # parsing. Invalid content must not prevent disconnect or cleanup.
            self.delete("cache.json")
            return
        if cache is None:
            return
        if not isinstance(cache, dict) or set(cache) != {"expires_at", "payload"} or not _number(cache["expires_at"]):
            self.delete("cache.json")
            return
        if cache["expires_at"] <= self.now() or cache["expires_at"] > self.now() + CACHE_TTL:
            self.delete("cache.json")

    def read_json(self, name, default=None):
        self.purge_expired()
        value = self._read(name, default)
        if name == "control.json" and value is not None:
            _validate_control(value)
        return value

    def write_json(self, name, value):
        self._check_name(name)
        self.purge_expired()
        if name == "control.json":
            _validate_control(value)
            self._write(name, value)
        else:
            if not isinstance(value, dict) or set(value) != {"expires_at", "payload"}:
                raise StorageError("Cache writes require an expiration envelope.")
            self.save_cache(value["payload"], value["expires_at"])

    def load_cache(self, default=None):
        envelope = self.read_json("cache.json")
        return envelope["payload"] if envelope is not None else copy.deepcopy(default)

    def save_cache(self, payload, expires_at=None):
        self.purge_expired()
        deadline = self.now() + CACHE_TTL if expires_at is None else expires_at
        if not _number(deadline) or not self.now() < deadline <= self.now() + CACHE_TTL:
            raise StorageError("Private cache expiry must be within 48 hours.")
        current = self._read("cache.json")
        if current is not None:
            deadline = min(deadline, current["expires_at"])
        self._write("cache.json", {"expires_at": deadline, "payload": payload})

    def load_control(self):
        return self.read_json("control.json", {"schemaVersion": 1})

    def save_control(self, value):
        self.write_json("control.json", value)

    def clear_activity_data(self):
        self.delete("cache.json")
        with self._directory() as directory:
            for name in os.listdir(directory):
                if name.startswith(".pending-"):
                    os.unlink(name, dir_fd=directory)
            os.fsync(directory)

