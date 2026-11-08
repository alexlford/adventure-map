"""Local-only Strava OAuth. Never put secrets in arguments, environment or logs.

All callers must hold the private-directory process lock across token operations.
The one Keychain item is replaced atomically before refreshed tokens are used.
"""

from __future__ import annotations

import ctypes
import ctypes.util
import getpass
import hmac
import json
import math
import secrets
import sys
import time
import warnings
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlsplit

REQUIRED_SCOPE = "activity:read_all"
ALLOWED_SCOPES = {"read", REQUIRED_SCOPE}
SERVICE = b"com.alexlford.adventure-passport.private-strava-sync"
ACCOUNT = b"authenticated-athlete"


class AuthError(RuntimeError):
    """An intentionally sanitized error suitable for terminal output."""

    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


class KeychainStore:
    """Single non-file credential bundle in the user's default macOS Keychain.

    Native Security.framework calls keep passwords out of subprocess arguments.
    Keychain access controls may ask the user to unlock or approve Python access.
    No portable plaintext fallback is permitted.
    """

    NOT_FOUND = -25300

    def __init__(self):
        if sys.platform != "darwin":
            raise AuthError("macos-required", "Live authorization requires macOS Keychain on your Mac.")
        try:
            self.security = ctypes.CDLL(ctypes.util.find_library("Security"))
            self.cf = ctypes.CDLL(ctypes.util.find_library("CoreFoundation"))
        except (OSError, TypeError):
            raise AuthError("keychain-unavailable", "macOS Keychain is unavailable.") from None
        s = self.security
        s.SecKeychainFindGenericPassword.argtypes = [ctypes.c_void_p, ctypes.c_uint32,
            ctypes.c_char_p, ctypes.c_uint32, ctypes.c_char_p,
            ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_void_p),
            ctypes.POINTER(ctypes.c_void_p)]
        s.SecKeychainAddGenericPassword.argtypes = [ctypes.c_void_p, ctypes.c_uint32,
            ctypes.c_char_p, ctypes.c_uint32, ctypes.c_char_p, ctypes.c_uint32,
            ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
        s.SecKeychainItemModifyAttributesAndData.argtypes = [ctypes.c_void_p,
            ctypes.c_void_p, ctypes.c_uint32, ctypes.c_void_p]
        s.SecKeychainItemFreeContent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        s.SecKeychainItemDelete.argtypes = [ctypes.c_void_p]
        for name in ("SecKeychainFindGenericPassword", "SecKeychainAddGenericPassword",
                     "SecKeychainItemModifyAttributesAndData", "SecKeychainItemFreeContent",
                     "SecKeychainItemDelete"):
            getattr(s, name).restype = ctypes.c_int32
        self.cf.CFRelease.argtypes = [ctypes.c_void_p]
        self.cf.CFRelease.restype = None

    @staticmethod
    def _check(result):
        if result != 0:
            raise AuthError("keychain-failed", "Keychain access failed or was denied. Unlock your login Keychain and retry.")

    def _find(self, with_data=False):
        item = ctypes.c_void_p()
        length, data = ctypes.c_uint32(), ctypes.c_void_p()
        result = self.security.SecKeychainFindGenericPassword(None, len(SERVICE), SERVICE,
            len(ACCOUNT), ACCOUNT, ctypes.byref(length) if with_data else None,
            ctypes.byref(data) if with_data else None, ctypes.byref(item))
        if result == self.NOT_FOUND:
            return None, None
        self._check(result)
        raw = None
        if with_data:
            try:
                raw = ctypes.string_at(data, length.value)
            finally:
                self.security.SecKeychainItemFreeContent(None, data)
        return item, raw

    def load(self):
        item, raw = self._find(with_data=True)
        if item is None:
            return None
        try:
            try:
                value = json.loads(raw)
            except (ValueError, UnicodeError):
                raise AuthError("keychain-invalid", "Stored authorization is invalid. Reauthorize on your Mac.") from None
            validate_bundle(value)
            return value
        finally:
            self.cf.CFRelease(item)

    def save(self, bundle):
        validate_bundle(bundle)
        raw = json.dumps(bundle, separators=(",", ":")).encode("utf-8")
        item, _ = self._find()
        try:
            if item is not None:
                result = self.security.SecKeychainItemModifyAttributesAndData(item, None, len(raw), raw)
            else:
                result = self.security.SecKeychainAddGenericPassword(None, len(SERVICE), SERVICE,
                    len(ACCOUNT), ACCOUNT, len(raw), raw, None)
            self._check(result)
        finally:
            if item is not None:
                self.cf.CFRelease(item)

    def delete(self):
        item, _ = self._find()
        if item is None:
            return
        try:
            self._check(self.security.SecKeychainItemDelete(item))
        finally:
            self.cf.CFRelease(item)


def scopes(value):
    if isinstance(value, str):
        return set(value.replace(",", " ").split())
    if isinstance(value, list) and all(isinstance(x, str) for x in value):
        return set(value)
    return set()


def validate_scopes(value):
    granted = scopes(value)
    if REQUIRED_SCOPE not in granted:
        raise AuthError("missing-permission", "Private sync requires read access to all your activities. Reauthorize and approve the requested read permission.")
    if granted - ALLOWED_SCOPES:
        raise AuthError("excess-permission", "Unexpected authorization scopes. Revoke this application's access in Strava settings, then authorize read-only access again.")
    return sorted(granted)


def validate_bundle(bundle):
    if not isinstance(bundle, dict):
        raise AuthError("authorization-invalid", "Stored authorization is invalid. Reauthorize on your Mac.")
    for field in ("client_id", "client_secret", "access_token", "refresh_token", "athlete_id"):
        if not isinstance(bundle.get(field), str) or not bundle[field]:
            raise AuthError("authorization-invalid", "Stored authorization is incomplete. Reauthorize on your Mac.")
    if not bundle["client_id"].isdigit() or not bundle["athlete_id"].isdigit():
        raise AuthError("authorization-invalid", "Stored authorization identity is invalid. Reauthorize on your Mac.")
    expiry = bundle.get("expires_at")
    if not isinstance(expiry, (int, float)) or isinstance(expiry, bool) or not math.isfinite(expiry) or expiry <= 0:
        raise AuthError("authorization-invalid", "Stored token expiration is invalid. Reauthorize on your Mac.")
    validate_scopes(bundle.get("scopes"))


def _token_bundle(response, previous):
    if not isinstance(response, dict):
        raise AuthError("token-response-invalid", "Strava returned an invalid token response. Reauthorize if necessary.")
    if "token_type" in response and (not isinstance(response["token_type"], str) or response["token_type"].lower() != "bearer"):
        raise AuthError("token-response-invalid", "Strava returned an unsupported token type. Reauthorize if necessary.")
    bundle = dict(previous)
    for key in ("access_token", "refresh_token", "expires_at"):
        bundle[key] = response.get(key)
    if "scope" in response:
        bundle["scopes"] = validate_scopes(response["scope"])
    validate_bundle(bundle)
    return bundle


class TokenManager:
    def __init__(self, store, transport, now=time.time, control_store=None):
        self.store, self.transport, self.now = store, transport, now
        self.control_store = control_store

    def token(self, force_refresh=False):
        if self.control_store and self.control_store.load_control().get("authorization_uncertain"):
            raise AuthError("token-refresh-failed", "Authorization is uncertain. Reauthorize on your Mac before syncing again.")
        bundle = self.store.load()
        if not bundle:
            raise AuthError("not-authorized", "No authorization found. Run npm run strava:auth on your Mac.")
        validate_bundle(bundle)
        if not force_refresh and bundle["expires_at"] > self.now() + 60:
            return bundle["access_token"]
        # Persist before I/O so a crash or ambiguous exchange cannot cause a
        # later process to retry a potentially invalidated refresh token.
        if self.control_store:
            control = self.control_store.load_control()
            control["authorization_uncertain"] = True
            self.control_store.save_control(control)
        try:
            response = self.transport.request("POST", "/oauth/token", form={
                "client_id": bundle["client_id"], "client_secret": bundle["client_secret"],
                "grant_type": "refresh_token", "refresh_token": bundle["refresh_token"],
            })
            updated = _token_bundle(response, bundle)
        except Exception:
            # Invalid grant, revocation and ambiguous network failures share the
            # same fail-closed path. Never retry an old rotating refresh token.
            raise AuthError("token-refresh-failed", "Authorization refresh failed. Stop and reauthorize on your Mac before syncing again; no old refresh token was retried.") from None
        # A rotating refresh token invalidates its predecessor immediately. Do not
        # return or use the access token unless the new bundle is safely stored.
        try:
            self.store.save(updated)
        except Exception:
            raise AuthError("rotation-storage-failed", "Refreshed authorization could not be saved. Stop and reauthorize before syncing; do not retry with the old refresh token.") from None
        if self.control_store:
            control = self.control_store.load_control()
            control.pop("authorization_uncertain", None)
            self.control_store.save_control(control)
        return updated["access_token"]


def parse_callback(target, expected_state):
    """Return (code, scopes), with no values reflected in errors or browser HTML."""
    parsed = urlsplit(target)
    if parsed.path != "/callback" or parsed.scheme or parsed.netloc:
        raise AuthError("callback-path", "Unexpected authorization callback path.")
    try:
        params = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=8)
    except ValueError:
        raise AuthError("callback-invalid", "Invalid authorization callback.") from None
    supplied = params.get("state", [])
    if len(supplied) != 1 or not hmac.compare_digest(supplied[0].encode("utf-8"), expected_state.encode("utf-8")):
        raise AuthError("invalid-state", "Authorization state verification failed. Run authorization again.")
    if "error" in params:
        raise AuthError("access-denied", "Strava authorization was declined. No credentials were stored.")
    code = params.get("code", [])
    scope = params.get("scope", [])
    if len(code) != 1 or not code[0] or len(scope) != 1:
        raise AuthError("callback-invalid", "Authorization callback is incomplete. Run authorization again.")
    return code[0], validate_scopes(scope[0])


