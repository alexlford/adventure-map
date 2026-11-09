"""Synthetic billing guard tests: in-memory HTTP sessions and clocks only."""
import builtins
import contextlib
import copy
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch


HERE = Path(__file__).resolve().parent
ACCOUNT = "000000-111111-222222"
NUMBER = "123456789012"
PROJECT = "synthetic-private-sync"
COLLECTION = "https://billingbudgets.googleapis.com/v1/billingAccounts/" + ACCOUNT + "/budgets"
CAP_NAME = "Private Strava Cloud Run $3 monthly spend cap"
ALERT_NAME = "Private Strava $1 monthly net project alert"
SENTINEL = "synthetic-private-response-must-not-be-displayed"


def load_module():
    spec = importlib.util.spec_from_file_location("synthetic_configure_budget", HERE / "configure_budget.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


budget = load_module()


class Clock:
    def __init__(self):
        self.value, self.sleeps = 0.0, []

    def now(self):
        return self.value

    def sleep(self, duration):
        if duration <= 0:
            raise AssertionError("Polling must advance the fake clock.")
        self.sleeps.append(duration)
        self.value += duration


class Response:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status
        self.text = SENTINEL

    def json(self):
        if isinstance(self.body, Exception):
            raise self.body
        return copy.deepcopy(self.body)


def resource(desired, index):
    value = copy.deepcopy(desired)
    value["name"] = "billingAccounts/" + ACCOUNT + "/budgets/00000000-0000-0000-0000-" + str(index).zfill(12)
    if "spendCap" in value:
        value["spendCap"] = {"outputState": "CONFIGURED", "reconciling": False}
    return value


class Session:
    """A strict fake of only the documented Budgets collection/resource calls."""
    def __init__(self, existing=(), pages=None):
        self.resources = {value["name"]: copy.deepcopy(value) for value in existing}
        self.listed = copy.deepcopy(list(existing))
        self.pages = copy.deepcopy(pages)
        self.calls, self.created = [], []
        self.resource_responses = {}
        self.list_response = None
        self.post_response = None
        self.after_create = None
        self.next_index = 100

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, copy.deepcopy(kwargs)))
        if method not in {"GET", "POST"}:
            raise AssertionError("Budget guard must not patch or delete budgets.")
        if kwargs.get("headers") != {"x-goog-user-project": PROJECT}:
            raise AssertionError("Requests must specify only the expected quota-project header.")
        if kwargs.get("allow_redirects") is not False:
            raise AssertionError("Credential-bearing requests must not follow redirects.")
        remaining = kwargs["max_allowed_time"]
        if not 0 < remaining <= 60 or kwargs["timeout"] != (min(5, remaining), min(15, remaining)):
            raise AssertionError("Every request needs a bounded remaining deadline.")
        if url == COLLECTION and method == "GET":
            params = kwargs["params"]
            expected = {"scope": "projects/" + NUMBER, "pageSize": 100}
            if set(params) - {"scope", "pageSize", "pageToken"} or any(params.get(k) != v for k, v in expected.items()):
                raise AssertionError("List requests must be scoped to the one project.")
            if self.list_response is not None:
                return self.list_response
            if self.pages is not None:
                index = int(params.get("pageToken", "0"))
                result = {"budgets": self.pages[index]}
                if index + 1 < len(self.pages):
                    result["nextPageToken"] = str(index + 1)
                return Response(result)
            return Response({"budgets": self.listed})
        if url == COLLECTION and method == "POST":
            value = resource(kwargs["json"], self.next_index)
            self.next_index += 1
            self.created.append(copy.deepcopy(kwargs["json"]))
            if self.after_create:
                self.after_create(value)
            self.resources[value["name"]] = value
            return self.post_response if self.post_response is not None else Response(value)
        if method == "GET" and url.startswith("https://billingbudgets.googleapis.com/v1/"):
            name = url.removeprefix("https://billingbudgets.googleapis.com/v1/")
            responses = self.resource_responses.get(name)
            if responses:
                return responses.pop(0)
            return Response(self.resources[name]) if name in self.resources else Response({"error": SENTINEL}, 404)
        raise AssertionError("Unexpected endpoint in the synthetic session.")


