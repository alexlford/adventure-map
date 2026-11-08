"""Owner-only cloud OAuth and transient review, served by a production WSGI server.

No live client is created on import. All failures use fixed responses; this module
never logs requests, callback URLs, exception values, secrets, or activity data.
The deployment must also disable/exclude upstream request and access logging.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import math
import os
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

IAP_ISSUER = "https://cloud.google.com/iap"
IAP_CERTS = "https://www.gstatic.com/iap/verify/public_key"
STATE_TTL = 600
CACHE_TTL = 48 * 60 * 60
NONCE = re.compile(r"[A-Za-z0-9_-]{43}\Z")
REQUIRED_SCOPE = "activity:read_all"
ALLOWED_SCOPES = {"read", REQUIRED_SCOPE}
OAUTH_COOKIE = "__Host-strava_oauth"
CSRF_COOKIE = "__Host-strava_csrf"
ASSETS = {
    "/static/review.css": ("review.css", "text/css; charset=utf-8"),
    "/static/review.js": ("review.js", "application/javascript; charset=utf-8"),
}


class Refused(Exception):
    """No exception message is returned to the browser or logs."""


def _finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


class GoogleIAPVerifier:
    """Validate Google's signed IAP JWT, never unsigned identity headers.

    IAP documents signed email/sub rather than an email_verified claim. Its
    authenticated Google identity is trusted only after signature verification;
    a present, false email_verified claim is additionally refused by the app.
    """

    def __call__(self, token, audience):
        try:
            encoded = token.split(".")[0]
            header = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
            if (header.get("alg") != "ES256" or not isinstance(header.get("kid"), str)
                    or not header["kid"]):
                raise Refused()
            # Imports remain lazy so synthetic tests and /healthz need no cloud SDK.
            from google.auth.transport.requests import Request
            from google.oauth2 import id_token
            return id_token.verify_token(token, Request(), audience=audience, certs_url=IAP_CERTS)
        except Exception:
            raise Refused() from None


def _config(value=None):
    supplied = dict(os.environ if value is None else value)
    owner = supplied.get("OWNER_EMAIL", "")
    audience = supplied.get("IAP_AUDIENCE", "")
    callback = supplied.get("OAUTH_CALLBACK_URL", "")
    parsed = urlsplit(callback)
    try:
        port = parsed.port
    except ValueError:
        raise ValueError("Invalid cloud web configuration.") from None
    if (not isinstance(owner, str) or "@" not in owner or owner.strip() != owner
            or any(ord(c) < 33 for c in owner)
            or not isinstance(audience, str) or not audience.startswith("/projects/")
            or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or port not in (None, 443) or parsed.path != "/oauth/callback"
            or parsed.query or parsed.fragment):
        raise ValueError("Invalid cloud web configuration.")
    return {"owner": owner, "audience": audience, "callback": callback,
            "origin": "https://" + parsed.netloc}


def _escape(value):
    return html.escape(str(value), quote=True)


def _text(value, fallback="Unavailable"):
    return _escape(value) if isinstance(value, (str, int, float)) and not isinstance(value, bool) else fallback


def _utc(epoch):
    return datetime.fromtimestamp(epoch, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _cookie(name, value="", lifetime=0, same_site="Lax"):
    cookie = SimpleCookie()
    cookie[name] = value
    morsel = cookie[name]
    morsel["secure"] = True
    morsel["httponly"] = True
    morsel["path"] = "/"
    morsel["samesite"] = same_site
    morsel["max-age"] = lifetime
    return ("Set-Cookie", morsel.OutputString())


def _page(title, content, script=False):
    return ("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<title>{_escape(title)} · Private Strava review</title>"
            "<link rel=\"stylesheet\" href=\"/static/review.css\">"
            + ("<script src=\"/static/review.js\" defer></script>" if script else "")
            + "</head><body><header><a href=\"/\">Adventure Passport</a>"
            "<span>Owner-only Strava review</span></header><main>"
            + content + "</main><footer>Activity data from Strava. Private temporary review only."
            " No publication or archive changes.</footer></body></html>")


def _route_svg(gps):
    """Draw recorded observations as separate SVG segments, with no map service."""
    if not isinstance(gps, dict):
        return "<p>Recorded GPS is unavailable for this activity.</p>"
    segments = []
    for segment in gps.get("segments", []) if isinstance(gps.get("segments"), list) else []:
        if not isinstance(segment, dict) or segment.get("evidenceType") != "recorded":
            continue
        points = segment.get("coordinatesLatLng", [])
        if not isinstance(points, list):
            continue
        # Invalid coordinates split continuity rather than bridging hidden gaps.
        current = []
        for point in points:
            valid = (isinstance(point, (list, tuple)) and len(point) == 2
                     and all(_finite(v) for v in point)
                     and -90 <= point[0] <= 90 and -180 <= point[1] <= 180)
            if valid:
                current.append(point)
            elif current:
                segments.append(current)
                current = []
        if current:
            segments.append(current)
    if not segments:
        return "<p>No valid recorded GPS observations are available.</p>"
    coordinates = [point for segment in segments for point in segment]
    low_lat, high_lat = min(p[0] for p in coordinates), max(p[0] for p in coordinates)
    low_lng, high_lng = min(p[1] for p in coordinates), max(p[1] for p in coordinates)
    # A local equirectangular overview preserves points and gaps; it is not a map.
    longitude_scale = max(.01, math.cos(math.radians((low_lat + high_lat) / 2)))
    width = (high_lng - low_lng) * longitude_scale
    height = high_lat - low_lat
    scale = min(560 / max(width, 1e-9), 260 / max(height, 1e-9))
    offset_x, offset_y = (600 - width * scale) / 2, (300 - height * scale) / 2
    shapes = []
    for segment in segments:
        projected = [(offset_x + (point[1] - low_lng) * longitude_scale * scale,
                      offset_y + (high_lat - point[0]) * scale) for point in segment]
        if len(projected) == 1:
            x, y = projected[0]
            shapes.append(f'<circle cx="{x:.3f}" cy="{y:.3f}" r="3"/>')
        else:
            values = " ".join(f"{x:.3f},{y:.3f}" for x, y in projected)
            shapes.append(f'<polyline points="{values}"/>')
    return ('<figure><svg viewBox="0 0 600 300" role="img" '
            'aria-label="Private recorded GPS overview; gaps stay separate">'
            + "".join(shapes) + "</svg><figcaption>Recorded GPS observations, without a basemap. "
            "Gaps remain separate; hidden sections are never reconstructed. "
            "Route privacy and completeness are unverified.</figcaption></figure>")


def _gps_summary(gps):
    if not isinstance(gps, dict):
        return ""
    labels = {
        "missing-or-invalid-gps": "Missing or invalid GPS observation",
        "possible-coordinate-order-error": "Possible coordinate order error; observation excluded",
        "missing-time": "Missing or invalid time; continuity is uncertain",
        "non-increasing-time": "Time does not increase; continuity is uncertain",
        "recording-gap": "Recording gap; segments remain separate",
        "possible-gps-jump": "Possible GPS jump; segments remain separate",
        "recorded-distance-disagreement": "Recorded segment distance differs from the activity distance",
        "recorded-geometry-shortened": "Recorded geometry is shorter than the previous temporary observation",
        "duplicate-geometry-review": "Another activity in this temporary review has matching geometry",
    }
    flags = []
    for flag in gps.get("flags", []) if isinstance(gps.get("flags"), list) else []:
        if not isinstance(flag, dict) or not isinstance(flag.get("reason"), str):
            continue
        reason = flag["reason"]
        index = flag.get("sourcePointIndex")
        location = f" (source point {index})" if isinstance(index, int) and not isinstance(index, bool) and index >= 0 else ""
        flags.append("<li>" + _escape(labels.get(reason, reason)) + location + "</li>")
    metrics = (("Valid recorded points", gps.get("validPointCount")),
               ("Source points", gps.get("sourcePointCount")),
               ("Recorded segment distance (m)", gps.get("mappedRecordedDistanceM")),
               ("Strava activity distance (m)", gps.get("recordedActivityDistanceM")),
               ("Distance difference (%)", gps.get("distanceDifferencePercent")))
    details = "".join(f"<dt>{label}</dt><dd>{_text(value)}</dd>" for label, value in metrics)
    return ('<section aria-label="GPS evidence and quality"><h3>GPS evidence and quality</h3>'
            '<p>Source: Strava API streams, a temporary API observation. '
            'This is separate from original watch-file or account-export GPS. '
            'Route privacy and visibility completeness are unknown; no hidden sections are reconstructed.</p>'
            '<dl>' + details + '</dl>'
            + ('<p>Manual quality review is required:</p><ul>' + "".join(flags) + '</ul>' if flags
               else '<p>No automated quality flags. Privacy and completeness remain unverified.</p>')
            + '</section>')


def _review(envelope, now):
    if not envelope:
        return "<h1>Temporary review</h1><p>No unexpired review is available. Run a new private scan.</p>", False
    created, expiry = envelope.get("created_at"), envelope.get("expires_at")
    if (not _finite(created) or not _finite(expiry) or created > now or expiry <= now
            or expiry <= created or expiry > created + CACHE_TTL
            or not isinstance(envelope.get("payload"), dict)):
        return "<h1>Temporary review</h1><p>No unexpired review is available. Run a new private scan.</p>", False
    payload = envelope["payload"]
    queue = payload.get("queue", {})
    candidates = queue.get("candidates", []) if isinstance(queue, dict) else []
    if not isinstance(candidates, list):
        raise Refused()
    articles = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        attribution = item.get("sourceAttribution", {})
        device = attribution.get("device") if isinstance(attribution, dict) else None
        metadata = (("Date", item.get("activityLocalDateTime") or item.get("date")),
                    ("Activity type", item.get("activityType")),
                    ("Distance (km)", item.get("distanceKm")),
                    ("Elevation gain (m)", item.get("elevationGainM")),
                    ("Suggested review", item.get("suggestedAction")),
                    ("Device attribution", device))
        details = "".join(f"<dt>{label}</dt><dd>{_text(value)}</dd>" for label, value in metadata)
        description = item.get("description")
        race = item.get("raceEvidence") or {}
        race_signals = race.get("signals", []) if isinstance(race, dict) else []
        evidence = ("<p>Race identity remains unverified. Source signals: "
                    + _escape("; ".join(str(value) for value in race_signals)) + ".</p>"
                    if race_signals else "")
        articles.append("<article><h2>" + _text(item.get("name"), "Untitled activity") + "</h2>"
                        + evidence
                        + ("<p class=\"description\">" + _escape(description) + "</p>"
                           if isinstance(description, str) and description else "")
                        + "<dl>" + details + "</dl>" + _gps_summary(item.get("gpsReview"))
                        + _route_svg(item.get("gpsReview")) + "</article>")
    return (f'<h1>Temporary review</h1><p class="expiry">Expires <time id="expiry" '
            f'data-expires-at="{expiry:.3f}">{_utc(expiry)}</time> · maximum 48 hours</p>'
            '<p>Activity data from Strava. This view preserves supplied device attribution. '
            'Review suggestions do not approve publication or create canonical records.</p>'
            '<div id="review-content">' + ("".join(articles) or "<p>No review candidates in this scan.</p>")
            + "</div><p><a href=\"/\">Connection settings</a></p>"), True


class Application:
    def __init__(self, runtime=None, config=None, verifier=None, now=time.time):
        self.config = _config(config)
        self.runtime = runtime
        self.verifier = verifier or GoogleIAPVerifier()
        self.now = now
        self._initialization = threading.Lock()
        self.assets = {route: ((Path(__file__).parent / "static" / filename).read_bytes(), kind)
                       for route, (filename, kind) in ASSETS.items()}

    def _runtime(self):
        with self._initialization:
            if self.runtime is None:
                from .worker import make_runtime
                self.runtime = make_runtime()
        return self.runtime

    def _owner(self, environ):
        token = environ.get("HTTP_X_GOOG_IAP_JWT_ASSERTION", "")
        if not isinstance(token, str) or not token or len(token) > 16384:
            raise Refused()
        try:
            claims = self.verifier(token, self.config["audience"])
        except Exception:
            raise Refused() from None
        if not isinstance(claims, dict):
            raise Refused()
        issued, expiry = claims.get("iat"), claims.get("exp")
        if (claims.get("iss") != IAP_ISSUER or claims.get("aud") != self.config["audience"]
                or claims.get("email") != self.config["owner"]
                or ("email_verified" in claims and claims["email_verified"] is not True)
                or not isinstance(claims.get("sub"), str) or not claims["sub"].strip()
                or len(claims["sub"]) > 512
                or not _finite(issued) or not _finite(expiry)
                or issued < 0 or issued > self.now() + 30 or expiry <= self.now()
                or expiry <= issued or expiry - issued > 660):
            raise Refused()
        return claims["sub"]

    def _digest(self, kind, owner, nonce):
        return hashlib.sha256((kind + "\0" + owner + "\0" + nonce).encode()).hexdigest()

    def _issue(self, kind, owner):
        nonce = secrets.token_urlsafe(32)
        self._runtime().store.state.issue_oauth_state(self._digest(kind, owner, nonce), self.now() + STATE_TTL)
        return nonce

    def _retire_cookie_state(self, kind, owner, environ):
        cookie_name = OAUTH_COOKIE if kind == "oauth" else CSRF_COOKIE
        previous = self._cookies(environ).get(cookie_name)
        if previous is not None and NONCE.fullmatch(previous.value):
            self._runtime().store.state.consume_oauth_state(self._digest(kind, owner, previous.value))

    @staticmethod
    def _cookies(environ):
        try:
            result = SimpleCookie()
            result.load(environ.get("HTTP_COOKIE", ""))
            return result
        except Exception:
            raise Refused() from None

    def _consume(self, kind, owner, nonce, environ):
        if not isinstance(nonce, str) or not NONCE.fullmatch(nonce):
            raise Refused()
        cookie_name = OAUTH_COOKIE if kind == "oauth" else CSRF_COOKIE
        cookie = self._cookies(environ).get(cookie_name)
        if cookie is None or not hmac.compare_digest(cookie.value, nonce):
            raise Refused()
        if not self._runtime().store.state.consume_oauth_state(self._digest(kind, owner, nonce)):
            raise Refused()

    @staticmethod
    def _params(raw, maximum=8):
        if len(raw) > 8192:
            raise Refused()
        try:
            values = parse_qs(raw, keep_blank_values=True, max_num_fields=maximum,
                              encoding="utf-8", errors="strict")
        except (ValueError, UnicodeError):
            raise Refused() from None
        if any(len(value) != 1 for value in values.values()):
            raise Refused()
        return {key: value[0] for key, value in values.items()}

    def _form(self, environ, owner):
        if environ.get("HTTP_ORIGIN") != self.config["origin"]:
            raise Refused()
        if environ.get("CONTENT_TYPE", "").split(";", 1)[0] != "application/x-www-form-urlencoded":
            raise Refused()
        try:
            length = int(environ.get("CONTENT_LENGTH", ""))
            if not 0 < length <= 8192:
                raise Refused()
            raw = environ["wsgi.input"].read(length)
            if len(raw) != length:
                raise Refused()
            form = self._params(raw.decode("utf-8"))
        except (ValueError, UnicodeError, KeyError):
            raise Refused() from None
        self._consume("csrf", owner, form.pop("csrf", None), environ)
        return form

    def _redirect(self, notice, cookies=(), external=None):
        return 303, b"", [("Location", external or (self.config["origin"] + "/?notice=" + notice)), *cookies]

    def _dispatch(self, environ, owner):
        path, method = environ.get("PATH_INFO", "/"), environ.get("REQUEST_METHOD", "GET")
        if path in ASSETS and method in ("GET", "HEAD"):
            body, kind = self.assets[path]
            return 200, body, [("Content-Type", kind)]
        if path == "/" and method in ("GET", "HEAD"):
            notice = self._params(environ.get("QUERY_STRING", "")).get("notice")
            messages = {
                "configured": "Application credentials were saved securely. Authorize a new cloud grant below.",
                "connected": "Cloud authorization is connected with read-only activity access.",
                "authorization-failed": "Authorization could not be verified. Start authorization again.",
                "revoked": "Cloud authorization was removed, temporary data was erased, and Strava revocation was confirmed.",
                "revocation-unverified": "Cloud authorization was removed and temporary data was erased. Remote revocation is unverified; remove this app in Strava settings.",
                "cleanup-pending": "Cloud authorization was deactivated and private review access was closed. Physical deletion could not be confirmed; cleanup must be retried. Remote revocation is unverified unless separately confirmed in Strava settings.",
            }
            client_id = self._runtime().oauth_client_id()
            self._retire_cookie_state("csrf", owner, environ)
            csrf = self._issue("csrf", owner)
            hidden = f'<input type="hidden" name="csrf" value="{csrf}">'
            content = '<h1>Private Strava connection</h1>'
            if notice in messages:
                content += '<p class="notice" role="status">' + messages[notice] + '</p>'
            content += '<p>Approve this cloud application personally in your browser. Strava handles your sign-in; this app never asks for your Strava password.</p>'
            if client_id:
                content += ('<p>Application client ID: ' + _escape(client_id) + '</p>'
                            '<form action="/oauth/start" method="post">' + hidden
                            + '<button>Authorize a new read-only cloud grant</button></form>')
            else:
                content += ('<h2>Initial application setup</h2><p>Enter the registered application credentials here. '
                            'The client secret goes directly to Google Secret Manager.</p>'
                            '<form action="/setup" method="post" autocomplete="off">' + hidden
                            + '<label>Application client ID<input name="client_id" inputmode="numeric" pattern="[0-9]+" maxlength="32" required></label>'
                            '<label>Application client secret<input name="client_secret" type="password" autocomplete="new-password" maxlength="1024" spellcheck="false" required></label>'
                            '<button>Save application credentials securely</button></form>')
            content += ('<p><a class="button" href="/review">Open temporary private review</a></p>'
                        '<h2>Disconnect and erase temporary data</h2><p>Disconnecting immediately deactivates local authorization and deletes temporary activity data, even if Strava cannot confirm remote revocation.</p>'
                        '<form action="/revoke" method="post">' + hidden
                        + '<button class="danger">Disconnect and erase</button></form>')
            return 200, _page("Connection", content), [_cookie(CSRF_COOKIE, csrf, STATE_TTL, "Strict")]
        if path == "/review" and method in ("GET", "HEAD"):
            content, script = _review(self._runtime().review_snapshot(), self.now())
            return 200, _page("Temporary review", content, script), []
        if path == "/setup" and method == "POST":
            form = self._form(environ, owner)
            if (set(form) != {"client_id", "client_secret"}
                    or not re.fullmatch(r"[0-9]{1,32}", form["client_id"])
                    or not 1 <= len(form["client_secret"]) <= 1024
                    or any(ord(c) < 33 or ord(c) > 126 for c in form["client_secret"])):
                raise Refused()
            self._runtime().setup_client(form["client_id"], form["client_secret"])
            return self._redirect("configured", [_cookie(CSRF_COOKIE)])
        if path == "/oauth/start" and method == "POST":
            if self._form(environ, owner):
                raise Refused()
            client_id = self._runtime().oauth_client_id()
            if not isinstance(client_id, str) or not re.fullmatch(r"[0-9]{1,32}", client_id):
                raise Refused()
            self._retire_cookie_state("oauth", owner, environ)
            state = self._issue("oauth", owner)
            target = "https://www.strava.com/oauth/authorize?" + urlencode({
                "client_id": client_id, "redirect_uri": self.config["callback"],
                "response_type": "code", "approval_prompt": "force", "scope": REQUIRED_SCOPE, "state": state})
            return self._redirect("", [_cookie(OAUTH_COOKIE, state, STATE_TTL), _cookie(CSRF_COOKIE)], target)
        if path == "/oauth/callback" and method == "GET":
            try:
                params = self._params(environ.get("QUERY_STRING", ""))
                self._consume("oauth", owner, params.get("state"), environ)
                if set(params) - {"state", "code", "scope", "error", "error_reason", "error_description"} or "error" in params:
                    raise Refused()
                code = params.get("code", "")
                scopes = set(params.get("scope", "").replace(",", " ").split())
                if (not 1 <= len(code) <= 2048 or any(ord(c) < 33 or ord(c) > 126 for c in code)
                        or REQUIRED_SCOPE not in scopes or scopes - ALLOWED_SCOPES):
                    raise Refused()
                self._runtime().exchange_code(code, granted_scopes=sorted(scopes), callback_uri=self.config["callback"])
            except Exception:
                return self._redirect("authorization-failed", [_cookie(OAUTH_COOKIE)])
            return self._redirect("connected", [_cookie(OAUTH_COOKIE)])
        if path == "/revoke" and method == "POST":
            if self._form(environ, owner):
                raise Refused()
            result = self._runtime().revoke()
            if not isinstance(result, dict) or result.get("localRevoked") is not True:
                raise Refused()
            if result.get("localCleared") is not True:
                notice = "cleanup-pending"
            else:
                notice = "revoked" if result.get("remoteRevoked") is True else "revocation-unverified"
            return self._redirect(notice, [_cookie(OAUTH_COOKIE), _cookie(CSRF_COOKIE)])
        known = {"/", "/review", "/setup", "/oauth/start", "/oauth/callback", "/revoke", *ASSETS}
        return (405 if path in known else 404), _page("Unavailable", "<h1>This page is unavailable.</h1>"), []

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "/")
        try:
            # Health checks are content-free, never initialize a runtime, and
            # expose no authorization or sync state even without an IAP header.
            if path == "/healthz" and environ.get("REQUEST_METHOD") in ("GET", "HEAD"):
                status, body, extra = 204, b"", []
            else:
                try:
                    owner = self._owner(environ)
                except Refused:
                    status, body, extra = 403, _page("Access denied", "<h1>Owner access is required.</h1>"), []
                else:
                    status, body, extra = self._dispatch(environ, owner)
        except Refused:
            status, body, extra = 400, _page("Request refused", "<h1>This request could not be verified.</h1><p>Return to connection settings and try again.</p>"), []
        except Exception:
            # Never use exception logging: cloud SDK errors may include private
            # object names, tokens, response bodies, or submitted credentials.
            status, body, extra = 503, _page("Temporarily unavailable", "<h1>The private service is temporarily unavailable.</h1><p>Return to connection settings and try again later.</p>"), []
        body = body.encode("utf-8") if isinstance(body, str) else body
        headers = [
            ("Content-Type", "text/html; charset=utf-8"),
            ("Cache-Control", "private, no-store, max-age=0"), ("Pragma", "no-cache"), ("Expires", "0"),
            ("Referrer-Policy", "no-referrer"), ("X-Content-Type-Options", "nosniff"),
            ("X-Frame-Options", "DENY"), ("X-XSS-Protection", "0"),
            ("Strict-Transport-Security", "max-age=31536000"),
            ("Cross-Origin-Opener-Policy", "same-origin"), ("Cross-Origin-Resource-Policy", "same-origin"),
            ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
            ("Content-Security-Policy", "default-src 'none'; style-src 'self'; script-src 'self'; "
             "img-src 'self'; connect-src 'none'; form-action 'self' https://www.strava.com; "
             "frame-ancestors 'none'; base-uri 'none'; object-src 'none'"),
        ]
        for name, value in extra:
            if name == "Content-Type":
                headers = [(key, val) for key, val in headers if key != name]
            headers.append((name, value))
        headers.append(("Content-Length", str(len(body))))
        reasons = {200: "OK", 204: "No Content", 303: "See Other", 400: "Bad Request", 403: "Forbidden",
                   404: "Not Found", 405: "Method Not Allowed", 503: "Service Unavailable"}
        start_response(f"{status} {reasons[status]}", headers)
        return [b"" if environ.get("REQUEST_METHOD") == "HEAD" else body]


def create_app(runtime=None, config=None, verifier=None, now=time.time):
    """Gunicorn target: scripts.strava_cloud.web:create_app(). No dev server."""
    return Application(runtime=runtime, config=config, verifier=verifier, now=now)
