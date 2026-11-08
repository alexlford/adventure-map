"""Synthetic worker integration: fake SDKs and fake Strava read transport only."""
import copy
import json
import unittest
from urllib.parse import parse_qs, urlsplit

from .backends import LeaseLost
from .test_tokens import FakeTransport, bundle, synthetic_credentials
from .tokens import AuthorizationError, TokenManager
from .worker import Runtime, cleanup_bucket, validate_request
from ..strava_private.sync import DAY, epoch_date
from ..strava_private.transport import ApiError

NOW = epoch_date("2026-11-08")
BASELINE = {"snapshotOn": "2026-08-10", "activityCount": 0}


class FakeAPI(FakeTransport):
    def __init__(self):
        super().__init__()
        self.pages = [[{"id": 900001}]]
        self.details = {"900001": {"id": 900001, "athlete": {"id": 42}, "name": "Synthetic race",
                                  "sport_type": "Run", "distance": 1000, "private": True,
                                  "start_date": "2026-10-10T12:00:00Z"}}
        self.fail_page = None
        self.revoke_failed = False

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if method == "POST":
            if path == "/oauth/revoke" and self.revoke_failed:
                raise ApiError(503)
            return copy.deepcopy(self.response)
        if "athlete/activities" in path:
            page = int(parse_qs(urlsplit(path).query)["page"][0])
            if self.fail_page == page:
                raise ApiError(429, "rate_limited", NOW + 900)
            return copy.deepcopy(self.pages[page - 1] if page <= len(self.pages) else [])
        ident = path.split("/")[4]
        if ident not in self.details:
            raise ApiError(404, "not_found")
        if "/streams?" in path:
            return {"latlng": {"data": [[0, 0], [0, .001]]}, "time": {"data": [0, 5]}}
        return copy.deepcopy(self.details[ident])


def synthetic_runtime():
    credentials, store, db, bucket, clock, secrets = synthetic_credentials()
    clock[0] = NOW
    api = FakeAPI()
    runtime = Runtime(store, credentials, api, now=lambda: clock[0], baseline=BASELINE)
    with store.locked():
        credentials.save_app_credentials("123", "synthetic-app-secret")
        credentials.save(bundle(expires_at=NOW + DAY))
    return runtime, db, bucket, clock, secrets, api