def wait_for_callback(state, browser_url, browser_open=webbrowser.open, timeout=180):
    result = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Default access logging would expose the authorization code.

        def do_GET(self):
            if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
                self.send_error(400, "Invalid callback host")
                return
            if urlsplit(self.path).path != "/callback":
                self.send_error(404, "Not found")
                return
            try:
                result["value"] = parse_callback(self.path, state)
                body, status = b"Authorization received. Return to your terminal and close this tab.", 200
            except AuthError as exc:
                result["error"] = exc
                body, status = b"Authorization could not be verified. Return to your terminal.", 400
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    class CallbackServer(HTTPServer):
        def get_request(self):
            connection, address = super().get_request()
            connection.settimeout(3)
            return connection, address

        def handle_error(self, *_args):
            # Never print a request, traceback or callback URL.
            result["error"] = AuthError("callback-connection", "The local callback connection failed. Run authorization again.")

    with CallbackServer(("127.0.0.1", 0), Handler) as server:
        server.timeout = 0.5
        redirect = f"http://127.0.0.1:{server.server_port}/callback"
        if not browser_open(browser_url(redirect)):
            raise AuthError("browser-unavailable", "Could not open your browser. Set a default browser on your Mac and retry.")
        deadline = time.monotonic() + timeout
        while not result and time.monotonic() < deadline:
            server.handle_request()
    if "error" in result:
        raise result["error"]
    if "value" not in result:
        raise AuthError("callback-timeout", "Authorization timed out. Run authorization again when ready to approve in your browser.")
    return result["value"]


