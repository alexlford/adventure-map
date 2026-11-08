"""Explicit Secret Manager version selection and fail-closed token rotation."""
from __future__ import annotations

import json
import math
import re
import time

from ..strava_private.storage import StorageError


class AuthorizationError(RuntimeError):
    def __init__(self, code="reauthorize"):
        self.code = code
        super().__init__("Private cloud authorization requires owner action.")


def validate_scopes(value):
    if isinstance(value, str):
        value = value.replace(",", " ").split()
    if not isinstance(value, (list, tuple)) or any(not isinstance(item, str) for item in value):
        raise AuthorizationError()
    granted = set(value)
    if "activity:read_all" not in granted or granted - {"read", "activity:read_all"}:
        raise AuthorizationError()
    return sorted(granted)


def validate_app(bundle):
    if (not isinstance(bundle, dict) or not isinstance(bundle.get("client_id"), str)
            or not bundle["client_id"].isdigit() or not isinstance(bundle.get("client_secret"), str)
            or not bundle["client_secret"]):
        raise AuthorizationError()


def validate_bundle(bundle):
    validate_app(bundle)
    if set(bundle) != {"client_id", "client_secret", "access_token", "refresh_token", "athlete_id", "expires_at", "scopes"}:
        raise AuthorizationError()
    for field in ("access_token", "refresh_token", "athlete_id"):
        if not isinstance(bundle.get(field), str) or not bundle[field]:
            raise AuthorizationError()
    if not bundle["athlete_id"].isdigit():
        raise AuthorizationError()
    expiry = bundle.get("expires_at")
    if (not isinstance(expiry, (int, float)) or isinstance(expiry, bool)
            or not math.isfinite(expiry) or expiry <= 0):
        raise AuthorizationError()
    validate_scopes(bundle.get("scopes"))


def token_bundle(response, previous):
    if (not isinstance(response, dict) or ("token_type" in response
            and str(response["token_type"]).lower() != "bearer")):
        raise AuthorizationError()
    bundle = dict(previous)
    for key in ("access_token", "refresh_token", "expires_at"):
        bundle[key] = response.get(key)
    if "scope" in response:
        bundle["scopes"] = validate_scopes(response["scope"])
    validate_bundle(bundle)
    return bundle


