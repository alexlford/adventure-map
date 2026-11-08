"""Synthetic fixtures only; no archive or network access."""

import copy
import unittest

from .review import candidate, inspect_streams


def activity(**changes):
    value = {"id": 101, "name": "Synthetic outing", "sport_type": "Run",
             "start_date": "2026-10-02T07:00:00Z", "start_date_local": "2026-10-02T09:00:00Z",
             "distance": 5000, "elapsed_time": 1600, "moving_time": 1500, "total_elevation_gain": 20}
    value.update(changes)
    return value


def streams(points, times):
    return {"latlng": {"data": points}, "time": {"data": times}}


class CandidateTest(unittest.TestCase):
    def test_ordinary_running_stays_private(self):
        value = candidate(activity())
        self.assertEqual(value["suggestedAction"], "review-only")
        self.assertFalse(value["publicationAllowed"])
        self.assertTrue(value["privateOnly"])
        self.assertIsNone(value["canonicalRecordId"])
        self.assertIsNone(value["review"]["publish"])

    def test_event_hints_are_review_only(self):
        self.assertEqual(candidate(activity(workout_type=1))["suggestedAction"], "race-review")
        self.assertEqual(candidate(activity(name="Synthetic Marathon"))["suggestedAction"], "race-review")
        self.assertTrue(candidate(activity(name="Synthetic traverse"))["possibleStoryReview"])
        self.assertFalse(candidate(activity(name="Synthetic traverse"))["publicationAllowed"])

    def test_ride_always_needs_classification(self):
        for sport_type in ("Ride", "MountainBikeRide", "EMountainBikeRide"):
            value = candidate(activity(sport_type=sport_type))
            self.assertTrue(value["classificationRequired"])
            self.assertIsNone(value["review"]["classification"])
            self.assertEqual(value["suggestedAction"], "bike-review")

    def test_nordic_and_alpine_relationships_are_suggestions(self):
        nordic = candidate(activity(sport_type="NordicSki"))
        self.assertEqual(nordic["suggestedAction"], "candidate-outing")
        self.assertEqual(nordic["dayGroupingSuggestion"]["date"], "2026-10-02")
        self.assertEqual(candidate(activity(sport_type="NordicSki", name="Synthetic race"))["suggestedAction"], "race-review")
        alpine = candidate(activity(sport_type="AlpineSki"))
        self.assertEqual(alpine["suggestedAction"], "ski-passport")
        self.assertTrue(alpine["slopesReconciliationRequired"])

    def test_identifiers_timestamps_and_visibility_preserved(self):
        value = candidate(activity(external_id="synthetic.fit", upload_id=22, private=True, visibility="only_me"))
        self.assertEqual(value["stravaActivityId"], "101")
        self.assertEqual(value["activityLocalDateTime"], "2026-10-02T09:00:00")
        self.assertEqual(value["activityStartDateUtc"], "2026-10-02T07:00:00Z")
        self.assertEqual(value["sourceExternalId"], "synthetic.fit")
        self.assertEqual(value["sourceUploadId"], "22")
        self.assertEqual(value["privacy"]["visibility"], "only_me")
        self.assertIsNone(value["privacy"]["publicRoute"])

    def test_no_mutation_and_invalid_id(self):
        source = activity()
        original = copy.deepcopy(source)
        candidate(source)
        self.assertEqual(source, original)
        with self.assertRaises(ValueError):
            candidate(activity(id=None))

    def test_race_identity_hints_preserve_owner_review(self):
        value = candidate(activity(name="Synthetic Berlin Marathon", distance=42195))
        self.assertEqual(value["raceEvidence"]["worldMajorNameSuggestion"], "Berlin Marathon")
        self.assertEqual(value["raceEvidence"]["distanceCategorySuggestion"], "marathon")
        self.assertFalse(value["raceEvidence"]["officialResultVerified"])
        self.assertIsNone(value["canonicalRecordId"])
        self.assertFalse(value["publicationAllowed"])

    def test_distance_alone_does_not_identify_a_race(self):
        value = candidate(activity(name="Synthetic training run", distance=10000, workout_type=0))
        self.assertEqual(value["suggestedAction"], "review-only")
        self.assertEqual(value["raceEvidence"]["signals"], [])
        self.assertEqual(value["raceEvidence"]["distanceCategorySuggestion"], "10K")


