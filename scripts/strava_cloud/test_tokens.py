"""Invented credential bundles and in-memory Secret Manager fake only."""
import copy
import json
import unittest
from types import SimpleNamespace

from .test_backends import synthetic_store
from .tokens import AuthorizationError, CredentialStore, TokenManager
from ..strava_private.transport import ApiError
from ..strava_private.storage import StorageError

APP = "projects/synthetic/secrets/app"
ATHLETE = "projects/synthetic/secrets/athlete"


def bundle(expires_at=9999999):
    return {"client_id": "123", "client_secret": "synthetic-app-secret", "athlete_id": "42",
            "access_token": "synthetic-access", "refresh_token": "synthetic-refresh",
            "expires_at": expires_at, "scopes": ["activity:read_all"]}


class FakeSecrets:
    def __init__(self):
        self.versions, self.accessed = {}, []
        self.fail_add = False
        self.after_add = None
        self.fail_destroy = False

    def add_secret_version(self, request):
        if self.fail_add:
            raise OSError("Synthetic service unavailable.")
        resource = request["parent"]
        number = 1 + sum(name.startswith(resource + "/versions/") for name in self.versions)
        name = resource + "/versions/" + str(number)
        self.versions[name] = request["payload"]["data"]
        if self.after_add:
            self.after_add()
        return SimpleNamespace(name=name)

    def access_secret_version(self, request):
        name = request["name"]
        assert not name.endswith("/latest")
        self.accessed.append(name)
        data = self.versions[name]
        if data is None:
            raise OSError("Synthetic destroyed secret.")
        return SimpleNamespace(payload=SimpleNamespace(data=data))

    def destroy_secret_version(self, request):
        if self.fail_destroy:
            raise OSError("Synthetic unavailable destroy.")
        self.versions[request["name"]] = None

    def list_secret_versions(self, request):
        return [SimpleNamespace(name=name, state=3 if data is None else 1) for name, data in self.versions.items()
                if name.startswith(request["parent"] + "/versions/")]


class FakeTransport:
    def __init__(self, response=None):
        self.response = response or {"access_token": "synthetic-new-access",
                                     "refresh_token": "synthetic-new-refresh", "expires_at": 9999999}
        self.calls = []
        self.failure = None

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if self.failure:
            raise self.failure
        return copy.deepcopy(self.response)


def synthetic_credentials():
    store, db, bucket, clock = synthetic_store()
    client = FakeSecrets()
    credentials = CredentialStore(store, client, ATHLETE, APP)
    return credentials, store, db, bucket, clock, client


class TokenTests(unittest.TestCase):
    def test_rotation_publishes_explicit_version_before_access_token_use(self):
        credentials, store, db, _, clock, secrets = synthetic_credentials()
        transport = FakeTransport()
        with store.locked():
            credentials.save(bundle(expires_at=clock[0]))
            old = db.data["credential_version"]
            token = TokenManager(credentials, transport, now=lambda: clock[0]).token()
            self.assertEqual(token, "synthetic-new-access")
            self.assertNotEqual(db.data["credential_version"], old)
            self.assertIsNone(secrets.versions[old])
            self.assertFalse(store.load_control().get("authorization_uncertain"))
            self.assertEqual(credentials.load()["refresh_token"], "synthetic-new-refresh")
            self.assertTrue(all(not name.endswith("latest") for name in secrets.accessed))

    def test_ambiguous_exchange_is_never_retried(self):
        credentials, store, _, _, clock, _ = synthetic_credentials()
        transport = FakeTransport()
        transport.failure = ApiError(code="token_exchange_ambiguous")
        with store.locked():
            credentials.save(bundle(expires_at=clock[0]))
            manager = TokenManager(credentials, transport, now=lambda: clock[0])
            for _ in range(2):
                with self.assertRaises(AuthorizationError):
                    manager.token()
            self.assertEqual(len(transport.calls), 1)
            self.assertTrue(store.load_control()["authorization_uncertain"])

    def test_secret_write_failure_fails_closed_and_preserves_pointer(self):
        credentials, store, db, _, clock, secrets = synthetic_credentials()
        transport = FakeTransport()
        with store.locked():
            credentials.save(bundle(expires_at=clock[0]))
            old = db.data["credential_version"]
            secrets.fail_add = True
            with self.assertRaises(AuthorizationError):
                TokenManager(credentials, transport, now=lambda: clock[0]).token()
            self.assertEqual(db.data["credential_version"], old)
            self.assertTrue(store.load_control()["authorization_uncertain"])

    def test_lost_lease_new_secret_cannot_become_latest_active(self):
        credentials, store, db, _, clock, secrets = synthetic_credentials()
        with store.locked():
            credentials.save(bundle(expires_at=clock[0]))
            old = db.data["credential_version"]

            def expire():
                clock[0] += 121
                store.state.acquire()
            secrets.after_add = expire
            with self.assertRaises(AuthorizationError):
                TokenManager(credentials, FakeTransport(), now=lambda: clock[0]).token()
            self.assertEqual(db.data["credential_version"], old)
            self.assertTrue(db.data["control"]["authorization_uncertain"])

    def test_ambiguous_firestore_pointer_commit_remains_uncertain_until_reauth(self):
        credentials, store, db, _, clock, _ = synthetic_credentials()
        transport = FakeTransport()
        with store.locked():
            credentials.save(bundle(expires_at=clock[0]))
            old = db.data["credential_version"]
            original = db.atomic
            failed = [False]

            def committed_but_response_lost(callback):
                before = db.data.get("credential_version")
                result = original(callback)
                if before != db.data.get("credential_version") and not failed[0]:
                    failed[0] = True
                    raise StorageError("Synthetic lost commit acknowledgement.")
                return result
            store.state._atomic_override = committed_but_response_lost
            manager = TokenManager(credentials, transport, now=lambda: clock[0])
            with self.assertRaises(AuthorizationError):
                manager.token()
            self.assertNotEqual(db.data["credential_version"], old)
            self.assertTrue(db.data["control"]["authorization_uncertain"])
            with self.assertRaises(AuthorizationError):
                manager.token()
            self.assertEqual(len(transport.calls), 1)

    def test_setup_refuses_account_mixing_and_delete_deactivates_before_destroy(self):
        credentials, store, db, _, _, secrets = synthetic_credentials()
        with store.locked():
            credentials.save_app_credentials("123", "synthetic-app")
            self.assertEqual(credentials.app_credentials()["client_id"], "123")
            credentials.save(bundle())
            with self.assertRaises(AuthorizationError):
                credentials.save_app_credentials("456", "synthetic-replacement")
            secrets.fail_destroy = True
            self.assertFalse(credentials.delete(include_app=True))
            self.assertIsNone(credentials.load())
            self.assertNotIn("credential_version", db.data)
            self.assertNotIn("app_version", db.data)
            self.assertTrue(db.data["secret_cleanup_pending"])
            secrets.fail_destroy = False
            self.assertTrue(credentials.cleanup_versions(include_app=True))


if __name__ == "__main__":
    unittest.main()
