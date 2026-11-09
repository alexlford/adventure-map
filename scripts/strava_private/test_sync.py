"""Entirely invented activity IDs, dates, titles and coordinates. No live I/O."""
import copy
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from .storage import PrivateStore, StorageError
from .sync import Sync, SyncError, DAY, epoch_date
from .transport import ApiError

BASELINE = {"snapshotOn": "2026-01-01", "activityCount": 0,
            "lastSeenActivityLocalDateTime": "2026-01-01T01:00:00"}
NOW = epoch_date("2026-01-20")


def activity(ident=900001, **kwargs):
    return dict(id=ident, athlete={"id": 42}, name="Synthetic training",
                start_date="2026-01-10T12:00:00Z", start_date_local="2026-01-10T12:00:00Z",
                sport_type="Run", distance=1000, private=False, **kwargs)


class Tokens:
    def __init__(self):
        self.refreshes = 0

    def token(self, force_refresh=False):
        self.refreshes += bool(force_refresh)
        return "synthetic-token"


class FakeAPI:
    def __init__(self, details=None, pages=None):
        self.details = details or {"900001": activity()}
        self.pages = pages or [[{"id": int(i)} for i in self.details]]
        self.calls = []
        self.fail_page = None
        self.expired = False
        self.streams = {}

    def request(self, method, path, token=None):
        assert method == "GET"
        self.calls.append(path)
        if self.expired:
            self.expired = False
            raise ApiError(401, "unauthorized")
        if "athlete/activities" in path:
            page = int(parse_qs(urlsplit(path).query)["page"][0])
            if page == self.fail_page:
                raise ApiError(503)
            return copy.deepcopy(self.pages[page-1] if page <= len(self.pages) else [])
        ident = path.split("/")[4]
        if ident not in self.details:
            raise ApiError(404, "not_found")
        if "/streams?" in path:
            return copy.deepcopy(self.streams)
        return copy.deepcopy(self.details[ident])


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.clock = NOW
        self.store = PrivateStore(Path(self.tmp.name).resolve()/"private", now=lambda: self.clock)
        self.tokens = Tokens()
        self.api = FakeAPI()

    def tearDown(self):
        self.tmp.cleanup()

    def run_sync(self, **kwargs):
        with self.store.locked():
            Sync(self.store, self.tokens, self.api, "42", BASELINE, now=lambda: self.clock).run(**kwargs)

    def test_success_queue_no_watermark_or_public_identity(self):
        self.run_sync()
        payload = self.store.load_cache()
        queue = payload["queue"]
        self.assertIsNone(queue["stateProposal"])
        self.assertFalse(queue["publicationAllowed"])
        self.assertEqual(queue["candidates"][0]["stravaActivityId"], "900001")
        self.assertIsNone(queue["candidates"][0]["canonicalRecordId"])
        self.assertEqual(self.store.load_control()["checkpoint"], NOW)
        self.assertEqual(set(self.store.load_control()), {"schemaVersion", "checkpoint", "last_complete_scan", "rate", "events"})

    def test_pagination_duplicate_ids_and_repeated_sync(self):
        self.api.pages = [[{"id": 900001}]*200, [{"id": 900001}]]
        self.run_sync()
        self.assertEqual(len(self.store.load_cache()["activities"]), 1)
        self.assertEqual(sum(p == "/api/v3/activities/900001" for p in self.api.calls), 1)
        self.assertTrue(any("page=2" in p for p in self.api.calls))
        original = copy.deepcopy(self.store.load_cache()["queue"]["candidates"])
        self.run_sync()
        self.assertEqual(self.store.load_cache()["queue"]["candidates"], original)

    def test_interrupt_replays_page_one_without_advancing_cursor(self):
        self.store.save_control({"checkpoint": epoch_date("2026-01-05")})
        self.api.pages = [[{"id": 900001}]*200, []]
        self.api.fail_page = 2
        with self.assertRaises(ApiError):
            self.run_sync()
        state = self.store.load_control()
        self.assertEqual(state["checkpoint"], epoch_date("2026-01-05"))
        self.assertIn("pending", state)
        self.assertFalse(self.store.load_cache()["report"]["complete"])
        self.api.fail_page = None
        self.api.calls.clear()
        self.run_sync()
        self.assertNotIn("pending", self.store.load_control())
        self.assertTrue(any("page=1" in p for p in self.api.calls))
        self.assertEqual(len(self.store.load_cache()["activities"]), 1)

    def test_historical_backfill_does_not_move_normal_checkpoint(self):
        self.store.save_control({"checkpoint": NOW})
        self.run_sync(since="2025-12-01", until="2025-12-15")
        self.assertEqual(self.store.load_control()["checkpoint"], NOW)
        self.assertEqual(self.store.load_cache()["report"]["mode"], "backfill")

    def test_quota_resume_makes_progress_past_cached_prefix(self):
        self.api.details = {str(900001+i): activity(900001+i) for i in range(8)}
        self.api.pages = [[{"id": int(i)} for i in self.api.details]]
        original = self.api.request
        remaining = [4]
        def request(*args, **kwargs):
            remaining[0] -= 1
            if remaining[0] < 0:
                raise ApiError(429, "rate_limited", NOW+900)
            return original(*args, **kwargs)
        self.api.request = request
        for attempt in range(4):
            remaining[0] = 4
            try:
                self.run_sync()
                break
            except ApiError:
                self.assertIn("pending", self.store.load_control())
        self.assertNotIn("pending", self.store.load_control())
        self.assertEqual(len(self.store.load_cache()["activities"]), 8)
        self.assertEqual(sum("/api/v3/activities/" in p for p in self.api.calls), 8)

    def test_interrupted_stream_work_is_resumed_without_repeating_flag(self):
        original = self.api.request
        interrupted = [False]
        def request(*args, **kwargs):
            if "/streams?" in args[1] and not interrupted[0]:
                interrupted[0] = True
                raise ApiError(429, "rate_limited", NOW+900)
            return original(*args, **kwargs)
        self.api.request = request
        with self.assertRaises(ApiError):
            self.run_sync(streams=True)
        self.assertNotIn("processedWindow", self.store.load_cache()["activities"]["900001"])
        self.run_sync()
        self.assertIn("streams", self.store.load_cache()["activities"]["900001"])

    def test_candidate_streams_select_races_and_outings_not_training(self):
        training = activity(900001)
        race = activity(900002)
        race["name"] = "Synthetic Marathon Race"
        ride = activity(900003)
        ride["sport_type"] = "MountainBikeRide"
        self.api.details = {"900001": training, "900002": race, "900003": ride}
        self.api.pages = [[{"id": key} for key in (900001, 900002, 900003)]]
        self.run_sync(candidate_streams=True)
        stream_paths = [path for path in self.api.calls if "/streams?" in path]
        self.assertEqual(len(stream_paths), 2)
        self.assertFalse(any("/900001/" in path for path in stream_paths))
        self.assertTrue(any("/900002/" in path for path in stream_paths))
        self.assertTrue(any("/900003/" in path for path in stream_paths))
        self.assertNotIn("streams", self.store.load_cache()["activities"]["900001"])

    def test_candidate_stream_selection_survives_interrupted_window(self):
        self.api.details["900001"]["name"] = "Synthetic Race"
        original = self.api.request
        rejected = [False]
        def flaky(*args, **kwargs):
            if "/streams?" in args[1] and not rejected[0]:
                rejected[0] = True
                raise ApiError(429, "rate_limited", NOW+900)
            return original(*args, **kwargs)
        self.api.request = flaky
        with self.assertRaises(ApiError):
            self.run_sync(candidate_streams=True)
        pending = self.store.load_control()["pending"]
        self.assertTrue(pending["candidateStreams"])
        self.run_sync()
        self.assertIn("streams", self.store.load_cache()["activities"]["900001"])

    def test_historical_bounds_fail_without_request(self):
        for options in ({"since": "2025-01-01", "until": "2025-03-01"},
                        {"since": "2027-01-01"}, {"until": "2025-01-01"}):
            with self.assertRaises(SyncError):
                self.run_sync(**options)
        self.assertEqual(self.api.calls, [])

    def test_401_refresh_retry_once(self):
        self.api.expired = True
        self.run_sync()
        self.assertEqual(self.tokens.refreshes, 1)

    def test_edited_activity_and_privacy_change_remove_old_streams(self):
        self.api.streams = {"latlng": {"data": [[0,0],[0,.001]]}, "time": {"data": [0,5]}}
        self.run_sync(streams=True)
        self.api.details["900001"]["name"] = "Synthetic renamed"
        self.run_sync()
        entry = self.store.load_cache()["activities"]["900001"]
        self.assertEqual(entry["change"], "updated")
        self.assertNotIn("streams", entry)
        self.api.details["900001"]["private"] = True
        self.run_sync()
        entry = self.store.load_cache()["activities"]["900001"]
        self.assertEqual(entry["change"], "privacy-changed")
        self.assertNotIn("streams", entry)

    def test_gps_only_change_detected_and_original_not_archived(self):
        self.api.streams = {"latlng": {"data": [[0,0]]}, "time": {"data": [0]}}
        self.run_sync(streams=True)
        self.api.streams["latlng"]["data"] = [[1,1]]
        self.run_sync(streams=True)
        entry = self.store.load_cache()["activities"]["900001"]
        self.assertEqual(entry["change"], "gps-changed")
        self.assertNotIn("revisions", entry)

    def test_deletion_is_ambiguous_and_content_erased(self):
        self.run_sync(streams=True)
        self.api.details.clear()
        self.api.pages = [[]]
        self.run_sync()
        payload = self.store.load_cache()
        self.assertEqual(payload["activities"], {})
        self.assertEqual(payload["queue"]["candidates"], [])
        self.assertEqual(payload["notices"]["900001"]["change"], "deleted-or-inaccessible")
        self.assertNotIn("Synthetic training", str(payload))

    def test_missing_gps_is_valid(self):
        self.run_sync(streams=True)
        gps = self.store.load_cache()["activities"]["900001"]["gpsReview"]
        self.assertEqual(gps["segments"], [])
        self.assertFalse(self.store.load_cache()["queue"]["publicationAllowed"])

    def test_foreign_athlete_fails_closed(self):
        self.api.details["900001"]["athlete"]["id"] = 43
        with self.assertRaises(SyncError):
            self.run_sync()
        self.assertNotIn("checkpoint", self.store.load_control())
        self.assertIsNone(self.store.load_cache())

    def test_cache_expiry_mid_scan_never_resurrects_data(self):
        self.run_sync()
        envelope = self.store.read_json("cache.json")
        original = self.api.request
        def request(*args, **kwargs):
            self.clock = envelope["expires_at"]+1
            return original(*args, **kwargs)
        self.api.request = request
        old_checkpoint = self.store.load_control()["checkpoint"]
        with self.assertRaises(StorageError):
            self.run_sync()
        self.assertIsNone(self.store.load_cache())
        self.assertEqual(self.store.load_control()["checkpoint"], old_checkpoint)

    def test_cache_commit_failure_keeps_checkpoint(self):
        def fail(*args, **kwargs):
            raise StorageError("Synthetic storage failure")
        self.store.save_cache = fail
        with self.assertRaises(StorageError):
            self.run_sync()
        self.assertNotIn("checkpoint", self.store.load_control())
        self.assertIn("pending", self.store.load_control())

    def test_read_metadata_minimizes_unrelated_data(self):
        self.api.details["900001"]["photos"] = {"third_party": "not retained"}
        self.api.details["900001"]["segment_efforts"] = ["not retained"]
        self.run_sync()
        entry = self.store.load_cache()["activities"]["900001"]["activity"]
        self.assertNotIn("photos", entry)
        self.assertNotIn("segment_efforts", entry)
