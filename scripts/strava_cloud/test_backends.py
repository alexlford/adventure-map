"""Only invented values and in-memory SDK fakes; no cloud or private files."""
import copy
import json
import threading
import unittest

from .backends import CloudStore, LeaseBusy, LeaseLost, StateBackend
from ..strava_private.storage import CACHE_TTL, StorageError


class FakeFirestore:
    def __init__(self):
        self.data = {}
        self.lock = threading.RLock()
        self.fail = False

    def atomic(self, callback):
        with self.lock:
            if self.fail:
                raise StorageError("Synthetic state failure.")
            pending = copy.deepcopy(self.data)
            result = callback(pending)
            self.data = pending
            return result


class NotFound(Exception):
    code = 404


class PreconditionFailed(Exception):
    code = 412


class FakeBlob:
    def __init__(self, bucket):
        self.bucket, self.name = bucket, "cache.json"
        self.generation = None
        self.metadata = None

    def reload(self):
        if self.bucket.body is None:
            raise NotFound()
        self.generation = self.bucket.generation
        self.metadata = copy.deepcopy(self.bucket.metadata)

    def download_as_bytes(self, if_generation_match):
        self.bucket.downloads += 1
        if if_generation_match != self.bucket.generation:
            raise PreconditionFailed()
        return self.bucket.body

    def upload_from_string(self, data, content_type, if_generation_match):
        assert content_type == "application/json"
        if self.bucket.fail_upload:
            raise OSError("Synthetic unavailable SDK.")
        actual = self.bucket.generation if self.bucket.body is not None else 0
        if actual != if_generation_match:
            raise PreconditionFailed()
        if self.bucket.before_upload:
            self.bucket.before_upload()
        self.bucket.generation += 1
        self.bucket.body = bytes(data)
        self.bucket.metadata = copy.deepcopy(self.metadata)
        self.generation = self.bucket.generation

    def delete(self, if_generation_match):
        if self.bucket.fail_delete:
            raise OSError("Synthetic unavailable deletion.")
        if self.bucket.before_delete:
            callback, self.bucket.before_delete = self.bucket.before_delete, None
            callback()
        if self.bucket.body is None:
            raise NotFound()
        if self.bucket.generation != if_generation_match:
            raise PreconditionFailed()
        self.bucket.body = None
        self.bucket.metadata = None


class FakeBucket:
    def __init__(self):
        self.body, self.metadata = None, None
        self.generation = 0
        self.before_upload, self.before_delete = None, None
        self.fail_upload = False
        self.fail_delete = False
        self.downloads = 0

    def blob(self, name):
        assert name == "cache.json"
        return FakeBlob(self)

    def list_blobs(self, prefix, max_results):
        assert prefix == "cache.json"
        if self.body is None:
            return []
        blob = self.blob("cache.json")
        blob.reload()
        return [blob]


def synthetic_store(clock=None):
    clock = clock if clock is not None else [1000000]
    firestore, bucket = FakeFirestore(), FakeBucket()
    state = StateBackend(atomic=firestore.atomic, now=lambda: clock[0])
    return CloudStore(state, bucket, now=lambda: clock[0], heartbeat=False), firestore, bucket, clock


