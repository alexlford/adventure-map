"""Bounded, replayable private review scans; never imports public archive records."""
from __future__ import annotations

import copy
import hashlib
import json
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

from .review import candidate, inspect_streams
from .transport import ApiError
from .storage import CACHE_TTL

DAY = 86400
FIELDS = ("id", "name", "description", "sport_type", "type", "start_date",
          "start_date_local", "timezone", "distance", "elapsed_time", "moving_time",
          "total_elevation_gain", "workout_type", "private", "visibility", "manual",
          "trainer", "commute", "external_id", "upload_id", "device_name")


class SyncError(Exception):
    """Fixed safe diagnostics only; never format API data in exceptions."""


def epoch_date(value):
    try:
        if len(value) != 10:
            raise ValueError
        return int(datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    except (TypeError, ValueError):
        raise SyncError("Dates must use YYYY-MM-DD.") from None


def activity_id(value):
    # Reject malformed IDs before URL construction; keep exact numeric identity.
    if isinstance(value, bool) or not str(value).isdigit() or int(value) <= 0:
        raise SyncError("Strava returned an invalid activity identity; checkpoint unchanged.")
    return str(value)


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


class Sync:
    def __init__(self, store, tokens, transport, athlete_id, baseline, now=time.time):
        self.store, self.tokens, self.transport = store, tokens, transport
        self.athlete_id, self.baseline, self.now = str(athlete_id), baseline, now

    def get(self, path):
        try:
            return self.transport.request("GET", path, token=self.tokens.token())
        except ApiError as exc:
            if exc.status != 401:
                raise
        # Retry once, persisting rotated token before the new request.
        return self.transport.request("GET", path, token=self.tokens.token(force_refresh=True))

    def owned(self, detail, expected):
        if (not isinstance(detail, dict) or activity_id(detail.get("id")) != expected
                or str(detail.get("athlete", {}).get("id")) != self.athlete_id):
            raise SyncError("Activity ownership could not be verified; checkpoint unchanged.")
        return {key: detail[key] for key in FIELDS if key in detail}

    def run(self, since=None, until=None, streams=False):
        self.store.purge_expired()
        control = self.store.load_control()
        envelope = self.store.read_json("cache.json")
        deadline = envelope["expires_at"] if envelope else self.now() + CACHE_TTL
        payload = self.store.load_cache({"activities": {}, "notices": {}})
        # Work on a copy: failures must not mutate previously committed cache objects.
        payload = copy.deepcopy(payload)
        payload.setdefault("activities", {})
        payload.setdefault("notices", {})
        end = int(self.now())
        historical = since is not None
        if until is not None and since is None:
            raise SyncError("--until requires --since for a bounded historical review.")
        if historical:
            start = epoch_date(since)
            end = epoch_date(until) if until else min(start + 31 * DAY, end)
            if end > self.now() or not 0 < end - start <= 31 * DAY:
                raise SyncError("Historical windows must be in the past and at most 31 days (exclusive --until).")
        else:
            # Export local timestamp has no UTC offset. Use snapshot date with a
            # conservative two-day overlap rather than inventing an offset.
            baseline = epoch_date(self.baseline["snapshotOn"]) - 2 * DAY
            start = max(baseline, int(control.get("checkpoint", baseline)) - 7 * DAY)
            # Bound each operational scan; repeated commands catch up safely.
            end = min(end, start + 31 * DAY)
        pending = control.get("pending")
        resuming = bool(pending)
        mode = "backfill" if historical else "incremental"
        if pending:
            if historical and (pending["mode"] != mode or pending["after"] != start or pending["before"] != end):
                raise SyncError("An interrupted window is pending. Resume strava:sync without date arguments first.")
            start, end, mode = pending["after"], pending["before"], pending["mode"]
            streams = streams or pending.get("streams", False)
        if end <= start:
            raise SyncError("No valid scan window; check the local clock.")
        control["pending"] = {"after": start, "before": end, "page": 1,
                              "mode": mode, "streams": streams,
                              "started_at": pending["started_at"] if pending else int(self.now())}
        window = [start, end, control["pending"]["started_at"]]
        self.event(control, "started")
        self.store.save_control(control)
        seen = set()

        def save(complete=False):
            activities = payload["activities"]
            candidates = []
            for ident, entry in sorted(activities.items()):
                item = candidate(entry["activity"])
                item["change"] = entry["change"]
                item["observedAt"] = entry["observedAt"]
                item["gpsReview"] = entry.get("gpsReview")
                candidates.append(item)
            payload["queue"] = {
                "schemaVersion": 2, "source": "strava-api-private-transient-cache",
                "privateOnly": True, "publicationAllowed": False,
                "generatedAt": datetime.fromtimestamp(self.now(), timezone.utc).isoformat(),
                "baseline": self.baseline, "stateProposal": None,
                "candidates": candidates,
            }
            payload["report"] = {
                "attribution": "Activity data from Strava; retain supplied device attribution during private review.",
                "complete": complete, "window": {"after": start, "before": end},
                "mode": mode, "checkpointTarget": end if complete and mode == "incremental" else None,
                "checkpointNote": "control.json contains the committed download cursor; this report is saved before that commit.",
                "cachedActivities": len(activities), "notices": list(payload["notices"].values()),
                "limitations": ["No public promotion or export watermark change.",
                                "Edits are detectable only for re-fetched cached activities.",
                                "404 means deleted OR inaccessible, not proof of deletion.",
                                "Older backfills require explicit date-window scans.",
                                "After cache expiry, review candidates may recur.",
                                "API GPS may include hidden sections: all geometry remains private."],
            }
            # A long/interrupted operation may cross expiry. Never resurrect
            # an expired in-memory payload with a fresh retention deadline.
            self.store.save_cache(payload, expires_at=deadline)

        def refresh(ident):
            previous = payload["activities"].get(ident)
            if (resuming and previous and previous.get("processedWindow") == window
                    and (not streams or "streams" in previous)):
                # Replaying list pages must not spend the next quota window
                # re-downloading the same completed prefix forever.
                return
            try:
                detail = self.owned(self.get(f"/api/v3/activities/{ident}"), ident)
            except ApiError as exc:
                if exc.status not in (403, 404):
                    raise
                # Erase content, stream evidence, candidate and all old revisions.
                payload["activities"].pop(ident, None)
                payload["notices"][ident] = {"stravaActivityId": ident,
                    "change": "deleted-or-inaccessible", "observedAt": int(self.now()),
                    "requiresManualArchiveReview": True}
                save()
                return
            digest = fingerprint(detail)
            change = "new" if not previous else ("updated" if digest != previous["fingerprint"] else previous["change"])
            privacy_changed = previous and any(previous["activity"].get(k) != detail.get(k) for k in ("private", "visibility"))
            entry = {"activity": detail, "fingerprint": digest, "observedAt": int(self.now()),
                     "change": "privacy-changed" if privacy_changed else change}
            # Replace content before stream I/O. If it fails, stale GPS cannot survive
            # a privacy change. Do not keep old API revisions as an archive.
            payload["activities"][ident] = entry
            payload["notices"].pop(ident, None)
            save()
            if streams:
                try:
                    raw = self.get(f"/api/v3/activities/{ident}/streams?keys=latlng,time,altitude,moving&key_by_type=true")
                except ApiError as exc:
                    if exc.status not in (403, 404):
                        raise
                    raw = {}
                entry["streams"] = raw
                entry["gpsReview"] = inspect_streams(raw)
                if previous and "streams" in previous and fingerprint(previous["streams"]) != fingerprint(raw):
                    entry["change"] = "privacy-changed" if privacy_changed else "gps-changed"
            entry["processedWindow"] = window
            save()

        try:
            # Re-fetch every still-cached identity, including activities moved out
            # of the current time window. Never infer deletion from list absence.
            for ident in list(payload["activities"]):
                refresh(ident)
                seen.add(ident)
            page = 1
            while True:
                query = urlencode({"after": start - 1, "before": end, "page": page, "per_page": 200})
                batch = self.get("/api/v3/athlete/activities?" + query)
                if not isinstance(batch, list) or len(batch) > 200:
                    raise SyncError("Invalid activity page; checkpoint unchanged.")
                for summary in batch:
                    ident = activity_id(summary.get("id"))
                    if ident in seen:
                        continue
                    refresh(ident)
                    seen.add(ident)
                if len(batch) < 200:
                    break
                page += 1
                if page > 100:
                    raise SyncError("Scan safety limit reached; use a narrower historical window.")
            save(complete=True)
            # Read rate state saved by transport before committing cursor.
            latest = self.store.load_control()
            control["rate"] = latest.get("rate", {})
            if mode == "incremental":
                control["checkpoint"] = max(control.get("checkpoint", 0), end)
            control["last_complete_scan"] = int(self.now())
            control.pop("pending", None)
            self.event(control, "completed")
            self.store.save_control(control)
        except BaseException:
            latest = self.store.load_control()
            self.event(latest, "interrupted")
            self.store.save_control(latest)
            raise

    def event(self, control, name):
        control["events"] = (control.get("events", []) + [{"event": name, "at": int(self.now())}])[-100:]
