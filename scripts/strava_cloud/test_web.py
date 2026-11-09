"""Entirely synthetic WSGI/OAuth security tests; no cloud or private data I/O."""

import base64
import copy
import io
import json
import re
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from http.cookies import SimpleCookie
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit

from .web import (CACHE_TTL, CSRF_COOKIE, IAP_CERTS, IAP_ISSUER, OAUTH_COOKIE,
                  GoogleIAPVerifier, Refused, create_app)

CONFIG = {"OWNER_EMAIL": "owner@example.test", "IAP_AUDIENCE": "/projects/123/locations/test/services/private",
          "OAUTH_CALLBACK_URL": "https://private.example.test/oauth/callback"}
ORIGIN = "https://private.example.test"


class Clock:
    value = 1800000000

    def __call__(self):
        return self.value


class State:
    def __init__(self, clock):
        self.clock = clock
        self.states = {}

    def issue_oauth_state(self, digest, expires_at):
        self.states[digest] = expires_at

    def consume_oauth_state(self, digest):
        return self.states.pop(digest, 0) > self.clock()


class Runtime:
    def __init__(self, clock):
        self.store = SimpleNamespace(state=State(clock))
        self.client_id = "12345"
        self.exchange_calls = []
        self.setup_calls = []
        self.snapshot = None
        self.revocation = {"remoteRevoked": True, "localRevoked": True, "localCleared": True}
        self.revoke_calls = 0
        self.fail = None

    def oauth_client_id(self):
        return self.client_id

    def setup_client(self, client_id, client_secret):
        if self.fail:
            raise RuntimeError(self.fail)
        self.setup_calls.append((client_id, client_secret))
        self.client_id = client_id

    def exchange_code(self, code, granted_scopes, callback_uri):
        self.exchange_calls.append((code, granted_scopes, callback_uri))
        if self.fail:
            raise RuntimeError(self.fail)

    def review_snapshot(self):
        return copy.deepcopy(self.snapshot)

    def revoke(self):
        self.revoke_calls += 1
        self.snapshot = None
        return self.revocation


