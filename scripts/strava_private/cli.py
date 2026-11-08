"""Manual Mac commands. Never run live commands from an AI or CI environment."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys

from .auth import AuthError, KeychainStore, TokenManager, authorize, disconnect, status
from .storage import PrivateStore, StorageError
from .sync import Sync, SyncError
from .transport import ApiError, Transport

REPO = Path(__file__).resolve().parents[2]


def require_local_mac(interactive=True):
    # Defense in depth, not an AI sandbox: real operations must be outside AI
    # tools. Never offer a --force or environment override of this guard.
    if sys.platform != "darwin":
        raise SyncError("Live Strava commands run only on your Mac; this environment is for synthetic tests.")
    if any(key in os.environ for key in ("CI", "GITHUB_ACTIONS", "CODEX_THREAD_ID", "CODEX_CI",
                                         "CODEX_SANDBOX", "CODEX_MANAGED_BY_NPM", "OPENAI_API_KEY",
                                         "ANTHROPIC_API_KEY", "CURSOR_AGENT", "CLAUDECODE")):
        raise SyncError("Run private Strava commands from a separate local terminal outside all AI tools and CI.")
    if interactive and not (sys.stdin.isatty() and sys.stdout.isatty()):
        raise SyncError("Use an interactive local Mac terminal; redirecting private command output is disabled.")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Private local Strava review workflow. Never run through AI tools.")
    parser.add_argument("command", choices=("auth", "reauth", "status", "sync", "report", "disconnect", "purge", "purge-local"))
    parser.add_argument("--since", help="Intentional bounded backfill, YYYY-MM-DD (UTC)")
    parser.add_argument("--until", help="Exclusive backfill end, YYYY-MM-DD (maximum 31 days)")
    parser.add_argument("--streams", action="store_true", help="Fetch private recorded GPS streams for local inspection")
    args = parser.parse_args(argv)
    if args.command != "sync" and (args.since or args.until or args.streams):
        parser.error("Date and stream options apply only to sync.")
    try:
        if args.command == "purge-local":
            if sys.platform != "darwin":
                raise SyncError("Scheduled local cleanup requires macOS.")
        else:
            require_local_mac()
        local = PrivateStore(repo_root=REPO)
        with local.locked():
            if args.command == "purge-local":
                local.purge_expired()
                return 0
            if args.command == "purge":
                local.clear_activity_data()
                print("Private API activity cache and review report erased. Authorization is unchanged.")
                return 0
            if args.command == "report":
                if not local.load_cache():
                    print("No unexpired private report. Run strava:sync on your Mac.")
                    return 0
                # JSON is opened directly, never interpolated into HTML or sent
                # to a server. Do not output titles, IDs, locations, or counts.
                subprocess.run(["/usr/bin/open", "-t", str(local.root / "cache.json")], check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print("Opened the private JSON report locally. Close it when finished; do not upload it to AI tools.")
                return 0

            def save_rate(rate):
                state = local.load_control()
                state["rate"] = rate
                local.save_control(state)

            transport = Transport(rate_state=local.load_control().get("rate"), save_rate_state=save_rate)
            keychain = KeychainStore()
            if args.command in ("auth", "reauth"):
                from .cleanup import install_cleanup
                install_cleanup(REPO / "scripts/strava_private_sync.py")
                # API data must never survive reauthorization/account replacement,
                # even if a previous Keychain item has been removed separately.
                local.clear_activity_data()
                old_control = local.load_control()
                reset = {"schemaVersion": 1, "rate": old_control.get("rate", {})}
                if old_control.get("authorization_uncertain"):
                    reset["authorization_uncertain"] = True
                local.save_control(reset)
                authorize(keychain, transport)
                reset.pop("authorization_uncertain", None)
                reset["rate"] = local.load_control().get("rate", {})
                local.save_control(reset)
                print("Read-only authorization saved in macOS Keychain. Live sync has not yet been verified.")
            elif args.command == "status":
                if local.load_control().get("authorization_uncertain"):
                    raise AuthError("token-refresh-failed", "Authorization is uncertain. Reauthorize on your Mac before syncing again.")
                result = status(keychain)
                if not result["authorized"]:
                    print("Not authorized. Run npm run strava:auth on your Mac.")
                elif result["refreshOnNextRequest"]:
                    print("Read-only authorization stored; access token will refresh on the next request.")
                else:
                    print("Read-only authorization stored. No API request was made by this status check.")
            elif args.command == "disconnect":
                # Purge immediately even if remote revocation is unavailable.
                local.clear_activity_data()
                old_control = local.load_control()
                reset = {"schemaVersion": 1, "rate": old_control.get("rate", {})}
                if old_control.get("authorization_uncertain"):
                    reset["authorization_uncertain"] = True
                local.save_control(reset)
                disconnect(keychain, transport)
                reset.pop("authorization_uncertain", None)
                reset["rate"] = local.load_control().get("rate", {})
                local.save_control(reset)
                print("Strava authorization revoked, Keychain item removed, and private API cache erased.")
            elif args.command == "sync":
                from .cleanup import install_cleanup
                install_cleanup(REPO / "scripts/strava_private_sync.py")
                bundle = keychain.load()
                if not bundle:
                    raise SyncError("No authorization found. Run npm run strava:auth on your Mac.")
                baseline = json.loads((REPO / "data/ingest-state.json").read_text())
                baseline = {k: baseline[k] for k in ("snapshotOn", "activityCount", "lastSeenActivityLocalDateTime")}
                Sync(local, TokenManager(keychain, transport, control_store=local), transport, bundle["athlete_id"], baseline).run(
                    args.since, args.until, args.streams)
                print("Private review window completed. Run npm run strava:report to inspect it locally.")
                print("No public records, routes, or reviewed export watermark were changed.")
        return 0
    except ApiError as exc:
        if exc.status == 401:
            # Tokens may have been revoked or permissions changed remotely.
            try:
                with local.locked():
                    local.clear_activity_data()
            except (StorageError, UnboundLocalError):
                pass
        print(str(exc), file=sys.stderr)
        if exc.retry_at:
            try:
                reset = datetime.fromtimestamp(exc.retry_at, timezone.utc).isoformat()
            except (ValueError, OverflowError, OSError):
                reset = "the server quota reset (date unavailable)"
            print("Retry after " + reset, file=sys.stderr)
    except AuthError as exc:
        if exc.code in ("token-refresh-failed", "rotation-storage-failed", "not-authorized", "missing-permission", "excess-permission"):
            try:
                with local.locked():
                    local.clear_activity_data()
            except (StorageError, UnboundLocalError):
                pass
        print(str(exc), file=sys.stderr)
    except (StorageError, SyncError) as exc:
        print(str(exc), file=sys.stderr)
    except KeyboardInterrupt:
        print("Interrupted. Re-run sync to replay the pending window; checkpoint was not advanced.", file=sys.stderr)
    except Exception:
        # Never allow a traceback or raw OS/HTTP error to reveal private values.
        print("Private command failed safely. No private details were printed. Retry locally or use synthetic diagnostics.", file=sys.stderr)
    return 1
