"""Fenced operational state and one expiring, generation-checked GCS envelope.

Only operational metadata is durable in Firestore. All API contents are in one
private GCS object. SDK imports are lazy, so synthetic tests need no credentials.
"""
from __future__ import annotations

from contextlib import contextmanager
import copy
import json
import math
import re
import secrets
import threading
import time

from ..strava_private.storage import CACHE_TTL, StorageError, _validate_control


class LeaseBusy(StorageError):
    def __init__(self):
        super().__init__("Another private cloud operation is running.")


class LeaseLost(StorageError):
    def __init__(self):
        super().__init__("Private cloud operation lease was lost.")


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def validate_control(control):
    """Reuse the private allowlist; cloud additions remain content-free."""
    extras = {"retry_at", "retry_attempt", "catchup_target", "last_successful_sync", "health"}
    if not isinstance(control, dict):
        raise StorageError("Invalid cloud control state.")
    _validate_control({k: v for k, v in control.items() if k not in extras})
    for key in ("retry_at", "retry_attempt", "catchup_target", "last_successful_sync"):
        if key in control and not _number(control[key]):
            raise StorageError("Invalid cloud retry state.")
    if control.get("health", "idle") not in {"idle", "ready", "running", "completed", "retry", "reauthorize", "revoked", "failed"}:
        raise StorageError("Invalid cloud health state.")
    pending = control.get("pending")
    if pending and not 0 < pending["before"] - pending["after"] <= 31 * 86400:
        raise StorageError("Cloud windows must be at most 31 days.")


class StateBackend:
    """One transactional Firestore document, with injectable atomic fake runner.

    ``atomic`` receives a function mapping a document dictionary to a result;
    mutations to the dictionary must commit atomically with that result.
    """
    def __init__(self, client=None, collection="strava-private", now=time.time, atomic=None):
        self.client, self.collection, self.now = client, collection, now
        self._atomic_override = atomic
        self.document = client.document(collection + "/state") if client is not None else None

    def atomic(self, callback):
        try:
            if self._atomic_override is not None:
                return self._atomic_override(callback)
            from google.cloud import firestore

            @firestore.transactional
            def execute(transaction):
                snapshot = self.document.get(transaction=transaction)
                state = snapshot.to_dict() if snapshot.exists else {}
                result = callback(state)
                transaction.set(self.document, state)
                return result

            return execute(self.client.transaction())
        except (StorageError, ValueError):
            raise
        except Exception:
            raise StorageError("Private cloud state is unavailable.") from None

    def snapshot(self):
        return self.atomic(lambda state: copy.deepcopy(state))

    def acquire(self, ttl=120, preempt=False):
        owner = secrets.token_hex(24)

        def mutate(state):
            lease = state.get("lease", {})
            if not preempt and lease.get("expires_at", 0) > self.now():
                raise LeaseBusy()
            fence = int(state.get("fence", 0)) + 1
            state["fence"] = fence
            state["lease"] = {"owner": owner, "fence": fence, "expires_at": self.now() + ttl}
            return Lease(self, owner, fence, ttl)

        return self.atomic(mutate)

    def fenced(self, lease, callback):
        def mutate(state):
            current = state.get("lease", {})
            if (lease.lost.is_set() or current.get("owner") != lease.owner
                    or current.get("fence") != lease.fence or current.get("expires_at", 0) <= self.now()):
                lease.lost.set()
                raise LeaseLost()
            return callback(state)

        return self.atomic(mutate)

    def issue_oauth_state(self, digest, expires_at):
        if (not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest)
                or not _number(expires_at) or not self.now() < expires_at <= self.now() + 900):
            raise StorageError("Invalid authorization state.")

        def mutate(state):
            values = {key: expiry for key, expiry in state.get("oauth_states", {}).items() if expiry > self.now()}
            if len(values) >= 8:
                raise StorageError("Too many pending authorization attempts.")
            values[digest] = expires_at
            state["oauth_states"] = values

        self.atomic(mutate)

    def consume_oauth_state(self, digest):
        if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
            return False

        def mutate(state):
            values = state.setdefault("oauth_states", {})
            expiry = values.pop(digest, 0)
            state["oauth_states"] = {key: value for key, value in values.items() if value > self.now()}
            return expiry > self.now()

        return self.atomic(mutate)


