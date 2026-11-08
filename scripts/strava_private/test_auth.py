"""Entirely invented tokens/IDs; no network other than a synthetic loopback callback."""

import copy
import ctypes
import io
import json
import threading
import unittest
from contextlib import redirect_stderr
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import urlopen

from .auth import (AuthError, KeychainStore, TokenManager, authorize, disconnect,
                                parse_callback, status, wait_for_callback)


def bundle():
    return {"client_id": "123", "client_secret": "synthetic-client-secret",
        "athlete_id": "42", "access_token": "synthetic-access",
        "refresh_token": "synthetic-refresh", "expires_at": 1000,
        "scopes": ["activity:read_all"]}


class MemoryStore:
    def __init__(self, value=None):
        self.value = copy.deepcopy(value)
        self.saves = []
        self.fail_save = False

    def load(self):
        return copy.deepcopy(self.value)

    def save(self, value):
        if self.fail_save:
            raise OSError("synthetic storage failure")
        self.value = copy.deepcopy(value)
        self.saves.append(copy.deepcopy(value))

    def delete(self):
        self.value = None


class FakeTransport:
    def __init__(self, response=None, fail=False):
        self.response = response
        self.fail = fail
        self.calls = []

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if self.fail:
            raise RuntimeError("synthetic transport error")
        return copy.deepcopy(self.response)


