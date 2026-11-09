"""Private Cloud Run worker and runtime service interfaces; no Mac entrypoint.

Command arguments and logs contain operational settings only. Backfill dates
may also be passed in STRAVA_CLOUD_RUN_JSON through Cloud Run Job overrides.
"""
from __future__ import annotations

import argparse
import json
import os
import time

from .backends import CloudStore, LeaseBusy, LeaseLost, StateBackend
from .tokens import AuthorizationError, CredentialStore, TokenManager, token_bundle, validate_scopes
from ..strava_private.storage import StorageError
from ..strava_private.sync import DAY, Sync, SyncError, epoch_date
from ..strava_private.transport import ApiError, Transport

# A reviewed date is merely the starting cursor. No archive or public records
# are imported, and the download checkpoint never advances that watermark.
BASELINE = {"snapshotOn": "2026-08-10", "activityCount": 3371}
MODES = {"weekly", "recovery", "backfill", "cleanup"}


class Runtime:
    def __init__(self, store, credentials, transport=None, now=time.time, baseline=None, max_windows=12):
        self.store, self.credentials, self.now = store, credentials, now
        self._transport = transport
        self.baseline = baseline or BASELINE
        self.max_windows = max_windows

    @property
    def transport(self):
        if self._transport is not None:
            return self._transport

        def save_rate(rate):
            control = self.store.load_control()
            control["rate"] = rate
            self.store.save_control(control)

        return Transport(now=self.now, rate_state=self.store.load_control().get("rate", {}),
                         save_rate_state=save_rate, max_wait=5, timeout=30)

    @property
    def tokens(self):
        return TokenManager(self.credentials, self.transport, now=self.now)

    def setup_client(self, client_id, client_secret):
        with self.store.locked():
            self.credentials.save_app_credentials(client_id, client_secret)
        return {"configured": True}

    def oauth_client_id(self):
        with self.store.locked():
            bundle = self.credentials.app_credentials()
            return bundle["client_id"] if bundle else None

    def exchange_code(self, code, granted_scopes=None, callback_uri=None):
        del callback_uri  # Strava exchange accepts no redirect_uri form field.
        if not isinstance(code, str) or not code:
            raise AuthorizationError()
        granted = validate_scopes(granted_scopes)
        with self.store.locked():
            app = self.credentials.app_credentials()
            if not app:
                raise AuthorizationError()
            previous = self.credentials.load()
            transport = self.transport
            if hasattr(transport, "preflight"):
                transport.preflight()
            control = self.store.load_control()
            if previous is None:
                # A disconnected owner can authorize another account. Never
                # revive an uncleared cache or inherit the previous account's
                # download cursor; the reviewed export baseline is unchanged.
                self.store.clear_activity_data()
                for key in ("checkpoint", "last_complete_scan", "pending", "catchup_target", "retry_at", "retry_attempt"):
                    control.pop(key, None)
            control["authorization_uncertain"] = True
            control["health"] = "reauthorize"
            self.store.save_control(control)
            try:
                response = transport.request("POST", "/oauth/token", form={
                    **app, "code": code, "grant_type": "authorization_code"})
                athlete = response.get("athlete") if isinstance(response, dict) else None
                athlete_id = str(athlete.get("id", "")) if isinstance(athlete, dict) else ""
                bundle = token_bundle(response, {**app, "athlete_id": athlete_id, "scopes": granted})
                if previous and previous["athlete_id"] != athlete_id:
                    try:
                        transport.request("POST", "/oauth/revoke", form={
                            "token": bundle["refresh_token"], "token_type_hint": "refresh_token"},
                            basic=(bundle["client_id"], bundle["client_secret"]))
                    finally:
                        raise AuthorizationError("athlete-mismatch")
                self.credentials.save(bundle)
            except Exception:
                raise AuthorizationError() from None
        return {"authorized": True, "readOnly": True}

    def authorize(self, code, granted):
        return self.exchange_code(code, granted)

    def review_snapshot(self):
        with self.store.locked():
            state = self.store.state.snapshot()
            if (state.get("credential_status") != "authorized"
                    or state.get("control", {}).get("authorization_uncertain")):
                return None
            return self.store.read_json("cache.json")

    def revoke(self):
        # Owner disconnect immediately fences an in-flight job. Deactivation is
        # committed before deletion or remote I/O, so failures cannot leave an
        # old worker refreshing or a review endpoint serving cached contents.
        with self.store.locked(preempt=True):
            previous_version = self.credentials.deactivate(include_app=True)
            local_cleared = self._erase_cache_or_schedule()
            remote_revoked = False
            try:
                bundle = self.credentials.revocation_bundle(previous_version)
            except AuthorizationError:
                bundle = None
            if bundle:
                try:
                    self.transport.request("POST", "/oauth/revoke", form={
                        "token": bundle["refresh_token"], "token_type_hint": "refresh_token"},
                        basic=(bundle["client_id"], bundle["client_secret"]))
                    remote_revoked = True
                except Exception:
                    pass
            secret_cleared = self.credentials.cleanup_versions(include_app=True)
        return {"remoteRevoked": remote_revoked, "localRevoked": True,
                "localCleared": local_cleared and secret_cleared}

    disconnect = revoke

    def _erase_cache_or_schedule(self):
        try:
            self.store.clear_activity_data()
            return True
        except StorageError:
            self.store.state.fenced(self.store.lease, lambda state: state.update(cache_cleanup_pending=True))
            return False

    def _deny_authorization(self, deactivate=False):
        """Block review before content deletion or unavailable secret services.

        Global API denial removes the athlete pointer while retaining app setup
        for owner reauthorization. Ambiguous refresh or credential access keeps
        the pointer solely for account verification during reauthorization.
        """
        if deactivate:
            self.credentials.deactivate(include_app=False)
        else:
            control = self.store.load_control()
            control["authorization_uncertain"] = True
            control["health"] = "reauthorize"
            self.store.save_control(control)
        self._erase_cache_or_schedule()
        if deactivate:
            self.credentials.cleanup_versions(include_app=False)
        return {"status": "reauthorize"}

    def _health(self, health, retry_at=None):
        control = self.store.load_control()
        control["health"] = health
        if retry_at is not None:
            control["retry_at"] = retry_at
            control["retry_attempt"] = min(16, int(control.get("retry_attempt", 0)) + 1)
        self.store.save_control(control)

    def _run_locked(self, mode, since, until):
        if mode == "cleanup":
            return cleanup_bucket(self.store.bucket, now=self.now)
        self.store.purge_expired()
        control = self.store.load_control()
        state = self.store.state.snapshot()
        if state.get("cache_orphan_generation"):
            self.store.cleanup_orphan()
        if state.get("cache_cleanup_pending"):
            self.store.clear_activity_data()
        if state.get("secret_cleanup_pending"):
            self.credentials.cleanup_versions(include_app=True)
        if state.get("credential_status") != "authorized" or control.get("authorization_uncertain"):
            return self._deny_authorization()
        if mode == "recovery" and not (control.get("pending") or control.get("catchup_target")):
            return {"status": "idle"}
        deadline = max(control.get("retry_at", 0), control.get("rate", {}).get("blocked_until", 0))
        if deadline > self.now():
            return {"status": "deferred"}
        if mode == "backfill" and control.get("pending"):
            pending = control["pending"]
            if (pending["mode"] != "backfill" or pending["after"] != epoch_date(since)
                    or pending["before"] != epoch_date(until)):
                return {"status": "pending"}
        if mode == "weekly" and not control.get("catchup_target"):
            control["catchup_target"] = int(self.now())
            self.store.save_control(control)
        transport = self.transport
        tokens = TokenManager(self.credentials, transport, now=self.now)
        bundle = self.credentials.load()
        if not bundle:
            raise AuthorizationError()
        for _ in range(1 if mode == "backfill" else self.max_windows):
            self._health("running")
            Sync(self.store, tokens, transport, bundle["athlete_id"], self.baseline, now=self.now).run(
                since=since if mode == "backfill" else None,
                until=until if mode == "backfill" else None, candidate_streams=True)
            control = self.store.load_control()
            control.pop("retry_at", None)
            control.pop("retry_attempt", None)
            target = control.get("catchup_target")
            if target and control.get("checkpoint", 0) >= target:
                control.pop("catchup_target", None)
                control["last_successful_sync"] = control["checkpoint"]
            control["health"] = "completed"
            self.store.save_control(control)
            if mode == "backfill" or not control.get("catchup_target"):
                return {"status": "completed"}
        self._health("retry", self.now() + 3600)
        return {"status": "pending"}

    def run(self, mode="weekly", since=None, until=None):
        validate_request(mode, since, until, self.now())
        try:
            with self.store.locked():
                try:
                    return self._run_locked(mode, since, until)
                except AuthorizationError:
                    return self._deny_authorization()
                except ApiError as exc:
                    if exc.status in {401, 403}:
                        return self._deny_authorization(deactivate=True)
                    attempt = int(self.store.load_control().get("retry_attempt", 0))
                    retry = exc.retry_at or self.now() + min(21600, 300 * 2 ** min(attempt, 7))
                    self._health("retry", retry)
                    return {"status": "rate_limited" if exc.status == 429 else "retry"}
                except (StorageError, SyncError):
                    self._health("retry", self.now() + 3600)
                    return {"status": "retry"}
        except LeaseBusy:
            return {"status": "busy"}
        except (LeaseLost, StorageError):
            return {"status": "failed"}


