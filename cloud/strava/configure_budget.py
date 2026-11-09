#!/usr/bin/env python3
"""Owner-run billing metadata tool; never reads secrets, caches, or activity data.

Creates a $3 gross Cloud Run monthly spend cap and a $1 net project alert.
Authentication stays inside Google's ADC/AuthorizedSession implementation. Run
personally in an authenticated Cloud Shell or owner administration environment.
"""
from __future__ import annotations

import argparse
import copy
import re
import time

BASE_URL = "https://billingbudgets.googleapis.com/v1/"
CAP_NAME = "Private Strava Cloud Run $3 monthly spend cap"
ALERT_NAME = "Private Strava $1 monthly net project alert"
FIELDS = "name,displayName,budgetFilter,amount,thresholdRules,notificationsRule,ownershipScope,spendCap"


class BudgetError(RuntimeError):
    """Fixed diagnostic only; never include response bodies or exception values."""

    def __init__(self, code="budget_configuration_failed"):
        self.code = code
        super().__init__(code)


def desired_budgets(project_number):
    result = []
    for name, amount, cap in ((CAP_NAME, "3", True), (ALERT_NAME, "1", False)):
        body = {
            "displayName": name,
            "budgetFilter": {
                "projects": ["projects/" + project_number],
                "creditTypesTreatment": "EXCLUDE_ALL_CREDITS" if cap else "INCLUDE_ALL_CREDITS",
                "calendarPeriod": "MONTH",
            },
            "amount": {"specifiedAmount": {"currencyCode": "USD", "units": amount, "nanos": 0}},
            "thresholdRules": [{"thresholdPercent": value, "spendBasis": "CURRENT_SPEND"}
                               for value in ((0.5, 0.8, 1.0) if cap else (1.0,))],
            "notificationsRule": {"enableProjectLevelRecipients": True},
            "ownershipScope": "ALL_USERS",
        }
        if cap:
            body["budgetFilter"]["services"] = ["services/152E-C115-5142"]
            body["spendCap"] = {"inputState": "CONFIGURED"}
        result.append(body)
    return result


def _identifiers(billing_account_id, project_number, project_id):
    if (not isinstance(billing_account_id, str)
            or not re.fullmatch(r"[0-9A-Fa-f]{6}-[0-9A-Fa-f]{6}-[0-9A-Fa-f]{6}", billing_account_id)
            or not isinstance(project_number, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", project_number)
            or not isinstance(project_id, str) or not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project_id)):
        raise BudgetError("budget_configuration_invalid")


def _settings_match(actual, desired):
    """Compare effective settings, allowing documented omitted/empty defaults."""
    try:
        if not isinstance(actual, dict) or actual.get("displayName") != desired["displayName"]:
            return False
        filters = actual.get("budgetFilter", {})
        wanted = desired["budgetFilter"]
        if (not isinstance(filters, dict)
                or set(filters) - {"projects", "services", "creditTypesTreatment", "calendarPeriod",
                                   "resourceAncestors", "creditTypes", "subaccounts", "labels"}
                or filters.get("projects") != wanted["projects"]
                or filters.get("services", []) != wanted.get("services", [])
                or filters.get("creditTypesTreatment", "INCLUDE_ALL_CREDITS") != wanted["creditTypesTreatment"]
                or filters.get("calendarPeriod", "MONTH") != "MONTH"
                or any(filters.get(key) for key in ("resourceAncestors", "creditTypes", "subaccounts", "labels"))):
            return False
        amount = actual.get("amount", {})
        money = amount.get("specifiedAmount", {})
        if (set(amount) != {"specifiedAmount"} or not isinstance(money, dict)
                or set(money) - {"currencyCode", "units", "nanos"}
                or money.get("currencyCode") != "USD"
                or str(money.get("units")) != desired["amount"]["specifiedAmount"]["units"]
                or type(money.get("nanos", 0)) is not int or money.get("nanos", 0) != 0):
            return False
        rules = actual.get("thresholdRules", [])
        if not isinstance(rules, list) or len(rules) != len(desired["thresholdRules"]):
            return False
        thresholds = []
        for rule in rules:
            if (not isinstance(rule, dict) or set(rule) - {"thresholdPercent", "spendBasis"}
                    or type(rule.get("thresholdPercent")) not in (int, float)
                    or rule.get("spendBasis", "CURRENT_SPEND") not in ("CURRENT_SPEND", "BASIS_UNSPECIFIED")):
                return False
            thresholds.append(rule["thresholdPercent"])
        if sorted(thresholds) != sorted(rule["thresholdPercent"] for rule in desired["thresholdRules"]):
            return False
        notifications = actual.get("notificationsRule", {})
        if (not isinstance(notifications, dict)
                or set(notifications) - {"enableProjectLevelRecipients", "disableDefaultIamRecipients",
                                         "pubsubTopic", "monitoringNotificationChannels", "schemaVersion"}
                or notifications.get("enableProjectLevelRecipients") is not True
                or notifications.get("disableDefaultIamRecipients", False) is not False
                or notifications.get("pubsubTopic", "") != ""
                or notifications.get("monitoringNotificationChannels", []) != []
                or notifications.get("schemaVersion", "") != ""
                or actual.get("ownershipScope", "ALL_USERS") not in ("ALL_USERS", "OWNERSHIP_SCOPE_UNSPECIFIED")):
            return False
        if "spendCap" in desired:
            cap = actual.get("spendCap")
            return (isinstance(cap, dict)
                    and set(cap) <= {"inputState", "outputState", "reconciling"}
                    and cap.get("inputState", "CONFIGURED") == "CONFIGURED"
                    and type(cap.get("reconciling", False)) is bool)
        return "spendCap" not in actual
    except (AttributeError, TypeError, ValueError):
        return False