class BackendTests(unittest.TestCase):
    def test_transactional_acquire_has_one_winner_and_monotone_fence(self):
        store, db, _, clock = synthetic_store()
        winners, busy = [], []
        barrier = threading.Barrier(8)

        def acquire():
            barrier.wait()
            try:
                winners.append(store.state.acquire())
            except LeaseBusy:
                busy.append(True)
        threads = [threading.Thread(target=acquire) for _ in range(8)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual((len(winners), len(busy)), (1, 7))
        first = winners[0]
        clock[0] += 121
        second = store.state.acquire()
        self.assertGreater(second.fence, first.fence)
        with self.assertRaises(LeaseLost):
            store.state.fenced(first, lambda state: state.update(control={"checkpoint": 9}))
        self.assertNotIn("control", db.data)
        first.close()
        self.assertEqual(db.data["lease"]["fence"], second.fence)

    def test_heartbeat_extends_lease_and_preemption_fences_old_owner(self):
        store, _, _, clock = synthetic_store()
        first = store.state.acquire(ttl=120)
        clock[0] += 100
        first.heartbeat()
        clock[0] += 100
        with self.assertRaises(LeaseBusy):
            store.state.acquire()
        second = store.state.acquire(preempt=True)
        with self.assertRaises(LeaseLost):
            first.heartbeat()
        self.assertGreater(second.fence, first.fence)

    def test_cache_deadline_never_slides_and_expiry_deletes_on_read(self):
        store, db, bucket, clock = synthetic_store()
        with store.locked():
            store.save_cache({"synthetic": "first"})
            original = store.read_json("cache.json")
            clock[0] += 100
            store.save_cache({"synthetic": "second"})
            current = store.read_json("cache.json")
            self.assertEqual(current["expires_at"], original["expires_at"])
            self.assertEqual(current["created_at"], original["created_at"])
            self.assertEqual(db.data["cache_generation"], str(bucket.generation))
            clock[0] = original["expires_at"]
            self.assertIsNone(store.load_cache())
            self.assertIsNone(bucket.body)
            with self.assertRaises(StorageError):
                store.save_cache({"synthetic": "expired"}, expires_at=original["expires_at"])

    def test_lost_lease_during_upload_never_publishes_or_serves_orphan(self):
        store, db, bucket, clock = synthetic_store()
        with store.locked():
            store.save_cache({"synthetic": "committed"})
            old_generation = db.data["cache_generation"]

            def expire():
                clock[0] += 121
                store.state.acquire()
            bucket.before_upload = expire
            with self.assertRaises(LeaseLost):
                store.save_cache({"synthetic": "orphan"})
            self.assertEqual(db.data["cache_generation"], old_generation)
            self.assertIsNone(bucket.body)
            self.assertIsNone(store.load_cache())
            self.assertIsNone(bucket.body)

    def test_preempted_upload_deletion_failure_persists_cleanup_request(self):
        store, db, bucket, clock = synthetic_store()
        with store.locked():
            store.save_cache({"synthetic": "committed"})

            def revoke_during_upload():
                store.state.acquire(preempt=True)
                store.state.atomic(lambda state: state.update(credential_status="revoked"))
                bucket.fail_delete = True
            bucket.before_upload = revoke_during_upload
            with self.assertRaises(LeaseLost):
                store.save_cache({"synthetic": "unpublished"})
            self.assertEqual(db.data["cache_orphan_generation"], str(bucket.generation))
            with self.assertRaises(StorageError):
                store.load_cache()
            bucket.fail_delete = False
            self.assertIsNone(store.load_cache())
            self.assertIsNone(bucket.body)

    def test_old_orphan_hint_does_not_erase_new_selected_cache(self):
        store, db, bucket, _ = synthetic_store()
        db.data["credential_status"] = "authorized"
        with store.locked():
            store.save_cache({"synthetic": "old"})
            old = str(bucket.generation)
            store.save_cache({"synthetic": "new"})
            db.data["cache_orphan_generation"] = old
            store.cleanup_orphan()
            self.assertEqual(store.load_cache(), {"synthetic": "new"})
            self.assertNotIn("cache_orphan_generation", db.data)

    def test_expired_reader_cannot_delete_replacement_generation(self):
        store, db, bucket, clock = synthetic_store()
        with store.locked():
            store.save_cache({"synthetic": "old"})
            clock[0] += CACHE_TTL

            def replace():
                bucket.generation += 1
                bucket.body = json.dumps({"created_at": clock[0], "expires_at": clock[0] + CACHE_TTL,
                                          "payload": {"synthetic": "new"}, "fence": 8}).encode()
                db.data["cache_generation"] = str(bucket.generation)
            bucket.before_delete = replace
            self.assertIsNone(store.load_cache())
            self.assertIsNotNone(bucket.body)
            self.assertEqual(store.load_cache(), {"synthetic": "new"})

    def test_unselected_generation_under_live_writer_lease_is_not_deleted(self):
        store, db, bucket, clock = synthetic_store()
        with store.locked():
            store.save_cache({"synthetic": "committed"})
            selected = db.data["cache_generation"]
            bucket.generation += 1
            pending = {"created_at": clock[0], "expires_at": clock[0] + CACHE_TTL,
                       "payload": {"synthetic": "uncommitted"}, "fence": store.lease.fence}
            bucket.body = json.dumps(pending).encode()
            self.assertIsNone(store.load_cache())
            self.assertIsNotNone(bucket.body)
            self.assertEqual(db.data["cache_generation"], selected)
            db.data["cache_generation"] = str(bucket.generation)
            self.assertEqual(store.load_cache(), {"synthetic": "uncommitted"})

    def test_invalid_cache_is_deleted_without_reflecting_contents(self):
        store, _, bucket, _ = synthetic_store()
        bucket.body = b"synthetic malformed payload"
        bucket.generation = 1
        self.assertIsNone(store.load_cache())
        self.assertIsNone(bucket.body)

    def test_control_rejects_content_and_identifiers(self):
        store, _, _, _ = synthetic_store()
        with store.locked():
            for value in ({"activities": {}}, {"athlete_id": "42"}, {"retry_at": "private"},
                          {"health": "synthetic private activity"}, {"rate": {"activity": 4}}):
                with self.assertRaises(StorageError):
                    store.save_control(value)

    def test_csrf_atomic_consume_expiry_and_bounded_storage(self):
        store, db, _, clock = synthetic_store()
        digest = "a" * 64
        store.state.issue_oauth_state(digest, clock[0] + 60)
        self.assertTrue(store.state.consume_oauth_state(digest))
        self.assertFalse(store.state.consume_oauth_state(digest))
        store.state.issue_oauth_state(digest, clock[0] + 60)
        clock[0] += 61
        self.assertFalse(store.state.consume_oauth_state(digest))
        self.assertEqual(db.data["oauth_states"], {})
        with self.assertRaises(StorageError):
            store.state.issue_oauth_state("synthetic raw code", clock[0] + 20)


if __name__ == "__main__":
    unittest.main()
