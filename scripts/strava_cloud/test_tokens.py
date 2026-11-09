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
            self.assertTrue(db.data["secret_cleanup_pending"])

    def test_ambiguous_add_is_marked_before_io_and_swept_without_destroying_selected_versions(self):
        for resource in (APP, ATHLETE):
            with self.subTest(resource=resource):
                credentials, store, db, _, _, secrets = synthetic_credentials()
                with store.locked():
                    credentials.save_app_credentials("123", "synthetic-app-secret")
                    if resource == ATHLETE:
                        credentials.save(bundle())
                    selected = {db.data[key] for key in ("credential_version", "app_version") if key in db.data}

                    def ambiguous_add():
                        self.assertTrue(db.data["secret_cleanup_pending"])
                        raise OSError("Synthetic add acknowledgement lost.")
                    secrets.after_add = ambiguous_add
                    with self.assertRaises(AuthorizationError):
                        if resource == APP:
                            credentials.save_app_credentials("123", "synthetic-new-app")
                        else:
                            credentials.save(bundle())
                    orphans = set(secrets.versions) - selected
                    self.assertEqual(len(orphans), 1)
                    self.assertTrue(db.data["secret_cleanup_pending"])
                    self.assertEqual({db.data[key] for key in ("credential_version", "app_version")
                                      if key in db.data}, selected)
                    secrets.after_add = None
                    self.assertTrue(credentials.cleanup_versions(include_app=True))
                    self.assertTrue(all(secrets.versions[name] is None for name in orphans))
                    self.assertTrue(all(secrets.versions[name] is not None for name in selected))
                    self.assertNotIn("secret_cleanup_pending", db.data)

    def test_failed_cleanup_marker_prevents_secret_add(self):
        credentials, store, db, _, _, secrets = synthetic_credentials()
        with store.locked():
            original = db.atomic

            def reject_marker(callback):
                def checked(state):
                    result = callback(state)
                    if state.get("secret_cleanup_pending"):
                        raise StorageError("Synthetic marker persistence failure.")
                    return result
                return original(checked)
            store.state._atomic_override = reject_marker
            with self.assertRaises(AuthorizationError):
                credentials.save(bundle())
            self.assertEqual(secrets.versions, {})
            self.assertNotIn("credential_version", db.data)

    def test_reauthorization_sweeps_ambiguous_add_and_preserves_application_pointer(self):
        credentials, store, db, _, _, secrets = synthetic_credentials()
        with store.locked():
            credentials.save_app_credentials("123", "synthetic-app-secret")
            app_version = db.data["app_version"]
            credentials.save(bundle())

            def ambiguous_add():
                raise OSError("Synthetic add acknowledgement lost.")
            secrets.after_add = ambiguous_add
            with self.assertRaises(AuthorizationError):
                credentials.save(bundle())
            orphan = next(name for name in secrets.versions
                          if name not in {app_version, db.data["credential_version"]})
            secrets.after_add = None
            credentials.save(bundle())
            self.assertIsNone(secrets.versions[orphan])
            self.assertEqual(db.data["app_version"], app_version)
            self.assertIsNotNone(secrets.versions[app_version])
            self.assertIsNotNone(secrets.versions[db.data["credential_version"]])
            self.assertFalse(store.load_control().get("authorization_uncertain"))
            self.assertNotIn("secret_cleanup_pending", db.data)

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
            self.assertTrue(db.data["secret_cleanup_pending"])
        secrets.after_add = None
        with store.locked(preempt=True):
            self.assertTrue(credentials.cleanup_versions(include_app=True))
            self.assertIsNotNone(secrets.versions[old])
            self.assertTrue(all(data is None for name, data in secrets.versions.items() if name != old))
            self.assertNotIn("secret_cleanup_pending", db.data)

    def test_ambiguous_firestore_pointer_commit_remains_uncertain_until_reauth(self):
        credentials, store, db, _, clock, secrets = synthetic_credentials()
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
            selected = db.data["credential_version"]
            self.assertTrue(db.data["control"]["authorization_uncertain"])
            self.assertTrue(db.data["secret_cleanup_pending"])
            self.assertTrue(credentials.cleanup_versions(include_app=True))
            self.assertIsNotNone(secrets.versions[selected])
            self.assertIsNone(secrets.versions[old])
            self.assertTrue(db.data["control"]["authorization_uncertain"])
            with self.assertRaises(AuthorizationError):
                manager.token()
            self.assertEqual(len(transport.calls), 1)

    def test_preempted_cleanup_does_not_destroy_successor_selected_version(self):
        credentials, store, db, _, _, secrets = synthetic_credentials()
        with store.locked():
            credentials.save_app_credentials("123", "synthetic-app-secret")
            app_version = db.data["app_version"]
            credentials.save(bundle())
            old = db.data["credential_version"]
            original = secrets.list_secret_versions
            replacement = []

            def preempted_list(request):
                successor = store.state.acquire(preempt=True)
                version = secrets.add_secret_version(request={"parent": ATHLETE, "payload": {
                    "data": json.dumps(bundle()).encode()}}).name
                replacement.append(version)
                store.state.fenced(successor, lambda state: state.update(
                    credential_version=version, secret_cleanup_pending=True))
                return original(request)
            secrets.list_secret_versions = preempted_list
            self.assertFalse(credentials.cleanup_versions(include_app=True))
            self.assertIsNotNone(secrets.versions[replacement[0]])
            self.assertIsNotNone(secrets.versions[app_version])
            self.assertTrue(db.data["secret_cleanup_pending"])
        secrets.list_secret_versions = original
        with store.locked(preempt=True):
            self.assertTrue(credentials.cleanup_versions(include_app=True))
            self.assertIsNone(secrets.versions[old])
            self.assertIsNotNone(secrets.versions[replacement[0]])
            self.assertIsNotNone(secrets.versions[app_version])

    def test_stale_add_finishing_after_successor_sweep_requests_another_cleanup(self):
        credentials, store, db, _, _, secrets = synthetic_credentials()
        successor_store = type(store)(store.state, store.bucket, now=store.now, heartbeat=False)
        successor_credentials = CredentialStore(successor_store, secrets, ATHLETE, APP)
        with store.locked():
            credentials.save(bundle())
            selected = db.data["credential_version"]
            delayed = []

            def finish_after_sweep():
                # The remote add is still pending while a successor enumerates
                # and acknowledges cleanup; it materializes only afterward.
                version = next(name for name in secrets.versions if name != selected)
                payload = secrets.versions.pop(version)
                with successor_store.locked(preempt=True):
                    self.assertTrue(successor_credentials.cleanup_versions(include_app=True))
                    self.assertNotIn("secret_cleanup_pending", db.data)
                secrets.versions[version] = payload
                delayed.append(version)
            secrets.after_add = finish_after_sweep
            with self.assertRaises(AuthorizationError):
                credentials.save(bundle())
            self.assertTrue(db.data["secret_cleanup_pending"])
            self.assertEqual(db.data["credential_version"], selected)
            self.assertIsNotNone(secrets.versions[delayed[0]])
        secrets.after_add = None
        with successor_store.locked():
            self.assertTrue(successor_credentials.cleanup_versions(include_app=True))
            self.assertIsNone(secrets.versions[delayed[0]])
            self.assertIsNotNone(secrets.versions[selected])
            self.assertNotIn("secret_cleanup_pending", db.data)

    def test_sweep_preserves_cleanup_request_arriving_after_its_list_snapshot(self):
        credentials, store, db, _, _, secrets = synthetic_credentials()
        with store.locked():
            credentials.save_app_credentials("123", "synthetic-app-secret")
            app_version = db.data["app_version"]
            db.data["secret_cleanup_pending"] = True
            original = secrets.list_secret_versions
            late = []

            def delayed_list(request):
                versions = original(request)
                if request["parent"] == APP:
                    late.append(secrets.add_secret_version(request={"parent": APP, "payload": {
                        "data": b'{"client_id":"123","client_secret":"synthetic-late"}'}}).name)
                    store.state.atomic(lambda state: state.update(
                        secret_cleanup_pending=int(state.get("secret_cleanup_pending", 0)) + 1))
                return versions
            secrets.list_secret_versions = delayed_list
            self.assertFalse(credentials.cleanup_versions(include_app=True))
            self.assertTrue(db.data["secret_cleanup_pending"])
            self.assertIsNotNone(secrets.versions[late[0]])
            secrets.list_secret_versions = original
            self.assertTrue(credentials.cleanup_versions(include_app=True))
            self.assertIsNone(secrets.versions[late[0]])
            self.assertIsNotNone(secrets.versions[app_version])
            self.assertNotIn("secret_cleanup_pending", db.data)

    def test_partial_sweep_cannot_clear_application_orphan_marker(self):
        credentials, store, db, _, _, secrets = synthetic_credentials()
        with store.locked():
            credentials.save_app_credentials("123", "synthetic-app-secret")
            app_version = db.data["app_version"]
            orphan = secrets.add_secret_version(request={"parent": APP, "payload": {
                "data": b'{"client_id":"123","client_secret":"synthetic-orphan"}'}}).name
            db.data["secret_cleanup_pending"] = True
            self.assertTrue(credentials.cleanup_versions())
            self.assertTrue(db.data["secret_cleanup_pending"])
            self.assertIsNotNone(secrets.versions[orphan])
            self.assertTrue(credentials.cleanup_versions(include_app=True))
            self.assertIsNone(secrets.versions[orphan])
            self.assertIsNotNone(secrets.versions[app_version])
            self.assertNotIn("secret_cleanup_pending", db.data)

    def test_failed_rotation_cleanup_retries_and_disconnect_destroys_orphans(self):
        credentials, store, db, _, _, secrets = synthetic_credentials()
        with store.locked():
            credentials.save_app_credentials("123", "synthetic-app-secret")
            credentials.save(bundle())
            old = db.data["credential_version"]
            secrets.fail_destroy = True
            credentials.save(bundle())
            selected = db.data["credential_version"]
            self.assertTrue(db.data["secret_cleanup_pending"])
            self.assertIsNotNone(secrets.versions[selected])
            self.assertIsNotNone(secrets.versions[old])
            secrets.fail_destroy = False
            self.assertTrue(credentials.cleanup_versions(include_app=True))
            self.assertIsNone(secrets.versions[old])
            self.assertIsNotNone(secrets.versions[selected])
            secrets.add_secret_version(request={"parent": ATHLETE, "payload": {
                "data": json.dumps(bundle()).encode()}})
            self.assertTrue(credentials.delete(include_app=True))
            self.assertTrue(all(data is None for data in secrets.versions.values()))
            self.assertEqual(db.data["credential_status"], "revoked")
            self.assertNotIn("credential_version", db.data)
            self.assertNotIn("app_version", db.data)
            self.assertNotIn("secret_cleanup_pending", db.data)

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