def validate_request(mode, since, until, now):
    if mode not in MODES:
        raise ValueError("Invalid private cloud mode.")
    if mode == "backfill":
        if not since or not until:
            raise ValueError("Backfill requires a bounded date window.")
        start, end = epoch_date(since), epoch_date(until)
        if not 0 < end - start <= 31 * DAY or end > now:
            raise ValueError("Backfill windows must be in the past and at most 31 days.")
    elif since is not None or until is not None:
        raise ValueError("Only backfill accepts date arguments.")


def make_runtime(environ=None):
    """Construct production SDK clients lazily; no data is read on import."""
    env = os.environ if environ is None else environ
    from google.cloud import firestore, secretmanager, storage
    project = env["STRAVA_PROJECT_ID"]
    state = StateBackend(firestore.Client(project=project, database=env.get("STRAVA_FIRESTORE_DATABASE", "(default)")),
                         collection=env.get("STRAVA_STATE_COLLECTION", "strava-private"))
    store = CloudStore(state, storage.Client(project=project).bucket(env["STRAVA_CACHE_BUCKET"]))
    credentials = CredentialStore(store, secretmanager.SecretManagerServiceClient(),
                                  env["STRAVA_ATHLETE_SECRET_RESOURCE"], env["STRAVA_CLIENT_SECRET_RESOURCE"])
    return Runtime(store, credentials)