class CredentialStore:
    """Versions are immutable; only a fenced Firestore pointer selects one.

    ``latest`` is never read. A secret version created by an expired lease or an
    ambiguous write cannot become usable merely because it is newest.
    """
    def __init__(self, store, client, athlete_resource, app_resource):
        self.store, self.client = store, client
        self.athlete_resource, self.app_resource = athlete_resource, app_resource
        for resource in (athlete_resource, app_resource):
            if not re.fullmatch(r"projects/[^/]+/secrets/[^/]+", resource):
                raise StorageError("Invalid cloud secret configuration.")

    def _read(self, pointer, resource):
        version = self.store.state.snapshot().get(pointer)
        return self._read_version(version, resource)

    def _read_version(self, version, resource):
        if not version:
            return None
        if not re.fullmatch(re.escape(resource) + r"/versions/[1-9][0-9]*", version):
            raise AuthorizationError()
        try:
            response = self.client.access_secret_version(request={"name": version})
            return json.loads(response.payload.data)
        except Exception:
            raise AuthorizationError("credential-unavailable") from None

    def revocation_bundle(self, version):
        """Read a captured, deactivated version solely for immediate revocation."""
        self.store.lease.check()
        bundle = self._read_version(version, self.athlete_resource)
        if bundle is not None:
            validate_bundle(bundle)
        return bundle

    def load(self):
        self.store.lease.check()
        state = self.store.state.snapshot()
        if state.get("credential_status") == "revoked":
            return None
        bundle = self._read("credential_version", self.athlete_resource)
        if bundle is not None:
            validate_bundle(bundle)
        return bundle

    def app_credentials(self):
        self.store.lease.check()
        bundle = self._read("app_version", self.app_resource)
        if bundle is not None:
            validate_app(bundle)
        return bundle

    def _write(self, bundle, resource, pointer, authorized=False):
        lease = self.store.lease
        lease.check()
        try:
            response = self.client.add_secret_version(request={"parent": resource, "payload": {
                "data": json.dumps(bundle, allow_nan=False, separators=(",", ":")).encode()}})
            version = response.name
            if not re.fullmatch(re.escape(resource) + r"/versions/[1-9][0-9]*", version):
                raise AuthorizationError()

            def publish(state):
                old = state.get(pointer)
                state[pointer] = version
                if authorized:
                    state["credential_status"] = "authorized"
                return old

            previous = self.store.state.fenced(lease, publish)
        except Exception:
            raise AuthorizationError("credential-persistence-failed") from None
        if previous and previous != version and not self._destroy(previous):
            self.store.state.fenced(lease, lambda state: state.update(secret_cleanup_pending=True))
        return version

    def save(self, bundle):
        validate_bundle(bundle)
        lease = self.store.lease

        def uncertain(state):
            control = state.setdefault("control", {"schemaVersion": 1})
            control["authorization_uncertain"] = True
            control["health"] = "reauthorize"
        self.store.state.fenced(lease, uncertain)
        version = self._write(bundle, self.athlete_resource, "credential_version", authorized=True)

        def confirm(state):
            if state.get("credential_version") != version:
                raise AuthorizationError()
            control = state.setdefault("control", {"schemaVersion": 1})
            control.pop("authorization_uncertain", None)
            control["health"] = "ready"
        # Only an acknowledged pointer publication permits this separate
        # confirmation. An ambiguous pointer commit leaves uncertainty set,
        # even if that transaction happened to reach Firestore before failing.
        self.store.state.fenced(lease, confirm)

    def save_app_credentials(self, client_id, client_secret):
        bundle = {"client_id": client_id, "client_secret": client_secret}
        validate_app(bundle)
        state = self.store.state.snapshot()
        if (state.get("credential_version") or (state.get("credential_status") != "revoked"
                and state.get("control", {}).get("authorization_uncertain"))):
            raise AuthorizationError("disconnect-first")
        self._write(bundle, self.app_resource, "app_version")

    def _destroy(self, version):
        try:
            self.client.destroy_secret_version(request={"name": version})
        except Exception:
            # An explicit pointer already superseded this version. It can never
            # become active again; cleanup retries destroying all old versions.
            return False
        return True

    def deactivate(self, include_app=False):
        """Fenced local deactivation performs no cross-service network work."""
        lease = self.store.lease

        def deactivate(state):
            previous = state.pop("credential_version", None)
            state["credential_status"] = "revoked"
            if include_app:
                state.pop("app_version", None)
            state["secret_cleanup_pending"] = True
            control = state.setdefault("control", {"schemaVersion": 1})
            control["authorization_uncertain"] = True
            control["health"] = "revoked"
            control.pop("pending", None)
            control.pop("catchup_target", None)
            state.pop("oauth_states", None)
            return previous

        return self.store.state.fenced(lease, deactivate)

    def delete(self, include_app=False):
        """Deactivate first, then destroy all versions, including orphan writes."""
        self.deactivate(include_app=include_app)
        return self.cleanup_versions(include_app=include_app)

    def cleanup_versions(self, include_app=False):
        self.store.lease.check()
        state = self.store.state.snapshot()
        active = {state.get("credential_version"), state.get("app_version")}
        ok = True
        for resource in ([self.athlete_resource, self.app_resource] if include_app else [self.athlete_resource]):
            try:
                versions = self.client.list_secret_versions(request={"parent": resource})
                for version in versions:
                    status = getattr(version, "state", None)
                    destroyed = status == 3 or getattr(status, "name", None) == "DESTROYED"
                    if version.name not in active and not destroyed and not self._destroy(version.name):
                        ok = False
            except Exception:
                ok = False
        if ok:
            self.store.state.fenced(self.store.lease, lambda current: current.pop("secret_cleanup_pending", None))
        return ok


class TokenManager:
    def __init__(self, credentials, transport, now=time.time):
        self.credentials, self.transport, self.now = credentials, transport, now
        self.store = credentials.store

    def token(self, force_refresh=False):
        self.store.lease.check()
        control = self.store.load_control()
        if control.get("authorization_uncertain"):
            raise AuthorizationError()
        bundle = self.credentials.load()
        if not bundle:
            raise AuthorizationError()
        if not force_refresh and bundle["expires_at"] > self.now() + 60:
            return bundle["access_token"]
        if hasattr(self.transport, "preflight"):
            self.transport.preflight()
        # Persist before exchange. Crash, revocation, a malformed response, or
        # any cross-service ambiguity requires a new owner authorization.
        control["authorization_uncertain"] = True
        control["health"] = "reauthorize"
        self.store.save_control(control)
        try:
            response = self.transport.request("POST", "/oauth/token", form={
                "client_id": bundle["client_id"], "client_secret": bundle["client_secret"],
                "grant_type": "refresh_token", "refresh_token": bundle["refresh_token"]})
            updated = token_bundle(response, bundle)
            self.credentials.save(updated)
        except Exception:
            raise AuthorizationError() from None
        self.store.lease.check()
        return updated["access_token"]
