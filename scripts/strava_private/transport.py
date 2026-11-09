"""Small allowlisted Strava client. Never include response bodies in diagnostics.

No live request occurs on import. Callers hold the private workflow lock and persist
``rate_state`` between runs. Tokens and Basic credentials exist only in memory.
"""

from __future__ import annotations

import base64
import copy
import email.utils
import http.client
import json
import math
import re
import time
import urllib.error
import urllib.parse
import urllib.request


class ApiError(RuntimeError):
    def __init__(self, status=None, code="request_failed", retry_at=None):
        self.status = status
        self.code = code
        self.retry_at = retry_at
        messages = {
            "rate_limited": "Strava quota is exhausted; retry after the reported reset time.",
            "unauthorized": "Strava access expired or was revoked; refresh or authorize again.",
            "forbidden": "Strava denied this request; check permissions and activity privacy.",
            "not_found": "Strava resource is unavailable; it may be deleted or inaccessible.",
            "token_exchange_ambiguous": "Token exchange did not complete safely; authorize again if refresh fails.",
            "invalid_response": "Strava returned an invalid response; private state was not advanced.",
            "invalid_request": "Refusing a request outside the private Strava endpoint allowlist.",
            "redirect_refused": "Strava redirected a credential-bearing request; redirect refused.",
            "request_failed": "Strava request failed; retry the private command later.",
        }
        super().__init__(messages.get(code, messages["request_failed"]))


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ApiError(code="redirect_refused")