class StreamsTest(unittest.TestCase):
    def test_missing_gps_has_no_fallback_route(self):
        for source in ({}, {"latlng": {"data": []}}):
            value = inspect_streams(source)
            self.assertEqual(value["status"], "missing-gps")
            self.assertEqual(value["segments"], [])
            self.assertIsNone(value["publicRoute"])

    def test_recorded_points_preserved_without_modification(self):
        source = streams([[0, 0], [0, .0001], [0, .0002]], [0, 10, 20])
        original = copy.deepcopy(source)
        value = inspect_streams(source)
        self.assertEqual(source, original)
        self.assertEqual(value["segments"][0]["coordinatesLatLng"], source["latlng"]["data"])
        self.assertEqual(value["segments"][0]["evidenceType"], "recorded")
        self.assertFalse(value["originalExportGps"])
        self.assertFalse(value["publicationAllowed"])

    def test_gaps_and_jumps_split_without_interpolation(self):
        source = streams([[0, 0], [0, .0001], [0, .0002], [1, 1]], [0, 10, 200, 201])
        value = inspect_streams(source)
        self.assertEqual([len(s["coordinatesLatLng"]) for s in value["segments"]], [2, 1, 1])
        self.assertEqual([f["reason"] for f in value["flags"]], ["recording-gap", "possible-gps-jump"])
        self.assertEqual(value["inferredSegments"], [])
        self.assertEqual(value["validPointCount"], 4)

    def test_invalid_points_break_continuity(self):
        value = inspect_streams(streams([[0, 0], None, [0, .0001], [91, 0], [0, .0002]], [0, 1, 2, 3, 4]))
        self.assertEqual(len(value["segments"]), 3)
        self.assertEqual(value["validPointCount"], 3)
        self.assertEqual(len(value["flags"]), 2)

    def test_missing_or_nonincreasing_times_do_not_imply_continuity(self):
        missing = inspect_streams(streams([[0, 0], [0, .0001]], []))
        self.assertEqual(len(missing["segments"]), 2)
        decreasing = inspect_streams(streams([[0, 0], [0, .0001]], [2, 1]))
        self.assertEqual(len(decreasing["segments"]), 2)
        self.assertEqual(decreasing["flags"][0]["reason"], "non-increasing-time")

    def test_hidden_sections_remain_unknown(self):
        value = inspect_streams(streams([[0, 0]], [0]))
        self.assertIn("do-not-reconstruct", value["visibilityCompleteness"])
        self.assertEqual(value["routePrivacy"], "unverified")
        self.assertEqual(value["inferredSegments"], [])

    def test_distance_checks_never_bridge_recording_gaps(self):
        value = inspect_streams(streams([[0, 0], [0, .001], [1, 1]], [0, 10, 300]),
                                {"distance": 1000})
        self.assertAlmostEqual(value["mappedRecordedDistanceM"], 111.195, places=2)
        self.assertIn("recorded-distance-disagreement", [f["reason"] for f in value["flags"]])
        self.assertEqual([len(s["coordinatesLatLng"]) for s in value["segments"]], [2, 1])

    def test_shortening_flags_new_observation_without_copying_old_geometry(self):
        source = streams([[0, 0], [0, .001]], [0, 10])
        value = inspect_streams(source, {"distance": 111}, {"mappedRecordedDistanceM": 1000})
        self.assertIn("recorded-geometry-shortened", [f["reason"] for f in value["flags"]])
        self.assertEqual(value["validPointCount"], 2)
        self.assertEqual(value["inferredSegments"], [])

    def test_obvious_coordinate_order_errors_are_flagged_not_swapped(self):
        source = streams([[120, 30]], [0])
        value = inspect_streams(source)
        self.assertEqual(value["segments"], [])
        self.assertEqual(value["flags"][0]["reason"], "possible-coordinate-order-error")
        self.assertEqual(source["latlng"]["data"], [[120, 30]])

    def test_geometry_fingerprint_is_transient_and_deterministic(self):
        a = inspect_streams(streams([[0, 0], [0, .001]], [0, 10]))
        b = inspect_streams(streams([[0, 0], [0, .001]], [0, 20]))
        self.assertEqual(a["transientGeometryFingerprint"], b["transientGeometryFingerprint"])
        self.assertIsNone(inspect_streams({})["transientGeometryFingerprint"])

    def test_negative_time_does_not_connect_to_a_valid_next_point(self):
        value = inspect_streams(streams([[0, 0], [0, .001]], [-1, 10]))
        self.assertEqual(len(value["segments"]), 2)


if __name__ == "__main__":
    unittest.main()