class WebTest(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.runtime = Runtime(self.clock)
        self.claims = {"iss": IAP_ISSUER, "aud": CONFIG["IAP_AUDIENCE"], "sub": "google:synthetic-owner",
                       "email": CONFIG["OWNER_EMAIL"], "iat": self.clock() - 10, "exp": self.clock() + 590}
        self.verified_calls = []

        def verifier(token, audience):
            self.verified_calls.append((token, audience))
            if token != "synthetic-signed-token":
                raise Refused()
            return dict(self.claims)

        self.app = create_app(self.runtime, CONFIG, verifier, self.clock)
        self.cookies = {}

    def call(self, path="/", method="GET", form=None, authenticated=True, headers=None, query=None):
        parsed = urlsplit(path)
        body = urlencode(form or {}).encode() if form is not None else b""
        environ = {"PATH_INFO": parsed.path, "QUERY_STRING": query if query is not None else parsed.query,
                   "REQUEST_METHOD": method, "wsgi.input": io.BytesIO(body), "CONTENT_LENGTH": str(len(body)),
                   "CONTENT_TYPE": "application/x-www-form-urlencoded", "HTTP_ORIGIN": ORIGIN,
                   "HTTP_HOST": "attacker.example.test", "wsgi.url_scheme": "http",
                   "HTTP_COOKIE": "; ".join(f"{key}={value}" for key, value in self.cookies.items())}
        if authenticated:
            environ["HTTP_X_GOOG_IAP_JWT_ASSERTION"] = "synthetic-signed-token"
        environ.update(headers or {})
        result = {}

        def start(status, response_headers):
            result["status"] = int(status.split()[0])
            result["headers"] = response_headers
            for key, value in response_headers:
                if key == "Set-Cookie":
                    cookie = SimpleCookie()
                    cookie.load(value)
                    for name, morsel in cookie.items():
                        if morsel["max-age"] == "0":
                            self.cookies.pop(name, None)
                        else:
                            self.cookies[name] = morsel.value

        output = io.StringIO()
        with redirect_stdout(output), redirect_stderr(output):
            result["body"] = b"".join(self.app(environ, start)).decode()
        self.assertEqual(output.getvalue(), "", "App must not log private input or exceptions")
        result["header_map"] = dict(result["headers"])
        return result

    def csrf(self):
        page = self.call()
        self.assertEqual(page["status"], 200)
        return re.search(r'name="csrf" value="([^"]+)"', page["body"])[1]

    def oauth(self):
        response = self.call("/oauth/start", "POST", {"csrf": self.csrf()})
        self.assertEqual(response["status"], 303)
        target = urlsplit(response["header_map"]["Location"])
        self.assertEqual(target.scheme + "://" + target.netloc + target.path, "https://www.strava.com/oauth/authorize")
        params = parse_qs(target.query)
        self.assertEqual(params["scope"], ["activity:read_all"])
        self.assertEqual(params["redirect_uri"], [CONFIG["OAUTH_CALLBACK_URL"]])
        self.assertEqual(params["approval_prompt"], ["force"])
        return params["state"][0]

    def callback(self, state, **values):
        params = {"state": state, "code": "synthetic-authorization-code", "scope": "read,activity:read_all"}
        params.update(values)
        return self.call("/oauth/callback", query=urlencode(params))

    def synthetic_review(self):
        self.runtime.snapshot = {"created_at": self.clock() - 20, "expires_at": self.clock() + 100,
                                 "payload": {"queue": {"candidates": [{
                                     "name": '<script>syntheticAttack()</script>', "description": '<img src=x onerror="attack()">',
                                     "activityLocalDateTime": "2027-01-01T12:00:00", "activityType": "Run",
                                     "distanceKm": 2, "sourceAttribution": {"device": '<svg onload="attack()">'},
                                     "gpsReview": {"mappedRecordedDistanceM": 1500, "recordedActivityDistanceM": 2000,
                                         "distanceDifferencePercent": -25, "validPointCount": 3, "sourcePointCount": 4,
                                         "flags": [{"reason": "duplicate-geometry-review"},
                                                   {"reason": "recorded-geometry-shortened"},
                                                   {"reason": '<script>badflag()</script>'}], "segments": [
                                         {"evidenceType": "recorded", "coordinatesLatLng": [[10, 20], [10.1, 20.1]]},
                                         {"evidenceType": "inferred", "coordinatesLatLng": [[11, 21], [12, 22]]},
                                         {"evidenceType": "recorded", "coordinatesLatLng": [[10.2, 20.2]]},
                                     ]}}]}}}

    def test_health_content_free_without_identity_or_runtime(self):
        app = create_app(None, CONFIG, now=self.clock)
        with patch.object(app, "_runtime", side_effect=AssertionError("must not initialize")):
            old, self.app = self.app, app
            response = self.call("/healthz", authenticated=False)
            self.app = old
        self.assertEqual(response["status"], 204)
        self.assertEqual(response["body"], "")

    def test_spoofed_unsigned_headers_cannot_authenticate(self):
        response = self.call(authenticated=False, headers={"HTTP_X_GOOG_AUTHENTICATED_USER_EMAIL": "accounts.google.com:owner@example.test"})
        self.assertEqual(response["status"], 403)
        self.assertEqual(self.verified_calls, [])
        self.assertEqual(self.call(headers={"HTTP_X_GOOG_IAP_JWT_ASSERTION": "forged"})["status"], 403)

    def test_wrong_owner_audience_issuer_expiry_or_subject_refused(self):
        original = dict(self.claims)
        for change in ({"email": "intruder@example.test"}, {"aud": "other-audience"}, {"iss": "untrusted"},
                       {"exp": self.clock()}, {"iat": self.clock() + 100}, {"sub": ""},
                       {"exp": self.clock() + 1000}, {"email_verified": False}, {"email_verified": "true"}):
            with self.subTest(change=change):
                self.claims = {**original, **change}
                self.assertEqual(self.call()["status"], 403)
        self.claims = original
        self.assertEqual(self.call()["status"], 200, "Documented IAP claims need no invented email_verified claim")

    def test_all_owner_views_static_and_unknown_routes_are_protected(self):
        for path in ("/", "/review", "/static/review.css", "/static/review.js", "/oauth/callback", "/missing"):
            self.assertEqual(self.call(path, authenticated=False)["status"], 403)

    def test_callback_uses_fixed_https_uri_and_one_use_owner_bound_state(self):
        state = self.oauth()
        original_cookie = self.cookies[OAUTH_COOKIE]
        response = self.callback(state)
        self.assertEqual(response["header_map"]["Location"], ORIGIN + "/?notice=connected")
        self.assertEqual(self.runtime.exchange_calls, [("synthetic-authorization-code", ["activity:read_all", "read"], CONFIG["OAUTH_CALLBACK_URL"])])
        self.assertNotIn("synthetic-authorization-code", str(response))
        self.cookies[OAUTH_COOKIE] = original_cookie
        self.assertIn("authorization-failed", self.callback(state)["header_map"]["Location"])
        self.assertEqual(len(self.runtime.exchange_calls), 1)

    def test_state_is_only_digest_in_persistent_store(self):
        state = self.oauth()
        self.assertEqual(len(state), 43)
        for digest in self.runtime.store.state.states:
            self.assertRegex(digest, r"^[a-f0-9]{64}$")
            self.assertNotIn(state, digest)

    def test_refreshing_pages_retires_replaced_browser_state(self):
        for _ in range(12):
            self.csrf()
        self.assertEqual(len(self.runtime.store.state.states), 1)
        for _ in range(12):
            self.oauth()
        self.assertEqual(len(self.runtime.store.state.states), 1)

    def test_callback_missing_cookie_mismatch_state_and_different_owner_refused(self):
        for kind in ("missing-cookie", "wrong-state", "different-owner"):
            with self.subTest(kind=kind):
                state = self.oauth()
                if kind == "missing-cookie":
                    self.cookies.pop(OAUTH_COOKIE)
                elif kind == "wrong-state":
                    state = "A" * 43
                else:
                    self.claims["sub"] = "google:other-owner-subject"
                self.assertIn("authorization-failed", self.callback(state)["header_map"]["Location"])
                self.assertFalse(self.runtime.exchange_calls)
                self.claims["sub"] = "google:synthetic-owner"

    def test_expired_state_refused_even_with_valid_identity_and_cookie(self):
        state = self.oauth()
        self.clock.value += 601
        self.claims.update(iat=self.clock() - 10, exp=self.clock() + 590)
        self.assertIn("authorization-failed", self.callback(state)["header_map"]["Location"])
        self.assertFalse(self.runtime.exchange_calls)

    def test_callback_denial_and_excess_or_missing_permissions_consume_state(self):
        for values in ({"error": "access_denied"}, {"scope": "read"},
                       {"scope": "read,activity:read_all,activity:write"}, {"code": ""}):
            state = self.oauth()
            self.assertIn("authorization-failed", self.callback(state, **values)["header_map"]["Location"])
            self.assertFalse(self.runtime.exchange_calls)

    def test_callback_duplicate_parameters_refused(self):
        state = self.oauth()
        response = self.call("/oauth/callback", query=urlencode({"state": state, "code": "one", "scope": "activity:read_all"}) + "&code=two")
        self.assertIn("authorization-failed", response["header_map"]["Location"])
        self.assertFalse(self.runtime.exchange_calls)

    def test_oauth_post_ambiguous_failure_is_not_retried_and_no_detail_leaks(self):
        state = self.oauth()
        self.runtime.fail = "secret synthetic-token private-response-body"
        response = self.callback(state)
        self.assertIn("authorization-failed", response["header_map"]["Location"])
        self.assertEqual(len(self.runtime.exchange_calls), 1)
        self.assertNotIn(self.runtime.fail, str(response))

    def test_state_and_csrf_cookies_have_required_browser_attributes(self):
        for response in (self.call(), self.call("/oauth/start", "POST", {"csrf": self.csrf()})):
            for key, value in response["headers"]:
                if key == "Set-Cookie":
                    self.assertIn("Secure", value)
                    self.assertIn("HttpOnly", value)
                    self.assertIn("Path=/", value)
                    self.assertIn("SameSite=", value)
                    self.assertNotIn("Domain=", value)

    def test_mutations_require_post_single_use_csrf_and_matching_origin(self):
        for path in ("/setup", "/oauth/start", "/revoke"):
            self.assertEqual(self.call(path)["status"], 405)
            self.assertEqual(self.call(path, "POST", {})["status"], 400)
        csrf = self.csrf()
        self.assertEqual(self.call("/revoke", "POST", {"csrf": csrf}, headers={"HTTP_ORIGIN": "https://attacker.example.test"})["status"], 400)
        self.assertEqual(self.runtime.revoke_calls, 0)
        self.assertEqual(self.call("/revoke", "POST", {"csrf": csrf})["status"], 303)
        self.cookies[CSRF_COOKIE] = csrf
        self.assertEqual(self.call("/revoke", "POST", {"csrf": csrf})["status"], 400)
        self.assertEqual(self.runtime.revoke_calls, 1)

    def test_initial_app_setup_secret_is_never_returned(self):
        self.runtime.client_id = None
        csrf = self.csrf()
        secret = "synthetic-secret-never-render"
        response = self.call("/setup", "POST", {"csrf": csrf, "client_id": "98765", "client_secret": secret})
        self.assertEqual(response["status"], 303)
        self.assertEqual(self.runtime.setup_calls, [("98765", secret)])
        self.assertNotIn(secret, str(response))
        self.assertNotIn(secret, self.call()["body"])
        self.assertNotIn("Strava password<input", self.call()["body"])

    def test_backend_exceptions_and_secrets_are_fixed_safe_errors(self):
        csrf = self.csrf()
        self.runtime.fail = "private synthetic-secret <script>"
        response = self.call("/setup", "POST", {"csrf": csrf, "client_id": "12345", "client_secret": "synthetic-secret"})
        self.assertEqual(response["status"], 503)
        self.assertNotIn(self.runtime.fail, str(response))
        self.assertNotIn("synthetic-secret", str(response))

    def test_review_escapes_all_metadata_no_external_services_and_preserves_gaps(self):
        self.synthetic_review()
        response = self.call("/review")
        self.assertEqual(response["status"], 200)
        self.assertIn("&lt;script&gt;syntheticAttack()&lt;/script&gt;", response["body"])
        self.assertIn("&lt;img src=x onerror=", response["body"])
        self.assertIn("&lt;svg onload=", response["body"])
        self.assertNotIn("<script>syntheticAttack", response["body"])
        self.assertEqual(response["body"].count("<polyline "), 1)
        self.assertEqual(response["body"].count("<circle "), 1)
        self.assertIn("maximum 48 hours", response["body"])
        self.assertIn("Activity data from Strava", response["body"])
        self.assertIn("temporary review has matching geometry", response["body"])
        self.assertIn("shorter than the previous temporary observation", response["body"])
        self.assertIn("Recorded segment distance (m)</dt><dd>1500", response["body"])
        self.assertIn("Distance difference (%)</dt><dd>-25", response["body"])
        self.assertIn("Route privacy and visibility completeness are unknown", response["body"])
        self.assertIn("&lt;script&gt;badflag()&lt;/script&gt;", response["body"])
        self.assertNotRegex(response["body"], r'(?:src|href)="https?://')

    def test_expired_missing_or_overlong_cache_is_never_rendered(self):
        for change in ({"expires_at": self.clock()}, {"expires_at": self.clock() + CACHE_TTL + 1},
                       {"created_at": None}, {"created_at": self.clock() + 1}):
            self.synthetic_review()
            self.runtime.snapshot.update(change)
            response = self.call("/review")
            self.assertEqual(response["status"], 200)
            self.assertNotIn("syntheticAttack", response["body"])
            self.assertIn("No unexpired review", response["body"])

    def test_revocation_distinguishes_remote_unverified_and_erases_view(self):
        self.synthetic_review()
        self.runtime.revocation = {"localRevoked": True, "localCleared": True, "remoteRevoked": False}
        response = self.call("/revoke", "POST", {"csrf": self.csrf()})
        self.assertIn("revocation-unverified", response["header_map"]["Location"])
        page = self.call("/?notice=revocation-unverified")
        self.assertIn("Remote revocation is unverified", page["body"])
        self.assertNotIn("syntheticAttack", self.call("/review")["body"])

    def test_unconfirmed_cleanup_never_claims_physical_deletion(self):
        self.runtime.revocation = {"localRevoked": True, "localCleared": False, "remoteRevoked": False}
        response = self.call("/revoke", "POST", {"csrf": self.csrf()})
        self.assertIn("cleanup-pending", response["header_map"]["Location"])
        page = self.call("/?notice=cleanup-pending")
        self.assertIn("Physical deletion could not be confirmed", page["body"])
        self.assertNotIn("temporary data was erased", page["body"])

    def test_security_headers_and_content_free_head(self):
        self.synthetic_review()
        response = self.call("/review")
        for header, value in {"Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer",
                              "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY"}.items():
            self.assertEqual(response["header_map"][header], value)
        self.assertIn("default-src 'none'", response["header_map"]["Content-Security-Policy"])
        self.assertIn("connect-src 'none'", response["header_map"]["Content-Security-Policy"])
        self.assertEqual(self.call("/review", "HEAD")["body"], "")

    def test_insecure_or_ambiguous_callback_configuration_refused(self):
        for url in ("http://private.example.test/oauth/callback", "https://private.example.test/callback",
                    "https://user:pass@private.example.test/oauth/callback", "https://private.example.test/oauth/callback?x=1",
                    "https://private.example.test:444/oauth/callback", "https://private.example.test/oauth/callback#fragment"):
            with self.assertRaises(ValueError):
                create_app(self.runtime, {**CONFIG, "OAUTH_CALLBACK_URL": url}, now=self.clock)

    def test_google_verifier_rejects_untrusted_algorithm_before_sdk(self):
        for algorithm in ("none", "HS256", "RS256"):
            header = base64.urlsafe_b64encode(json.dumps({"alg": algorithm, "kid": "synthetic"}).encode()).decode().rstrip("=")
            with self.assertRaises(Refused):
                GoogleIAPVerifier()(header + ".payload.signature", CONFIG["IAP_AUDIENCE"])

    def test_google_verifier_uses_iap_certificates_and_exact_audience(self):
        calls = []
        request = object()
        transport = SimpleNamespace(Request=lambda: request)
        oauth = SimpleNamespace(id_token=SimpleNamespace(verify_token=lambda *args, **kwargs: calls.append((args, kwargs)) or self.claims))
        header = base64.urlsafe_b64encode(json.dumps({"alg": "ES256", "kid": "synthetic"}).encode()).decode().rstrip("=")
        token = header + ".payload.signature"
        with patch.dict("sys.modules", {"google.auth.transport.requests": transport, "google.oauth2": oauth}):
            self.assertEqual(GoogleIAPVerifier()(token, CONFIG["IAP_AUDIENCE"]), self.claims)
        self.assertEqual(calls, [((token, request), {"audience": CONFIG["IAP_AUDIENCE"], "certs_url": IAP_CERTS})])

    def test_real_google_auth_verifies_synthetic_es256_and_rejects_tampering(self):
        try:
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import ec
            from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
            from google.oauth2 import id_token  # noqa: F401; require the real verifier
        except ImportError:
            self.skipTest("Pinned cloud dependencies required for real ES256 verification")

        def encode(value):
            return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=").decode()

        key = ec.generate_private_key(ec.SECP256R1())
        public_pem = key.public_key().public_bytes(serialization.Encoding.PEM,
                                                  serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        now = int(time.time())
        claims = {"iss": IAP_ISSUER, "aud": CONFIG["IAP_AUDIENCE"], "sub": "google:synthetic-owner",
                  "email": CONFIG["OWNER_EMAIL"], "iat": now - 10, "exp": now + 590}
        header = encode({"alg": "ES256", "kid": "synthetic-test-key"})
        unsigned = header + "." + encode(claims)
        der = key.sign(unsigned.encode(), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der)
        signature = base64.urlsafe_b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).rstrip(b"=").decode()
        token = unsigned + "." + signature
        cert_requests = []

        def fake_request(url, method="GET", **_kwargs):
            cert_requests.append((url, method))
            self.assertEqual(url, IAP_CERTS, "No real network is permitted in synthetic crypto tests")
            return SimpleNamespace(status=200, data=json.dumps({"synthetic-test-key": public_pem}).encode(),
                                   headers={"cache-control": "max-age=3600"})

        with patch("google.auth.transport.requests.Request", return_value=fake_request):
            verifier = GoogleIAPVerifier()
            self.assertEqual(verifier(token, CONFIG["IAP_AUDIENCE"]), claims)
            tampered = header + "." + encode({**claims, "email": "intruder@example.test"}) + "." + signature
            with self.assertRaises(Refused):
                verifier(tampered, CONFIG["IAP_AUDIENCE"])
            with self.assertRaises(Refused):
                verifier(token, CONFIG["IAP_AUDIENCE"] + "-wrong")
        self.assertEqual(cert_requests, [(IAP_CERTS, "GET")] * 3)


if __name__ == "__main__":
    unittest.main()