class Lease:
    def __init__(self, state, owner, fence, ttl):
        self.state, self.owner, self.fence, self.ttl = state, owner, fence, ttl
        self.lost, self.stop = threading.Event(), threading.Event()
        self.thread = None

    def check(self):
        return self.state.fenced(self, lambda state: None)

    def heartbeat(self):
        def renew(state):
            state["lease"]["expires_at"] = self.state.now() + self.ttl
        return self.state.fenced(self, renew)

    def start(self):
        def beat():
            while not self.stop.wait(max(0.05, self.ttl / 3)):
                try:
                    self.heartbeat()
                except Exception:
                    self.lost.set()
                    break
        self.thread = threading.Thread(target=beat, name="private-cloud-lease", daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=1)

        def release(state):
            current = state.get("lease", {})
            if current.get("owner") == self.owner and current.get("fence") == self.fence:
                state.pop("lease", None)
        try:
            self.state.atomic(release)
        except StorageError:
            pass  # Expiry recovers a failed release; never mask the original error.


def _missing(exc):
    return getattr(exc, "code", None) == 404 or type(exc).__name__ == "NotFound"


class CloudStore:
    def __init__(self, state, bucket, now=time.time, lease_seconds=120, heartbeat=True):
        self.state, self.bucket, self.now = state, bucket, now
        self.lease_seconds, self.heartbeat_enabled = lease_seconds, heartbeat
        self.local = threading.local()

    @property
    def lease(self):
        lease = getattr(self.local, "lease", None)
        if lease is None:
            raise LeaseLost()
        return lease

    @contextmanager
    def locked(self, preempt=False):
        current = getattr(self.local, "lease", None)
        if current is not None:
            current.check()
            yield self
            return
        lease = self.state.acquire(self.lease_seconds, preempt=preempt)
        self.local.lease = lease
        try:
            if self.heartbeat_enabled:
                lease.start()
            yield self
        finally:
            self.local.lease = None
            lease.close()

    acquire_lock = locked

    def load_control(self):
        value = self.state.snapshot().get("control", {"schemaVersion": 1})
        validate_control(value)
        return copy.deepcopy(value)

    def save_control(self, value):
        validate_control(value)
        self.state.fenced(self.lease, lambda state: state.update(control=copy.deepcopy(value)))

    def _blob(self):
        return self.bucket.blob("cache.json")

    def _delete_generation(self, generation):
        try:
            self._blob().delete(if_generation_match=int(generation))
            return True
        except Exception as exc:
            if _missing(exc):
                return True
            # A changed generation belongs to another atomic write. Its
            # contents must not be removed by an expired reader.
            if getattr(exc, "code", None) == 412 or type(exc).__name__ == "PreconditionFailed":
                return False
            raise StorageError("Private cloud cache deletion failed.") from None

    def _read_envelope(self):
        blob = self._blob()
        try:
            blob.reload()
            generation = int(blob.generation)
            raw = blob.download_as_bytes(if_generation_match=generation)
        except Exception as exc:
            if _missing(exc):
                return None, None
            raise StorageError("Private cloud cache is unavailable.") from None
        value, state, expected = None, {}, None
        try:
            value = json.loads(raw)
            state = self.state.snapshot()
            expected = state.get("cache_generation")
            valid = (isinstance(value, dict) and set(value) == {"created_at", "expires_at", "payload", "fence"}
                     and _number(value["created_at"]) and _number(value["expires_at"])
                     and isinstance(value["fence"], int) and not isinstance(value["fence"], bool) and value["fence"] > 0
                     and value["created_at"] <= self.now() < value["expires_at"]
                     and 0 < value["expires_at"] - value["created_at"] <= CACHE_TTL
                     and str(generation) == str(expected) and state.get("credential_status") != "revoked")
        except (ValueError, UnicodeError, TypeError):
            valid = False
        if not valid:
            # A writer can be between its atomic object upload and its fenced
            # pointer publication. Never delete that generation while the
            # corresponding lease remains live. It is not served until commit.
            active = state.get("lease", {}) if isinstance(value, dict) else {}
            if (isinstance(value, dict) and value.get("fence") == active.get("fence")
                    and active.get("expires_at", 0) > self.now()
                    and str(generation) != str(expected)):
                return None, None
            self._delete_generation(generation)
            return None, None
        return value, generation

    def purge_expired(self):
        self._read_envelope()

    def read_json(self, name, default=None):
        if name == "control.json":
            return self.load_control()
        if name != "cache.json":
            raise StorageError("Unrecognized cloud storage object.")
        value, _ = self._read_envelope()
        return copy.deepcopy(default if value is None else value)

    def load_cache(self, default=None):
        envelope = self.read_json("cache.json")
        return copy.deepcopy(default if envelope is None else envelope["payload"])

    def save_cache(self, payload, expires_at=None):
        lease = self.lease
        lease.check()
        previous, generation = self._read_envelope()
        deadline = self.now() + CACHE_TTL if expires_at is None else expires_at
        created = previous["created_at"] if previous else self.now()
        if previous:
            deadline = min(deadline, previous["expires_at"])
        if not _number(deadline) or not self.now() < deadline <= created + CACHE_TTL:
            raise StorageError("Private cloud cache expiry must be within 48 hours.")
        value = {"created_at": created, "expires_at": deadline, "payload": payload, "fence": lease.fence}
        uploaded_generation = None
        upload_attempted = False
        try:
            encoded = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
            blob = self._blob()
            blob.metadata = {"created_at": str(created), "expires_at": str(deadline)}
            upload_attempted = True
            blob.upload_from_string(encoded, content_type="application/json", if_generation_match=generation or 0)
            committed = str(blob.generation)
            uploaded_generation = committed
            # Object generation is an operational pointer, never an API ID.
            # If a lease expires during I/O, the orphan cannot be served: reads
            # require this fenced pointer, and later writers use generation CAS.
            self.state.fenced(lease, lambda state: state.update(cache_generation=committed))
        except StorageError:
            if upload_attempted:
                self._cleanup_unpublished_upload(uploaded_generation)
            raise
        except Exception:
            if upload_attempted:
                self._cleanup_unpublished_upload(uploaded_generation)
            raise StorageError("Private cloud cache commit failed.") from None

    def _cleanup_unpublished_upload(self, generation):
        if generation is not None:
            try:
                self._delete_generation(generation)
                return  # A CAS mismatch means this old generation is already gone.
            except StorageError:
                pass
        try:
            if generation is not None:
                # A stale worker may only name its exact object generation,
                # never request deletion of a newer owner's selected cache.
                self.state.atomic(lambda state: state.update(cache_orphan_generation=str(generation)))
            else:
                self.state.fenced(self.lease, lambda state: state.update(cache_cleanup_pending=True))
        except StorageError:
            # Firestore and GCS can fail together; read-time pointer checks still
            # deny the orphan and the independent 48-hour janitor remains active.
            pass

    def cleanup_orphan(self):
        lease = self.lease
        lease.check()
        state = self.state.snapshot()
        generation = state.get("cache_orphan_generation")
        if generation is None:
            return
        if not isinstance(generation, str) or not re.fullmatch(r"[1-9][0-9]*", generation):
            raise StorageError("Invalid cloud cleanup generation.")
        if (str(state.get("cache_generation")) != generation
                or state.get("credential_status") != "authorized"):
            self._delete_generation(generation)
        def clear_hint(current):
            if current.get("cache_orphan_generation") == generation:
                current.pop("cache_orphan_generation", None)
        self.state.fenced(lease, clear_hint)

    def clear_activity_data(self):
        lease = self.lease
        lease.check()
        blob = self._blob()
        try:
            blob.reload()
            if not self._delete_generation(blob.generation):
                raise StorageError("Private cloud cache deletion requires cleanup.")
        except Exception as exc:
            if not _missing(exc):
                if isinstance(exc, StorageError):
                    raise
                raise StorageError("Private cloud cache deletion failed.") from None
        def cleared(state):
            state.pop("cache_generation", None)
            state.pop("cache_cleanup_pending", None)
        self.state.fenced(lease, cleared)

    def delete(self, name):
        if name != "cache.json":
            raise StorageError("Unrecognized cloud storage object.")
        self.clear_activity_data()