def cleanup_bucket(bucket, now=time.time):
    """Metadata-only janitor for a service identity with list/delete only."""
    for blob in bucket.list_blobs(prefix="cache.json", max_results=2):
        if blob.name != "cache.json":
            continue
        metadata = blob.metadata or {}
        try:
            deadline = float(metadata["expires_at"])
            created = float(metadata["created_at"])
            expired = (not 0 <= created <= now() or not 0 < deadline - created <= 48 * 3600 or deadline <= now())
        except (KeyError, TypeError, ValueError):
            # Missing or invalid retention metadata is not a private archive.
            expired = True
        if expired:
            try:
                blob.delete(if_generation_match=int(blob.generation))
            except Exception as exc:
                if getattr(exc, "code", None) not in {404, 412} and type(exc).__name__ not in {"NotFound", "PreconditionFailed"}:
                    raise StorageError("Private cloud cleanup failed.") from None
    return {"status": "cleaned"}


def main(argv=None, environ=None):
    parser = argparse.ArgumentParser(description="Private cloud operational worker")
    parser.add_argument("mode", choices=sorted(MODES), nargs="?", default="weekly")
    parser.add_argument("--since")
    parser.add_argument("--until")
    args = parser.parse_args(argv)
    env = os.environ if environ is None else environ
    try:
        request = {"mode": args.mode, "since": args.since, "until": args.until}
        if env.get("STRAVA_CLOUD_RUN_JSON"):
            overrides = json.loads(env["STRAVA_CLOUD_RUN_JSON"])
            if not isinstance(overrides, dict) or set(overrides) - {"mode", "since", "until"}:
                raise ValueError()
            request.update(overrides)
        validate_request(**request, now=time.time())
        if request["mode"] == "cleanup":
            from google.cloud import storage
            bucket = storage.Client(project=env["STRAVA_PROJECT_ID"]).bucket(env["STRAVA_CACHE_BUCKET"])
            result = cleanup_bucket(bucket)
        else:
            result = make_runtime(env).run(**request)
    except Exception:
        result = {"status": "failed"}
    print(json.dumps(result, separators=(",", ":")))
    return 1 if result["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