def configure_budgets(session, billing_account_id, project_number, project_id, *,
                      now=time.monotonic, sleep=time.sleep, timeout=60):
    """Idempotent, bounded metadata operations through an injected HTTP session.

    No PATCH or DELETE is issued. After any ambiguous create, rerun this tool to
    discover the known name instead of blindly retrying the POST.
    """
    _identifiers(billing_account_id, project_number, project_id)
    if type(timeout) not in (int, float) or not 0 < timeout <= 300:
        raise BudgetError("budget_configuration_invalid")
    deadline = now() + timeout
    parent = "billingAccounts/" + billing_account_id + "/budgets"
    resource_pattern = re.compile(re.escape(parent) + r"/[A-Za-z0-9_-]{1,128}\Z")

    def resource_name(value):
        if not isinstance(value, str) or not resource_pattern.fullmatch(value):
            raise BudgetError("budget_response_invalid")
        return value

    def request(method, resource, **kwargs):
        remaining = deadline - now()
        if remaining <= 0:
            raise BudgetError("budget_verification_timeout")
        try:
            response = session.request(
                method, BASE_URL + resource,
                headers={"x-goog-user-project": project_id},
                timeout=(min(5, remaining), min(15, remaining)),
                max_allowed_time=remaining, allow_redirects=False, **kwargs)
            if response.status_code not in (200, 201):
                raise BudgetError("budget_request_failed")
            body = response.json()
            if not isinstance(body, dict):
                raise BudgetError("budget_response_invalid")
            return body
        except BudgetError:
            raise
        except Exception:
            raise BudgetError("budget_request_failed") from None

    def verify(name, desired):
        while True:
            actual = request("GET", resource_name(name), params={"fields": FIELDS})
            if actual.get("name") != name:
                raise BudgetError("budget_response_invalid")
            if not _settings_match(actual, desired):
                raise BudgetError("budget_configuration_conflict")
            if "spendCap" not in desired:
                return
            cap = actual["spendCap"]
            if not cap.get("reconciling", False):
                if cap.get("outputState") not in ("CONFIGURED", "ENFORCED"):
                    raise BudgetError("budget_configuration_conflict")
                return
            remaining = deadline - now()
            if remaining <= 0:
                raise BudgetError("budget_verification_timeout")
            sleep(min(1, remaining))

    desired = desired_budgets(project_number)
    matches = {body["displayName"]: [] for body in desired}
    page_token, seen = "", set()
    for _ in range(100):
        params = {"scope": "projects/" + project_number, "pageSize": 100}
        if page_token:
            params["pageToken"] = page_token
        page = request("GET", parent, params=params)
        budgets = page.get("budgets", [])
        if not isinstance(budgets, list) or any(not isinstance(item, dict) for item in budgets):
            raise BudgetError("budget_response_invalid")
        for item in budgets:
            if item.get("displayName") in matches:
                matches[item["displayName"]].append(resource_name(item.get("name")))
        page_token = page.get("nextPageToken", "")
        if not isinstance(page_token, str) or len(page_token) > 4096 or page_token in seen:
            raise BudgetError("budget_response_invalid")
        if not page_token:
            break
        seen.add(page_token)
    else:
        raise BudgetError("budget_response_invalid")
    # Inspect every known existing budget before creating either missing one.
    for body in desired:
        existing = matches[body["displayName"]]
        if len(existing) > 1:
            raise BudgetError("budget_configuration_conflict")
        if existing:
            verify(existing[0], body)
    names = []
    for body in desired:
        existing = matches[body["displayName"]]
        name = existing[0] if existing else resource_name(request("POST", parent, json=copy.deepcopy(body)).get("name"))
        verify(name, body)
        names.append(name)
    return names


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        raise BudgetError("budget_configuration_invalid")


def main(argv=None, session=None):
    owned_session = None
    try:
        parser = _Parser(description=__doc__)
        parser.add_argument("--billing-account", required=True)
        parser.add_argument("--project-number", required=True)
        parser.add_argument("--project", required=True, help="Project ID used for API quota and billing metadata scope.")
        args = parser.parse_args(argv)
        _identifiers(args.billing_account, args.project_number, args.project)
        if session is None:
            import google.auth
            from google.auth.transport.requests import AuthorizedSession
            credentials, _ = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-billing"], quota_project_id=args.project)
            owned_session = session = AuthorizedSession(credentials, refresh_timeout=10, max_refresh_attempts=1)
        names = configure_budgets(session, args.billing_account, args.project_number, args.project)
        print("budget_guards_verified")
        for name in names:
            print(name)
        return 0
    except BudgetError as exc:
        print(exc.code)
        return 1
    except Exception:
        print("budget_configuration_failed")
        return 1
    finally:
        if owned_session is not None:
            try:
                owned_session.close()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