class BudgetTests(unittest.TestCase):
    def desired(self):
        return budget.desired_budgets(NUMBER)

    def existing(self):
        return [resource(value, index) for index, value in enumerate(self.desired(), 1)]

    def configure(self, session, clock=None, timeout=60):
        clock = clock or Clock()
        return budget.configure_budgets(session, ACCOUNT, NUMBER, PROJECT,
                                        now=clock.now, sleep=clock.sleep, timeout=timeout)

    def assert_refused_without_creating(self, existing):
        session = Session(existing)
        with self.assertRaises(budget.BudgetError):
            self.configure(session)
        self.assertEqual(session.created, [])

    def test_desired_guards_use_distinct_gross_cap_and_net_project_alert(self):
        cap, alert = self.desired()
        self.assertEqual([cap["displayName"], alert["displayName"]], [CAP_NAME, ALERT_NAME])
        self.assertEqual(cap["budgetFilter"], {
            "projects": ["projects/" + NUMBER], "services": ["services/152E-C115-5142"],
            "creditTypesTreatment": "EXCLUDE_ALL_CREDITS", "calendarPeriod": "MONTH"})
        self.assertEqual(alert["budgetFilter"], {
            "projects": ["projects/" + NUMBER], "creditTypesTreatment": "INCLUDE_ALL_CREDITS",
            "calendarPeriod": "MONTH"})
        for value, amount, thresholds in ((cap, "3", {0.5, 0.8, 1.0}), (alert, "1", {1.0})):
            money = value["amount"]["specifiedAmount"]
            self.assertEqual((money["currencyCode"], money["units"], money.get("nanos", 0)), ("USD", amount, 0))
            self.assertEqual({rule["thresholdPercent"] for rule in value["thresholdRules"]}, thresholds)
            self.assertTrue(all(rule.get("spendBasis", "CURRENT_SPEND") == "CURRENT_SPEND"
                                for rule in value["thresholdRules"]))
            self.assertTrue(value["notificationsRule"]["enableProjectLevelRecipients"])
            self.assertFalse(value["notificationsRule"].get("disableDefaultIamRecipients", False))
        self.assertEqual(cap["spendCap"]["inputState"], "CONFIGURED")
        self.assertNotIn("spendCap", alert)

    def test_new_guards_are_created_and_individually_verified(self):
        session = Session()
        names = self.configure(session)
        self.assertEqual(session.created, self.desired())
        self.assertEqual(len(names), 2)
        for name in names:
            self.assertTrue(name.startswith("billingAccounts/" + ACCOUNT + "/budgets/"))
            self.assertIn(("GET", "https://billingbudgets.googleapis.com/v1/" + name),
                          [(method, url) for method, url, _ in session.calls])

    def test_existing_guards_accept_omitted_defaults_and_unordered_thresholds(self):
        existing = self.existing()
        for value in existing:
            value["thresholdRules"].reverse()
            for rule in value["thresholdRules"]:
                rule.pop("spendBasis", None)
            value["notificationsRule"].pop("disableDefaultIamRecipients", None)
            value["notificationsRule"].update(monitoringNotificationChannels=[], pubsubTopic="")
            value["budgetFilter"].update(labels={}, creditTypes=[], subaccounts=[], resourceAncestors=[])
        existing[0]["spendCap"].pop("reconciling")
        session = Session(existing)
        self.assertEqual(self.configure(session), [value["name"] for value in existing])
        self.assertEqual(session.created, [])

    def test_paginated_listing_is_completed_before_creation(self):
        existing = self.existing()
        session = Session(existing, pages=[[existing[0]], [existing[1]]])
        self.assertEqual(self.configure(session), [value["name"] for value in existing])
        self.assertEqual(session.created, [])
        self.assertEqual([kwargs["params"].get("pageToken") for method, url, kwargs in session.calls
                          if url == COLLECTION and method == "GET"], [None, "1"])

    def test_mismatched_existing_alert_refuses_before_creating_missing_cap(self):
        mutations = {
            "amount": lambda value: value["amount"]["specifiedAmount"].update(units="2"),
            "project": lambda value: value["budgetFilter"].update(projects=["projects/987654321012"]),
            "service": lambda value: value["budgetFilter"].update(services=["services/152E-C115-5142"]),
            "label": lambda value: value["budgetFilter"].update(labels={"scope": ["restricted"]}),
            "credits": lambda value: value["budgetFilter"].update(creditTypesTreatment="EXCLUDE_ALL_CREDITS"),
            "period": lambda value: value["budgetFilter"].update(calendarPeriod="YEAR"),
            "threshold": lambda value: value["thresholdRules"][0].update(thresholdPercent=0.5),
            "forecast": lambda value: value["thresholdRules"][0].update(spendBasis="FORECASTED_SPEND"),
            "owner": lambda value: value["notificationsRule"].update(enableProjectLevelRecipients=False),
            "default_recipients": lambda value: value["notificationsRule"].update(disableDefaultIamRecipients=True),
            "extra_recipient": lambda value: value["notificationsRule"].update(monitoringNotificationChannels=["projects/x/notificationChannels/1"]),
            "pubsub": lambda value: value["notificationsRule"].update(pubsubTopic="projects/x/topics/private"),
            "spend_cap": lambda value: value.update(spendCap={"outputState": "CONFIGURED"}),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                alert = self.existing()[1]
                mutate(alert)
                self.assert_refused_without_creating([alert])

    def test_duplicate_names_or_wrong_billing_resource_refuse_without_creation(self):
        cap, alert = self.existing()
        duplicate = copy.deepcopy(alert)
        duplicate["name"] += "-duplicate"
        self.assert_refused_without_creating([cap, alert, duplicate])
        cap["name"] = cap["name"].replace(ACCOUNT, "333333-444444-555555")
        self.assert_refused_without_creating([cap])

    def test_cap_must_retain_the_one_cloud_run_service_and_exclude_credits(self):
        for updates in ({"services": []}, {"services": ["services/152E-C115-5142", "services/other"]},
                        {"creditTypesTreatment": "INCLUDE_ALL_CREDITS"}):
            with self.subTest(updates=updates):
                cap = self.existing()[0]
                cap["budgetFilter"].update(updates)
                self.assert_refused_without_creating([cap])

    def test_server_created_scope_mismatch_is_detected_by_resource_readback(self):
        session = Session()
        session.after_create = lambda value: value["budgetFilter"].update(projects=["projects/987654321012"])
        with self.assertRaises(budget.BudgetError):
            self.configure(session)
        self.assertTrue(any(method == "GET" and url != COLLECTION for method, url, _ in session.calls))

    def test_invalid_create_resource_name_cannot_trigger_an_external_read(self):
        session = Session()
        session.post_response = Response({"name": "https://synthetic-attacker.invalid/private"})
        with self.assertRaises(budget.BudgetError):
            self.configure(session)
        self.assertTrue(all(url == COLLECTION for _, url, _ in session.calls))

    def test_reconciling_cap_is_polled_until_ready_with_bounded_deadlines(self):
        existing = self.existing()
        session, clock = Session(existing), Clock()
        pending = copy.deepcopy(existing[0])
        pending["spendCap"]["reconciling"] = True
        session.resource_responses[existing[0]["name"]] = [Response(pending), Response(pending)]
        self.assertEqual(self.configure(session, clock), [value["name"] for value in existing])
        self.assertGreaterEqual(len(clock.sleeps), 2)
        self.assertLess(clock.value, 60)

    def test_cap_enforced_state_is_valid_but_lifted_state_is_refused(self):
        existing = self.existing()
        existing[0]["spendCap"]["outputState"] = "ENFORCED"
        self.assertEqual(self.configure(Session(existing)), [value["name"] for value in existing])
        existing[0]["spendCap"]["outputState"] = "AWAITING_NEXT_PERIOD"
        self.assert_refused_without_creating(existing)

    def test_reconciliation_has_a_finite_overall_timeout(self):
        existing = self.existing()
        existing[0]["spendCap"]["reconciling"] = True
        session, clock = Session(existing), Clock()
        with self.assertRaises(budget.BudgetError):
            self.configure(session, clock, timeout=3)
        self.assertEqual(clock.value, 3)
        self.assertGreater(len(clock.sleeps), 0)
        self.assertLess(len(session.calls), 20)

    def test_http_and_malformed_responses_raise_fixed_budget_errors(self):
        for response in (Response({"error": SENTINEL}, 403), Response(ValueError(SENTINEL)),
                         Response({"budgets": SENTINEL})):
            with self.subTest(response=response):
                session = Session()
                session.list_response = response
                with self.assertRaises(budget.BudgetError) as caught:
                    self.configure(session)
                self.assertNotIn(SENTINEL, str(caught.exception))
                self.assertEqual(session.created, [])

    def test_main_prints_names_only_after_both_guards_are_verified(self):
        arguments = ["--billing-account", ACCOUNT, "--project-number", NUMBER, "--project", PROJECT]
        session = Session()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = budget.main(arguments, session=session)
        self.assertEqual(result, 0)
        self.assertEqual(output.getvalue().splitlines(), ["budget_guards_verified", *session.resources])
        session = Session(self.existing())
        session.resource_responses[self.existing()[1]["name"]] = [Response({"error": SENTINEL}, 500)]
        output, errors = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            result = budget.main(arguments, session=session)
        self.assertEqual(result, 1)
        combined = output.getvalue() + errors.getvalue()
        self.assertNotIn(SENTINEL, combined)
        self.assertNotIn("billingAccounts/", combined)

    def test_import_and_injected_session_never_load_google_credentials(self):
        original = builtins.__import__

        def guarded_import(name, *args, **kwargs):
            if name == "google" or name.startswith("google."):
                raise AssertionError("Synthetic budget tests must not load Google credentials.")
            return original(name, *args, **kwargs)
        with patch("builtins.__import__", side_effect=guarded_import):
            isolated = load_module()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(isolated.main(["--billing-account", ACCOUNT, "--project-number", NUMBER,
                                                "--project", PROJECT], session=Session()), 0)


if __name__ == "__main__":
    unittest.main()