class OAuthTests(unittest.TestCase):
    def test_native_keychain_adapter_atomic_bundle_and_errors(self):
        class Function:
            def __init__(self, callback):
                self.callback = callback
            def __call__(self, *args):
                return self.callback(*args)

        class Native:
            def __init__(self):
                self.raw = json.dumps(bundle()).encode()
                self.buffer = ctypes.create_string_buffer(self.raw)
                self.writes = []
                self.error = 0
                self.releases = 0
                self.deleted = False
                self.SecKeychainFindGenericPassword = Function(self.find)
                self.SecKeychainAddGenericPassword = Function(self.add)
                self.SecKeychainItemModifyAttributesAndData = Function(self.modify)
                self.SecKeychainItemFreeContent = Function(lambda *_: 0)
                self.SecKeychainItemDelete = Function(self.delete)
                self.CFRelease = Function(self.release)
            def find(self, _keychain, _service_len, _service, _account_len, _account, length, data, item):
                if self.deleted:
                    return -25300
                ctypes.cast(item, ctypes.POINTER(ctypes.c_void_p))[0] = 100
                if length is not None:
                    ctypes.cast(length, ctypes.POINTER(ctypes.c_uint32))[0] = len(self.raw)
                    ctypes.cast(data, ctypes.POINTER(ctypes.c_void_p))[0] = ctypes.addressof(self.buffer)
                return 0
            def modify(self, _item, attributes, length, raw):
                self.writes.append(json.loads(ctypes.string_at(raw, length)))
                return self.error
            def add(self, *_args):
                raise AssertionError("Existing bundle must be atomically replaced")
            def delete(self, _item):
                self.deleted = True
                return 0
            def release(self, _item):
                self.releases += 1

        native = Native()
        with patch(__package__ + ".auth.sys.platform", "darwin"), \
             patch(__package__ + ".auth.ctypes.util.find_library", return_value="synthetic-library"), \
             patch(__package__ + ".auth.ctypes.CDLL", return_value=native):
            store = KeychainStore()
        self.assertEqual(store.load(), bundle())
        updated = bundle()
        updated["refresh_token"] = "synthetic-rotated-refresh"
        store.save(updated)
        self.assertEqual(native.writes, [updated])
        native.error = -1
        with self.assertRaises(AuthError) as error:
            store.save(updated)
        self.assertNotIn("synthetic-rotated-refresh", str(error.exception))
        store.delete()
        self.assertIsNone(store.load())
        self.assertEqual(native.releases, 4)

    def test_successful_callback(self):
        self.assertEqual(parse_callback("/callback?state=synthetic-state&code=synthetic-code&scope=activity:read_all", "synthetic-state"),
                         ("synthetic-code", ["activity:read_all"]))

    def test_invalid_and_duplicate_state(self):
        for target in ("/callback?state=wrong&code=synthetic-code&scope=activity:read_all",
                       "/callback?state=%C3%A9&code=synthetic-code&scope=activity:read_all",
                       "/callback?state=good&state=good&code=synthetic-code&scope=activity:read_all",
                       "/callback?code=synthetic-code&scope=activity:read_all"):
            with self.assertRaises(AuthError) as error:
                parse_callback(target, "good")
            self.assertEqual(error.exception.code, "invalid-state")
            self.assertNotIn("synthetic-code", str(error.exception))

    def test_callback_missing_permissions_and_write(self):
        for scope in ("read", "activity:read", "activity:read_all,activity:write",
                      "activity:read_all,profile:read_all"):
            with self.assertRaises(AuthError):
                parse_callback("/callback?" + urlencode({"state": "good", "code": "synthetic-code", "scope": scope}), "good")

    def test_declined_and_incomplete(self):
        for query in ("state=good&error=access_denied", "state=good&code=synthetic-code", "state=good&code=&scope=activity:read_all"):
            with self.assertRaises(AuthError):
                parse_callback("/callback?" + query, "good")

    def test_browser_callback_local_only_and_no_log(self):
        capture = io.StringIO()
        results = []
        workers = []

        def open_synthetic_browser(url):
            parsed = urlsplit(url)
            self.assertEqual(parsed.hostname, "127.0.0.1")
            self.assertEqual(parsed.path, "/callback")
            def send():
                with urlopen(url + "?state=synthetic-state&code=synthetic-code&scope=activity:read_all", timeout=5) as response:
                    results.append((response.status, response.headers, response.read()))
            worker = threading.Thread(target=send)
            worker.start()
            workers.append(worker)
            return True

        with redirect_stderr(capture):
            result = wait_for_callback("synthetic-state", lambda redirect: redirect, open_synthetic_browser, timeout=5)
        for worker in workers:
            worker.join(timeout=5)
        self.assertEqual(result[0], "synthetic-code")
        self.assertEqual(results[0][0], 200)
        self.assertEqual(results[0][1]["Cache-Control"], "no-store")
        self.assertNotIn(b"synthetic-code", results[0][2])
        self.assertEqual(capture.getvalue(), "")

    def test_browser_unavailable_and_timeout(self):
        with self.assertRaises(AuthError) as error:
            wait_for_callback("state", lambda x: x, lambda _: False)
        self.assertEqual(error.exception.code, "browser-unavailable")
        with self.assertRaises(AuthError) as error:
            wait_for_callback("state", lambda x: x, lambda _: True, timeout=0)
        self.assertEqual(error.exception.code, "callback-timeout")

    def test_authorization_uses_minimum_scopes_and_stores_bundle(self):
        store = MemoryStore()
        transport = FakeTransport({"athlete": {"id": 42}, "access_token": "synthetic-new-access",
            "refresh_token": "synthetic-new-refresh", "expires_at": 9000})

        def callback(state, make_url, *_args):
            url = make_url("http://127.0.0.1:12345/callback")
            parsed = urlsplit(url)
            params = parse_qs(parsed.query)
            self.assertEqual(parsed.netloc, "www.strava.com")
            self.assertEqual(params["scope"], ["activity:read_all"])
            self.assertEqual(params["approval_prompt"], ["force"])
            self.assertEqual(params["state"], [state])
            self.assertNotIn("secret", params)
            return "synthetic-code", ["activity:read_all"]

        with patch(__package__ + ".auth.wait_for_callback", side_effect=callback):
            self.assertEqual(authorize(store, transport, credentials=("123", "synthetic-client-secret")),
                             {"authorized": True, "readOnly": True})
        self.assertEqual(store.value["athlete_id"], "42")
        self.assertEqual(store.value["refresh_token"], "synthetic-new-refresh")
        self.assertEqual(transport.calls[0][2]["form"]["grant_type"], "authorization_code")

    def test_reauthorization_refuses_different_athlete(self):
        store = MemoryStore(bundle())
        transport = FakeTransport({"athlete": {"id": 99}, "access_token": "synthetic-other-access",
            "refresh_token": "synthetic-other-refresh", "expires_at": 9000})
        with patch(__package__ + ".auth.wait_for_callback", return_value=("synthetic-code", ["activity:read_all"])):
            with self.assertRaises(AuthError) as error:
                authorize(store, transport, credentials=("123", "synthetic-client-secret"))
        self.assertEqual(error.exception.code, "athlete-mismatch")
        self.assertEqual(store.value, bundle())
        self.assertEqual(transport.calls[-1][1], "/oauth/revoke")

    def test_unexpired_token_no_network(self):
        store, transport = MemoryStore(bundle()), FakeTransport()
        self.assertEqual(TokenManager(store, transport, now=lambda: 100).token(), "synthetic-access")
        self.assertEqual(transport.calls, [])

    def test_expiration_and_refresh_rotation(self):
        store = MemoryStore(bundle())
        transport = FakeTransport({"access_token": "synthetic-rotated-access", "refresh_token": "synthetic-rotated-refresh", "expires_at": 9000})
        manager = TokenManager(store, transport, now=lambda: 1100)
        self.assertEqual(manager.token(), "synthetic-rotated-access")
        self.assertEqual(store.value["refresh_token"], "synthetic-rotated-refresh")
        self.assertEqual(len(store.saves), 1)
        manager.token(force_refresh=True)
        self.assertEqual(transport.calls[-1][2]["form"]["refresh_token"], "synthetic-rotated-refresh")

    def test_rotation_storage_failure_is_fatal(self):
        store = MemoryStore(bundle())
        store.fail_save = True
        transport = FakeTransport({"access_token": "synthetic-rotated-access", "refresh_token": "synthetic-rotated-refresh", "expires_at": 9000})
        with self.assertRaises(AuthError) as error:
            TokenManager(store, transport, now=lambda: 1100).token()
        self.assertEqual(error.exception.code, "rotation-storage-failed")
        self.assertEqual(store.value, bundle())
        self.assertNotIn("synthetic-rotated-refresh", str(error.exception))

    def test_refresh_failure_requires_reauthorization_without_retry(self):
        store, transport = MemoryStore(bundle()), FakeTransport(fail=True)
        with self.assertRaises(AuthError) as error:
            TokenManager(store, transport, now=lambda: 1100).token()
        self.assertEqual(error.exception.code, "token-refresh-failed")
        self.assertEqual(len(transport.calls), 1)
        self.assertEqual(store.value, bundle())

    def test_bad_token_response_never_saved(self):
        for response in ({"access_token": "synthetic-new-access", "expires_at": 9000},
                         {"access_token": "synthetic-new-access", "refresh_token": "synthetic-new-refresh", "expires_at": 0},
                         {"access_token": "synthetic-new-access", "refresh_token": "synthetic-new-refresh", "expires_at": float("nan")},
                         {"access_token": "synthetic-new-access", "refresh_token": "synthetic-new-refresh", "expires_at": 9000, "scope": "activity:write"}):
            store = MemoryStore(bundle())
            with self.assertRaises(AuthError):
                TokenManager(store, FakeTransport(response), now=lambda: 1100).token()
            self.assertEqual(store.saves, [])

    def test_status_has_no_identifiers_tokens_or_network(self):
        result = status(MemoryStore(bundle()), now=lambda: 1100)
        self.assertEqual(result, {"authorized": True, "readOnly": True, "accessTokenExpired": True, "refreshOnNextRequest": True})
        self.assertEqual(status(MemoryStore()), {"authorized": False})

    def test_disconnect_revoke_and_delete(self):
        store, transport = MemoryStore(bundle()), FakeTransport()
        disconnect(store, transport)
        self.assertIsNone(store.value)
        self.assertEqual(transport.calls[0][1], "/oauth/revoke")
        self.assertEqual(transport.calls[0][2]["form"]["token_type_hint"], "refresh_token")
        self.assertEqual(transport.calls[0][2]["basic"], ("123", "synthetic-client-secret"))

    def test_disconnect_failure_preserves_retry_credentials(self):
        store = MemoryStore(bundle())
        with self.assertRaises(RuntimeError):
            disconnect(store, FakeTransport(fail=True))
        self.assertEqual(store.value, bundle())

    def test_missing_authorization(self):
        with self.assertRaises(AuthError) as error:
            TokenManager(MemoryStore(), FakeTransport()).token()
        self.assertEqual(error.exception.code, "not-authorized")


if __name__ == "__main__":
    unittest.main()