class WorkerTests(unittest.TestCase):
    def test_failed_later_window_does_not_advance_whole_sync_success_marker(self):
        runtime, db, _, clock, _, api = synthetic_runtime()
        old_success = NOW - 90 * DAY
        db.data.setdefault("control", {})["last_successful_sync"] = old_success
        original = api.request
        calls = [0]
        def fail_second_window(method, path, **kwargs):
            if "athlete/activities" in path:
                calls[0] += 1
                if calls[0] == 2:
                    raise ApiError(503)
            return original(method, path, **kwargs)
        api.request = fail_second_window
        self.assertEqual(runtime.run(), {"status": "retry"})
        self.assertGreater(db.data["control"]["checkpoint"], old_success)
        self.assertEqual(db.data["control"]["last_successful_sync"], old_success)
        self.assertIn("catchup_target", db.data["control"])
        api.request = original
        clock[0] += 3601
        self.assertEqual(runtime.run("recovery"), {"status": "completed"})
        self.assertGreaterEqual(db.data["control"]["last_successful_sync"], NOW)

    def test_weekly_catches_up_in_bounded_windows_without_publication(self):
        runtime, db, _, _, _, api = synthetic_runtime()
        result = runtime.run()
        self.assertEqual(result, {"status": "completed"})
        control = runtime.store.load_control()
        self.assertEqual(control["checkpoint"], NOW)
        self.assertNotIn("catchup_target", control)
        self.assertNotIn("pending", control)
        list_paths = [path for _, path, _ in api.calls if "athlete/activities" in path]
        self.assertGreater(len(list_paths), 1)
        for path in list_paths:
            query = parse_qs(urlsplit(path).query)
            self.assertLessEqual(int(query["before"][0]) - int(query["after"][0]) - 1, 31 * DAY)
        snapshot = runtime.review_snapshot()
        self.assertFalse(snapshot["payload"]["queue"]["publicationAllowed"])
        self.assertIsNone(snapshot["payload"]["queue"]["stateProposal"])
        self.assertNotIn("900001", json.dumps(db.data))
        self.assertNotIn("Synthetic race", json.dumps(db.data))

    def test_recovery_runs_only_pending_work_and_honors_retry_deadline(self):
        runtime, _, _, clock, _, api = synthetic_runtime()
        self.assertEqual(runtime.run("recovery"), {"status": "idle"})
        self.assertEqual(api.calls, [])
        api.pages = [[{"id": 900001}] * 200, []]
        api.fail_page = 2
        self.assertEqual(runtime.run(), {"status": "rate_limited"})
        control = runtime.store.load_control()
        self.assertNotIn("checkpoint", control)
        self.assertIn("pending", control)
        self.assertEqual(control["retry_at"], NOW + 900)
        count = len(api.calls)
        self.assertEqual(runtime.run("recovery"), {"status": "deferred"})
        self.assertEqual(count, len(api.calls))
        api.fail_page = None
        clock[0] += 901
        self.assertEqual(runtime.run("recovery"), {"status": "completed"})
        self.assertEqual(runtime.store.load_control()["checkpoint"], clock[0])

    def test_failed_cache_commit_never_advances_checkpoint(self):
        runtime, _, bucket, _, _, _ = synthetic_runtime()
        bucket.fail_upload = True
        self.assertEqual(runtime.run(), {"status": "retry"})
        control = runtime.store.load_control()
        self.assertNotIn("checkpoint", control)
        self.assertIn("pending", control)
        self.assertEqual(control["health"], "retry")

    def test_backfill_requires_dates_max31days_and_never_moves_checkpoint(self):
        runtime, _, _, _, _, api = synthetic_runtime()
        for since, until in (("2026-01-01", "2026-03-01"), ("2027-01-01", "2027-01-02"), (None, None)):
            with self.assertRaises((ValueError, TypeError)):
                runtime.run("backfill", since=since, until=until)
        self.assertEqual(api.calls, [])
        with runtime.store.locked():
            runtime.store.save_control({"checkpoint": NOW})
        self.assertEqual(runtime.run("backfill", "2026-01-01", "2026-01-31"), {"status": "completed"})
        self.assertEqual(runtime.store.load_control()["checkpoint"], NOW)
        self.assertEqual(runtime.review_snapshot()["payload"]["report"]["mode"], "backfill")

    def test_revoke_preempts_worker_and_denies_review_even_remote_failure(self):
        runtime, db, bucket, _, secrets, api = synthetic_runtime()
        runtime.run()
        first = runtime.store.state.acquire()
        api.revoke_failed = True
        result = runtime.revoke()
        self.assertEqual(result, {"remoteRevoked": False, "localRevoked": True, "localCleared": True})
        with self.assertRaises(LeaseLost):
            first.check()
        self.assertIsNone(runtime.review_snapshot())
        self.assertIsNone(bucket.body)
        self.assertNotIn("credential_version", db.data)
        self.assertTrue(all(value is None for value in secrets.versions.values()))
        count = len(api.calls)
        self.assertEqual(runtime.run("recovery"), {"status": "reauthorize"})
        self.assertEqual(count, len(api.calls))
        runtime.setup_client("123", "synthetic-reconnected-app")
        self.assertEqual(runtime.oauth_client_id(), "123")
        api.revoke_failed = False
        api.response["athlete"] = {"id": 42}
        self.assertTrue(runtime.exchange_code("synthetic-reconnected-code", ["activity:read_all"])["authorized"])

    def test_inaccessible_detail_erases_old_content_and_geometry(self):
        runtime, _, _, _, _, api = synthetic_runtime()
        self.assertEqual(runtime.run(), {"status": "completed"})
        api.details = {}
        api.pages = [[]]
        self.assertEqual(runtime.run(), {"status": "completed"})
        payload = runtime.review_snapshot()["payload"]
        self.assertEqual(payload["activities"], {})
        self.assertEqual(payload["queue"]["candidates"], [])
        self.assertNotIn("Synthetic race", json.dumps(payload))
        self.assertNotIn("coordinatesLatLng", json.dumps(payload))

    def test_revoke_delete_generation_race_reports_pending_and_recovers(self):
        runtime, db, bucket, _, _, _ = synthetic_runtime()
        runtime.run()

        def concurrent_old_writer_finishes():
            bucket.generation += 1
        bucket.before_delete = concurrent_old_writer_finishes
        result = runtime.revoke()
        self.assertTrue(result["localRevoked"])
        self.assertFalse(result["localCleared"])
        self.assertTrue(db.data["cache_cleanup_pending"])
        self.assertIsNone(runtime.review_snapshot())
        runtime.run("recovery")
        self.assertIsNone(bucket.body)
        self.assertNotIn("cache_cleanup_pending", db.data)

    def test_global_401_and_403_remove_athlete_grant_and_cache_preserving_app_setup(self):
        for status in (401, 403):
            with self.subTest(status=status):
                runtime, db, bucket, _, secrets, api = synthetic_runtime()
                runtime.run()
                app_version = db.data["app_version"]
                original = api.request
                api.response["expires_at"] = NOW + 2 * DAY

                def denied(method, path, **kwargs):
                    if "athlete/activities" in path:
                        api.calls.append((method, path, kwargs))
                        raise ApiError(status, "unauthorized" if status == 401 else "forbidden")
                    return original(method, path, **kwargs)
                api.request = denied
                self.assertEqual(runtime.run(), {"status": "reauthorize"})
                self.assertNotIn("credential_version", db.data)
                self.assertEqual(db.data["credential_status"], "revoked")
                self.assertEqual(db.data["app_version"], app_version)
                self.assertIsNotNone(secrets.versions[app_version])
                self.assertIsNone(bucket.body)
                self.assertIsNone(runtime.review_snapshot())
                self.assertTrue(all(data is None for name, data in secrets.versions.items() if "/athlete/" in name))
                self.assertFalse(any(path == "/oauth/revoke" for _, path, _ in api.calls))

    def test_global_denial_cleanup_failures_remain_inaccessible_and_retry(self):
        runtime, db, bucket, _, secrets, api = synthetic_runtime()
        runtime.run()
        original = api.request

        def denied(method, path, **kwargs):
            if "athlete/activities" in path:
                raise ApiError(403, "forbidden")
            return original(method, path, **kwargs)
        api.request = denied
        bucket.fail_delete = True
        secrets.fail_destroy = True
        self.assertEqual(runtime.run(), {"status": "reauthorize"})
        self.assertNotIn("credential_version", db.data)
        self.assertTrue(db.data["cache_cleanup_pending"])
        self.assertTrue(db.data["secret_cleanup_pending"])
        self.assertIsNotNone(bucket.body)
        self.assertIsNone(runtime.review_snapshot())
        bucket.fail_delete = False
        secrets.fail_destroy = False
        self.assertEqual(runtime.run("recovery"), {"status": "reauthorize"})
        self.assertIsNone(bucket.body)
        self.assertNotIn("cache_cleanup_pending", db.data)
        self.assertNotIn("secret_cleanup_pending", db.data)

    def test_secret_access_failure_denies_review_even_when_cache_deletion_fails(self):
        runtime, db, bucket, _, secrets, api = synthetic_runtime()
        runtime.run()
        pointer = db.data["credential_version"]
        original = secrets.access_secret_version

        def unavailable(request):
            raise OSError("Synthetic secret service unavailable.")
        secrets.access_secret_version = unavailable
        bucket.fail_delete = True
        count = len(api.calls)
        self.assertEqual(runtime.run(), {"status": "reauthorize"})
        self.assertEqual(db.data["credential_version"], pointer)
        self.assertTrue(db.data["control"]["authorization_uncertain"])
        self.assertTrue(db.data["cache_cleanup_pending"])
        self.assertIsNone(runtime.review_snapshot())
        self.assertEqual(count, len(api.calls))
        secrets.access_secret_version = original
        bucket.fail_delete = False
        self.assertEqual(runtime.run("recovery"), {"status": "reauthorize"})
        self.assertTrue(db.data["control"]["authorization_uncertain"])
        self.assertIsNone(bucket.body)
        self.assertEqual(count, len(api.calls))

    def test_ambiguous_refresh_erases_content_and_stays_uncertain_without_retry(self):
        runtime, db, bucket, clock, _, api = synthetic_runtime()
        runtime.run()
        with runtime.store.locked():
            runtime.credentials.save(bundle(expires_at=clock[0]))
        pointer = db.data["credential_version"]
        original = api.request

        def ambiguous(method, path, **kwargs):
            if path == "/oauth/token":
                api.calls.append((method, path, kwargs))
                raise ApiError(code="token_exchange_ambiguous")
            return original(method, path, **kwargs)
        api.request = ambiguous
        self.assertEqual(runtime.run(), {"status": "reauthorize"})
        self.assertTrue(db.data["control"]["authorization_uncertain"])
        self.assertEqual(db.data["credential_version"], pointer)
        self.assertIsNone(bucket.body)
        self.assertIsNone(runtime.review_snapshot())
        count = len(api.calls)
        self.assertEqual(runtime.run("recovery"), {"status": "reauthorize"})
        self.assertEqual(count, len(api.calls))

    def test_per_activity_403_erases_activity_without_deactivating_grant(self):
        runtime, db, _, _, _, api = synthetic_runtime()
        runtime.run()
        pointer = db.data["credential_version"]
        original = api.request

        def private_detail(method, path, **kwargs):
            if path == "/api/v3/activities/900001":
                raise ApiError(403, "forbidden")
            return original(method, path, **kwargs)
        api.request = private_detail
        self.assertEqual(runtime.run(), {"status": "completed"})
        self.assertEqual(db.data["credential_version"], pointer)
        self.assertFalse(db.data["control"].get("authorization_uncertain"))
        self.assertEqual(runtime.review_snapshot()["payload"]["activities"], {})

    def test_skiing_gets_candidate_only_gps_training_does_not(self):
        runtime, _, _, _, _, api = synthetic_runtime()
        api.details["900001"]["sport_type"] = "AlpineSki"
        api.details["900001"]["name"] = "Synthetic skiing"
        api.details["900002"] = {**api.details["900001"], "id": 900002,
                                  "sport_type": "Run", "name": "Synthetic training"}
        api.pages = [[{"id": 900001}, {"id": 900002}]]
        runtime.run()
        paths = [path for _, path, _ in api.calls if "/streams?" in path]
        self.assertTrue(any("/900001/" in path for path in paths))
        self.assertFalse(any("/900002/" in path for path in paths))

    def test_initial_app_setup_authorization_and_fail_closed_scope(self):
        credentials, store, db, _, clock, _ = synthetic_credentials()
        api = FakeAPI()
        runtime = Runtime(store, credentials, api, now=lambda: clock[0])
        self.assertIsNone(runtime.oauth_client_id())
        runtime.setup_client("123", "synthetic-app-secret")
        self.assertEqual(runtime.oauth_client_id(), "123")
        api.response["athlete"] = {"id": 42}
        self.assertEqual(runtime.exchange_code("synthetic-code", ["activity:read_all"]),
                         {"authorized": True, "readOnly": True})
        self.assertNotIn("athlete_id", db.data)
        with self.assertRaises(AuthorizationError):
            runtime.exchange_code("synthetic-code", ["activity:write"])

    def test_cleanup_uses_metadata_only_and_preserves_unexpired_object(self):
        runtime, _, bucket, clock, _, _ = synthetic_runtime()
        runtime.run()
        downloads = bucket.downloads
        self.assertEqual(cleanup_bucket(bucket, now=lambda: clock[0]), {"status": "cleaned"})
        self.assertIsNotNone(bucket.body)
        clock[0] += 48 * 3600
        cleanup_bucket(bucket, now=lambda: clock[0])
        self.assertIsNone(bucket.body)
        self.assertEqual(downloads, bucket.downloads)

    def test_preflight_quota_does_not_mark_refresh_uncertain(self):
        runtime, _, _, clock, _, api = synthetic_runtime()
        with runtime.store.locked():
            expired = bundle(expires_at=clock[0])
            runtime.credentials.save(expired)
            def quota():
                raise ApiError(429, "rate_limited", NOW + 900)
            api.preflight = quota
            with self.assertRaises(ApiError):
                TokenManager(runtime.credentials, api, now=lambda: clock[0]).token()
            self.assertFalse(runtime.store.load_control().get("authorization_uncertain"))
            self.assertEqual(api.calls, [])


if __name__ == "__main__":
    unittest.main()