def authorize(store, transport, browser_open=webbrowser.open, credentials=None, timeout=180):
    previous = store.load()
    if credentials is None:
        if not sys.stdin.isatty():
            raise AuthError("terminal-required", "Authorization requires your interactive Mac terminal; do not supply credentials through chat, files or environment variables.")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", getpass.GetPassWarning)
                credentials = (getpass.getpass("Strava application client ID (hidden): ").strip(),
                               getpass.getpass("Strava application client secret (hidden): ").strip())
        except getpass.GetPassWarning:
            raise AuthError("secure-input-unavailable", "Hidden credential entry is unavailable. Use an interactive terminal on your Mac.") from None
    client_id, client_secret = credentials
    if not isinstance(client_id, str) or not client_id.isdigit() or not client_secret:
        raise AuthError("client-invalid", "Enter a numeric application client ID and a nonempty client secret.")
    state = secrets.token_urlsafe(32)

    def url(redirect):
        return "https://www.strava.com/oauth/authorize?" + urlencode({
            "client_id": client_id, "redirect_uri": redirect, "response_type": "code",
            "approval_prompt": "force", "scope": REQUIRED_SCOPE, "state": state,
        })

    code, granted = wait_for_callback(state, url, browser_open, timeout)
    response = transport.request("POST", "/oauth/token", form={
        "client_id": client_id, "client_secret": client_secret,
        "code": code, "grant_type": "authorization_code",
    })
    athlete = response.get("athlete") if isinstance(response, dict) else None
    athlete_id = str(athlete.get("id", "")) if isinstance(athlete, dict) else ""
    bundle = _token_bundle(response, {"client_id": client_id, "client_secret": client_secret,
        "athlete_id": athlete_id, "scopes": granted})
    if previous and previous["athlete_id"] != athlete_id:
        # Do not replace another athlete's credentials or mix private caches.
        try:
            _revoke(bundle, transport)
        finally:
            raise AuthError("athlete-mismatch", "The approved Strava account differs from the connected athlete. Existing authorization was preserved. Disconnect and erase the private cache before connecting a different account.") from None
    store.save(bundle)
    return {"authorized": True, "readOnly": True}


def _revoke(bundle, transport):
    transport.request("POST", "/oauth/revoke", form={
        "token": bundle["refresh_token"], "token_type_hint": "refresh_token",
    }, basic=(bundle["client_id"], bundle["client_secret"]))


def disconnect(store, transport):
    bundle = store.load()
    if bundle:
        _revoke(bundle, transport)
    # Keep credentials on revocation failure so the user can retry. CLI erases
    # private API cache after successful revocation and local Keychain deletion.
    store.delete()


def status(store, now=time.time):
    bundle = store.load()
    if not bundle:
        return {"authorized": False}
    validate_bundle(bundle)
    return {"authorized": True, "readOnly": True,
        "accessTokenExpired": bundle["expires_at"] <= now() + 60,
        "refreshOnNextRequest": bundle["expires_at"] <= now() + 60}
