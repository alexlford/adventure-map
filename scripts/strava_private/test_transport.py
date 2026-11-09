"""Entirely synthetic transport tests. Every HTTP operation uses an in-memory fake."""

import io
import json
import unittest
import urllib.error
from .transport import ApiError, Transport, _NoRedirect


class Clock:
    def __init__(self, now=100):
        self.value = now
        self.waits = []

    def now(self):
        return self.value

    def sleep(self, seconds):
        self.waits.append(seconds)
        self.value += seconds


class Response:
    def __init__(self, data=None, headers=None, status=200, body=None):
        self.status = status
        self.headers = headers or {}
        self.body = json.dumps(data).encode() if body is None else body
        self.closed = False

    def read(self, size):
        return self.body[:size]

    def close(self):
        self.closed = True


class FakeOpen:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, request, **kwargs):
        self.calls.append(request)
        value = self.responses.pop(0)
        if isinstance(value, Exception):
            raise value
        return value


def error(status, headers=None):
    return urllib.error.HTTPError("https://www.strava.com/private-synthetic", status,
                                  "SYNTHETIC_SECRET", headers or {}, io.BytesIO(b"SYNTHETIC_SECRET"))


class TransportTests(unittest.TestCase):
    def client(self, *responses, **kwargs):
        self.clock = Clock()
        self.opener = FakeOpen(*responses)
        return Transport(opener=self.opener, now=self.clock.now, sleep=self.clock.sleep, **kwargs)

    def get(self, client, path="/api/v3/athlete/activities?page=1&per_page=200"):
        return client.request("GET", path, token="synthetic-access")

    def test_success_bearer_fixed_host(self):
        response = Response([{"id": 900001}])
        client = self.client(response)
        self.assertEqual(self.get(client), [{"id": 900001}])
        self.assertEqual(self.opener.calls[0].full_url,
                         "https://www.strava.com/api/v3/athlete/activities?page=1&per_page=200")
        self.assertEqual(self.opener.calls[0].get_header("Authorization"), "Bearer synthetic-access")
        self.assertTrue(response.closed)

    def test_token_exchange_form_not_query(self):
        client = self.client(Response({"access_token": "synthetic-next"}))
        result = client.request("POST", "/oauth/token", form={"grant_type": "refresh_token",
                                "client_id": "synthetic", "client_secret": "synthetic-secret",
                                "refresh_token": "synthetic-refresh"})
        self.assertEqual(result["access_token"], "synthetic-next")
        self.assertNotIn("synthetic-secret", self.opener.calls[0].full_url)
        self.assertIn(b"synthetic-secret", self.opener.calls[0].data)

    def test_revoke_basic_empty_response(self):
        client = self.client(Response(body=b""))
        self.assertIsNone(client.request("POST", "/oauth/revoke", form={"token": "synthetic-refresh",
                         "token_type_hint": "refresh_token"}, basic=("synthetic-id", "synthetic-secret")))
        self.assertTrue(self.opener.calls[0].get_header("Authorization").startswith("Basic "))

    def test_allowlist_rejects_writes_hosts_and_unrelated_api(self):
        client = self.client()
        cases = [("GET", "https://example.invalid/api/v3/athlete/activities"),
                 ("GET", "//example.invalid/api/v3/athlete/activities"),
                 ("GET", "/api/v3/athlete/activities?access_token=bad"),
                 ("GET", "/api/v3/athlete/activities?per_page=201"),
                 ("GET", "/api/v3/athlete/activities?page=1&page=2"),
                 ("GET", "/api/v3/athlete"), ("POST", "/api/v3/activities/900001"),
                 ("PUT", "/api/v3/activities/900001"),
                 ("GET", "/api/v3/activities/900001/streams?keys=heartrate&key_by_type=true"),
                 ("GET", "/api/v3/activities/900001?include_all_efforts=true")]
        for method, path in cases:
            with self.subTest(path=path), self.assertRaises(ApiError):
                client.request(method, path, token="synthetic")
        self.assertEqual(self.opener.calls, [])

    def test_stream_allowlist(self):
        client = self.client(Response({}))
        self.assertEqual(self.get(client, "/api/v3/activities/900001/streams?keys=latlng,time,distance,altitude,moving&key_by_type=true"), {})

    def test_401_is_surfaced_for_refresh(self):
        client = self.client(error(401))
        with self.assertRaises(ApiError) as caught:
            self.get(client)
        self.assertEqual(caught.exception.status, 401)
        self.assertEqual(caught.exception.code, "unauthorized")
        self.assertNotIn("SYNTHETIC_SECRET", str(caught.exception))
        self.assertEqual(len(self.opener.calls), 1)

    def test_403_and_404_are_not_retried(self):
        for status, code in ((403, "forbidden"), (404, "not_found")):
            client = self.client(error(status))
            with self.assertRaises(ApiError) as caught:
                self.get(client)
            self.assertEqual(caught.exception.code, code)
            self.assertEqual(len(self.opener.calls), 1)

    def test_429_honors_retry_after_and_persists_block(self):
        states = []
        client = self.client(error(429, {"Retry-After": "3"}), Response([]), save_rate_state=states.append)
        self.assertEqual(self.get(client), [])
        self.assertEqual(self.clock.waits, [3])
        self.assertTrue(any(state.get("blocked_until") == 103 for state in states))

    def test_long_retry_returns_reset_without_sleeping(self):
        client = self.client(error(429, {"Retry-After": "3600"}))
        with self.assertRaises(ApiError) as caught:
            self.get(client)
        self.assertEqual(caught.exception.retry_at, 3700)
        self.assertEqual(self.clock.waits, [])

    def test_retry_after_http_date(self):
        client = self.client(error(429, {"Retry-After": "Thu, 01 Jan 1970 00:01:44 GMT"}), Response([]))
        self.get(client)
        self.assertEqual(self.clock.waits, [4])

    def test_rate_headers_read_and_overall(self):
        states = []
        client = self.client(Response([], {"X-RateLimit-Limit": "200,2000", "X-RateLimit-Usage": "8,12",
                             "X-ReadRateLimit-Limit": "100,1000", "X-ReadRateLimit-Usage": "7,11"}),
                             save_rate_state=states.append)
        self.get(client)
        self.assertEqual(states[-1]["read"]["usage"], [7, 11])
        self.assertEqual(states[-1]["overall"]["usage"], [8, 12])

    def test_preflight_read_limit_prevents_request(self):
        client = self.client(Response([], {"X-ReadRateLimit-Usage": "100,100"}))
        self.get(client)
        with self.assertRaises(ApiError) as caught:
            self.get(client)
        self.assertEqual(caught.exception.retry_at, 901)
        self.assertEqual(len(self.opener.calls), 1)

    def test_preflight_daily_limit_utc_reset(self):
        client = self.client(Response([], {"X-ReadRateLimit-Usage": "2,1000"}))
        self.get(client)
        with self.assertRaises(ApiError) as caught:
            self.get(client)
        self.assertEqual(caught.exception.retry_at, 86401)

    def test_short_reset_wait_and_rollover(self):
        client = self.client(Response([]))
        self.clock.value = 895
        client.rate_state["read"]["usage"] = [100, 10]
        self.get(client)
        self.assertEqual(self.clock.waits, [6])
        self.assertEqual(client.rate_state["read"]["usage"], [1, 11])

    def test_crash_reservation_persisted_before_io(self):
        states = []
        def interrupted(request, **kwargs):
            self.assertEqual(states[-1]["read"]["usage"], [1, 1])
            raise KeyboardInterrupt()
        clock = Clock()
        client = Transport(opener=interrupted, now=clock.now, sleep=clock.sleep, save_rate_state=states.append)
        with self.assertRaises(KeyboardInterrupt):
            self.get(client)

    def test_network_and_server_retries_bounded(self):
        client = self.client(urllib.error.URLError("SYNTHETIC_SECRET"), error(503), Response([]))
        self.assertEqual(self.get(client), [])
        self.assertEqual(self.clock.waits, [1, 2])
        client = self.client(error(503), error(503), max_retries=1)
        with self.assertRaises(ApiError):
            self.get(client)
        self.assertEqual(len(self.opener.calls), 2)

    def test_token_rotation_ambiguous_exchange_never_retried(self):
        for failure in (urllib.error.URLError("synthetic-refresh"), error(500)):
            client = self.client(failure)
            with self.assertRaises(ApiError) as caught:
                client.request("POST", "/oauth/token", form={"grant_type": "refresh_token",
                               "refresh_token": "synthetic-refresh"})
            self.assertEqual(caught.exception.code, "token_exchange_ambiguous")
            self.assertEqual(len(self.opener.calls), 1)

    def test_redirects_cannot_forward_credentials(self):
        client = self.client(error(302, {"Location": "https://example.invalid/collect"}))
        with self.assertRaises(ApiError) as caught:
            self.get(client)
        self.assertEqual(caught.exception.code, "redirect_refused")
        with self.assertRaises(ApiError):
            _NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.invalid/")

    def test_invalid_json_is_sanitized(self):
        client = self.client(Response(body=b"SYNTHETIC_SECRET"))
        with self.assertRaises(ApiError) as caught:
            self.get(client)
        self.assertEqual(caught.exception.code, "invalid_response")
        self.assertNotIn("SYNTHETIC_SECRET", str(caught.exception))

    def test_persistence_failure_prevents_network(self):
        def no_disk(state):
            raise OSError("synthetic disk failure")
        client = self.client(save_rate_state=no_disk)
        with self.assertRaises(OSError):
            self.get(client)
        self.assertEqual(self.opener.calls, [])


if __name__ == "__main__":
    unittest.main()