class Transport:
    """Documented read endpoints plus OAuth only; no activity-write capability.

    Default limits are conservative documented read limits (100/15m, 1000/day)
    and overall limits (200/15m, 2000/day). Response headers are authoritative.
    Long waits return ``ApiError.retry_at`` rather than blocking a terminal for
    hours. Counts are reserved before I/O to remain conservative after crashes.
    """

    def __init__(self, opener=None, now=time.time, sleep=time.sleep,
                 rate_state=None, save_rate_state=None, max_retries=4,
                 max_wait=30, timeout=30):
        self.opener = opener or urllib.request.build_opener(_NoRedirect()).open
        self.now, self.sleep = now, sleep
        self.save_rate_state = save_rate_state
        self.max_retries, self.max_wait, self.timeout = max_retries, max_wait, timeout
        self.rate_state = copy.deepcopy(rate_state or {})
        self._roll_windows()

    def _persist(self):
        if self.save_rate_state:
            self.save_rate_state(copy.deepcopy(self.rate_state))

    def _roll_windows(self):
        now = self.now()
        for name, defaults in (("overall", [200, 2000]), ("read", [100, 1000])):
            group = self.rate_state.setdefault(name, {
                "limits": defaults, "usage": [0, 0], "window": int(now // 900),
                "day": int(now // 86400)})
            if group["window"] != int(now // 900):
                group["usage"][0], group["window"] = 0, int(now // 900)
            if group["day"] != int(now // 86400):
                group["usage"][1], group["day"] = 0, int(now // 86400)

    def _wait(self, retry_at):
        delay = max(0, retry_at - self.now())
        if delay > self.max_wait:
            raise ApiError(429, "rate_limited", retry_at)
        if delay:
            self.sleep(delay)

    def preflight(self, is_read=False):
        """Check known quota before an irreversible token exchange begins.

        This does not reserve a request or perform network I/O. The actual
        request still reserves immediately before sending.
        """
        self._roll_windows()
        now = self.now()
        retry_at = self.rate_state.get("blocked_until", 0)
        for name in (["overall", "read"] if is_read else ["overall"]):
            group = self.rate_state[name]
            for index, interval in enumerate((900, 86400)):
                if group["usage"][index] >= group["limits"][index]:
                    retry_at = max(retry_at, (math.floor(now / interval) + 1) * interval + 1)
        if retry_at > now:
            self._wait(retry_at)
            self._roll_windows()

    def _reserve(self, is_read):
        self.preflight(is_read)
        for name in (["overall", "read"] if is_read else ["overall"]):
            self.rate_state[name]["usage"] = [v + 1 for v in self.rate_state[name]["usage"]]
        self._persist()

    def _headers(self, headers):
        headers = {key.lower(): value for key, value in headers.items()}
        self._roll_windows()
        for group, prefix in (("overall", "x-ratelimit"), ("read", "x-readratelimit")):
            for field, suffix in (("limits", "limit"), ("usage", "usage")):
                value = headers.get(f"{prefix}-{suffix}", "")
                if re.fullmatch(r"\s*\d+\s*,\s*\d+\s*", value):
                    pair = [int(v) for v in value.split(",")]
                    if field == "usage" or all(v > 0 for v in pair):
                        self.rate_state[group][field] = pair
        self._persist()
        return headers

    def _retry_at(self, headers):
        value = headers.get("retry-after", "")
        try:
            return self.now() + max(1, int(value))
        except (ValueError, TypeError):
            try:
                date = email.utils.parsedate_to_datetime(value)
                return max(self.now() + 1, date.timestamp())
            except (ValueError, TypeError, OverflowError):
                return (math.floor(self.now() / 900) + 1) * 900 + 1

    @staticmethod
    def _validate(method, path, form, token, basic):
        parsed = urllib.parse.urlsplit(path)
        if parsed.scheme or parsed.netloc or parsed.fragment or not path.startswith("/"):
            raise ApiError(code="invalid_request")
        query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        if method == "POST" and parsed.path in ("/oauth/token", "/oauth/revoke", "/oauth/deauthorize"):
            if query or not isinstance(form, dict):
                raise ApiError(code="invalid_request")
            allowed = {
                "/oauth/token": {"client_id", "client_secret", "code", "grant_type", "refresh_token"},
                "/oauth/revoke": {"token", "token_type_hint"},
                "/oauth/deauthorize": {"access_token"},
            }[parsed.path]
            if set(form) - allowed or (basic and parsed.path != "/oauth/revoke"):
                raise ApiError(code="invalid_request")
            return False
        if method != "GET" or form is not None or basic or not token:
            raise ApiError(code="invalid_request")
        if parsed.path == "/api/v3/athlete/activities":
            if set(query) - {"before", "after", "page", "per_page"}:
                raise ApiError(code="invalid_request")
            if any(len(v) != 1 or not re.fullmatch(r"\d+", v[0]) for v in query.values()):
                raise ApiError(code="invalid_request")
            if "per_page" in query and not 1 <= int(query["per_page"][0]) <= 200:
                raise ApiError(code="invalid_request")
        elif re.fullmatch(r"/api/v3/activities/[1-9][0-9]*(/streams)?", parsed.path):
            if parsed.path.endswith("/streams"):
                if set(query) - {"keys", "key_by_type"}:
                    raise ApiError(code="invalid_request")
                allowed_streams = {"latlng", "time", "distance", "altitude", "moving", "grade_smooth", "velocity_smooth"}
                if len(query.get("keys", [])) != 1 or set(query["keys"][0].split(",")) - allowed_streams:
                    raise ApiError(code="invalid_request")
                if query.get("key_by_type") != ["true"]:
                    raise ApiError(code="invalid_request")
            elif query:
                raise ApiError(code="invalid_request")
        else:
            raise ApiError(code="invalid_request")
        return True

    def request(self, method, path, form=None, token=None, basic=None):
        method = method.upper()
        is_read = self._validate(method, path, form, token, basic)
        headers = {"Accept": "application/json", "User-Agent": "Adventure-Passport-Private-Sync/1"}
        if token:
            if not isinstance(token, str) or any(ord(char) < 32 or ord(char) == 127 for char in token):
                raise ApiError(code="invalid_request")
            headers["Authorization"] = f"Bearer {token}"
        if basic:
            if len(basic) != 2 or any(not isinstance(v, str) for v in basic):
                raise ApiError(code="invalid_request")
            encoded = base64.b64encode(":".join(basic).encode()).decode("ascii")
            headers["Authorization"] = f"Basic {encoded}"
        data = urllib.parse.urlencode(form).encode() if form is not None else None
        if data is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        request = urllib.request.Request("https://www.strava.com" + path, data=data, headers=headers, method=method)
        for attempt in range(self.max_retries + 1):
            self._reserve(is_read)
            try:
                response = self.opener(request, timeout=self.timeout)
                try:
                    status = response.status
                    response_headers = self._headers(response.headers)
                    if not 200 <= status < 300:
                        raise urllib.error.HTTPError(request.full_url, status, "", response.headers, None)
                    body = response.read(32 * 1024 * 1024 + 1)
                finally:
                    response.close()
                if not body and path == "/oauth/revoke":
                    return None
                if len(body) > 32 * 1024 * 1024:
                    raise ApiError(code="invalid_response")
                try:
                    return json.loads(body)
                except (ValueError, UnicodeError):
                    raise ApiError(code="invalid_response") from None
            except urllib.error.HTTPError as exc:
                status = exc.code
                response_headers = self._headers(exc.headers or {})
                exc.close()
                if status == 429:
                    retry_at = self._retry_at(response_headers)
                    self.rate_state["blocked_until"] = retry_at
                    self._persist()
                    if attempt == self.max_retries:
                        raise ApiError(status, "rate_limited", retry_at) from None
                    self._wait(retry_at)
                    continue
                if 300 <= status < 400:
                    raise ApiError(status, "redirect_refused") from None
                if status >= 500 and method == "GET" and attempt < self.max_retries:
                    self.sleep(min(self.max_wait, 2 ** attempt))
                    continue
                code = {401: "unauthorized", 403: "forbidden", 404: "not_found"}.get(status, "request_failed")
                if status >= 500 and path == "/oauth/token":
                    code = "token_exchange_ambiguous"
                raise ApiError(status, code) from None
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError, http.client.HTTPException):
                if method == "GET" and attempt < self.max_retries:
                    self.sleep(min(self.max_wait, 2 ** attempt))
                    continue
                code = "token_exchange_ambiguous" if path == "/oauth/token" else "request_failed"
                raise ApiError(code=code) from None
