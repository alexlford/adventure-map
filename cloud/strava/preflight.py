#!/usr/bin/env python3
"""Read deployment metadata only; print fixed pass/fail codes, never API bodies.

Does not access secret versions, Firestore documents, objects, activity APIs,
request logs, or the review UI. Run as the owner/metadata administrator.
"""
import argparse
import json
import re
import shutil
import subprocess

APIS = {"run.googleapis.com", "cloudscheduler.googleapis.com", "secretmanager.googleapis.com", "firestore.googleapis.com", "storage.googleapis.com", "iap.googleapis.com", "cloudbuild.googleapis.com", "artifactregistry.googleapis.com", "monitoring.googleapis.com", "logging.googleapis.com"}


def query(arguments):
    result = subprocess.run(["gcloud", *arguments, "--quiet"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False, timeout=60)
    if result.returncode:
        raise ValueError("metadata_query_failed")
    return json.loads(result.stdout)


def public_binding(policy):
    return any(member in {"allUsers", "allAuthenticatedUsers"} for binding in policy.get("bindings", []) for member in binding.get("members", []))


def scheduler_state(state, expect_active):
    return state == ("ENABLED" if expect_active else "PAUSED")


def safe_project_sinks(sinks):
    # A project-level exclusion only covers its own default sink. Fail closed
    # rather than claiming a custom sink's arbitrary filter is equivalent.
    return all(item.get("name") in {"_Default", "_Required"} or item.get("disabled") is True for item in sinks)


def safe_bucket(bucket):
    iam = bucket.get("iamConfiguration", {})
    prevention = bucket.get("public_access_prevention", iam.get("publicAccessPrevention"))
    uniform = bucket.get("uniform_bucket_level_access", iam.get("uniformBucketLevelAccess", {}).get("enabled"))
    versioning = bucket.get("versioning_enabled", bucket.get("versioning", {}).get("enabled", False))
    soft = bucket.get("soft_delete_policy", bucket.get("softDeletePolicy", {})) or {}
    seconds = soft.get("retention_duration_seconds", soft.get("retentionDurationSeconds", 0))
    retention = bucket.get("retention_policy", bucket.get("retentionPolicy"))
    lifecycle = bucket.get("lifecycle_config", bucket.get("lifecycle", {})) or {}
    rules = lifecycle.get("rule", []) if isinstance(lifecycle, dict) else lifecycle
    deletes = any(rule.get("action", {}).get("type") == "Delete" and rule.get("condition", {}).get("age") == 2 for rule in rules)
    return prevention == "enforced" and uniform is True and versioning is False and int(seconds) == 0 and not retention and deletes


def check(args, fetch=query):
    checks = []
    def record(name, condition):
        checks.append((name, bool(condition)))
    project = fetch(["projects", "describe", args.project, "--format=json(projectId,projectNumber,lifecycleState,parent)"])
    record("project_active", project.get("lifecycleState") == "ACTIVE")
    billing = fetch(["billing", "projects", "describe", args.project, "--format=json(billingEnabled)"])
    record("billing_enabled", billing.get("billingEnabled") is True)
    services = fetch(["services", "list", "--enabled", "--project=" + args.project, "--format=json(config.name)"])
    record("required_apis", APIS <= {service.get("config", {}).get("name") for service in services})
    if args.phase == "bootstrap":
        return checks
    prefix = args.prefix
    record("ancestor_sinks_attested", not project.get("parent") or args.ancestor_sinks_reviewed)
    sinks = fetch(["logging", "sinks", "list", "--project=" + args.project, "--format=json(name,disabled)"])
    record("no_active_custom_logging_sink", safe_project_sinks(sinks))
    bucket = args.project + "-" + prefix + "-48h"
    storage = fetch(["storage", "buckets", "describe", "gs://" + bucket, "--format=json"])
    record("private_48h_bucket", safe_bucket(storage))
    policy = fetch(["storage", "buckets", "get-iam-policy", "gs://" + bucket, "--format=json(bindings)"])
    record("no_public_cache_binding", not public_binding(policy))
    database = fetch(["firestore", "databases", "describe", "--project=" + args.project, "--database=" + args.database, "--format=json(type,pointInTimeRecoveryEnablement)"])
    record("control_pitr_disabled", database.get("pointInTimeRecoveryEnablement") == "POINT_IN_TIME_RECOVERY_DISABLED")
    backups = fetch(["firestore", "backups", "schedules", "list", "--project=" + args.project, "--database=" + args.database, "--format=json(name)"])
    record("control_backups_disabled", backups == [])
    default_sink = fetch(["logging", "sinks", "describe", "_Default", "--project=" + args.project, "--format=json(exclusions)"])
    exclusions = default_sink.get("exclusions", [])
    record("request_logs_excluded", any(item.get("name") == prefix + "-no-request-urls" and item.get("disabled", False) is False and 'log_id("run.googleapis.com/requests")' in item.get("filter", "") for item in exclusions))
    record("iap_access_urls_excluded", any(item.get("name") == prefix + "-no-iap-access-urls" and item.get("disabled", False) is False and 'log_id("cloudaudit.googleapis.com/data_access")' in item.get("filter", "") for item in exclusions))
    record("unstructured_runtime_excluded", any(item.get("name") == prefix + "-fixed-status-only" and item.get("disabled", False) is False and 'NOT jsonPayload.status=' in item.get("filter", "") and 'log_id("run.googleapis.com/stdout")' in item.get("filter", "") for item in exclusions))
    service = fetch(["run", "services", "describe", prefix + "-review", "--region=" + args.region, "--project=" + args.project, "--format=json(metadata.annotations)"])
    annotations = service.get("metadata", {}).get("annotations", {})
    record("native_iap_enabled", str(annotations.get("run.googleapis.com/iap-enabled", "")).lower() == "true")
    policy = fetch(["run", "services", "get-iam-policy", prefix + "-review", "--region=" + args.region, "--project=" + args.project, "--format=json(bindings)"])
    record("no_public_run_binding", not public_binding(policy))
    invokers = {member for binding in policy.get("bindings", []) if binding.get("role") == "roles/run.invoker" for member in binding.get("members", [])}
    record("iap_only_run_invoker", invokers == {"serviceAccount:service-" + str(project.get("projectNumber", "")) + "@gcp-sa-iap.iam.gserviceaccount.com"})
    iap = fetch(["iap", "web", "get-iam-policy", "--resource-type=cloud-run", "--service=" + prefix + "-review", "--region=" + args.region, "--project=" + args.project, "--format=json(bindings)"])
    owners = {member for binding in iap.get("bindings", []) if binding.get("role") == "roles/iap.httpsResourceAccessor" for member in binding.get("members", [])}
    record("owner_only_iap_policy", not public_binding(iap) and owners == {"user:" + args.owner_email})
    for mode, cron in (("weekly", "0 9 * * 1"), ("recovery", "17 * * * *"), ("cleanup", "37 * * * *")):
        schedule = fetch(["scheduler", "jobs", "describe", prefix + "-" + mode, "--location=" + args.region, "--project=" + args.project, "--format=json(state,schedule,timeZone,httpTarget.oauthToken.serviceAccountEmail)"])
        record(mode + "_schedule", schedule.get("schedule") == cron and schedule.get("timeZone") == "America/Denver")
        record(mode + "_state", scheduler_state(schedule.get("state"), args.expect_active))
        identity = schedule.get("httpTarget", {}).get("oauthToken", {}).get("serviceAccountEmail")
        record(mode + "_authenticated", identity == prefix + "-scheduler@" + args.project + ".iam.gserviceaccount.com")
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--region", default="us-central1")
    parser.add_argument("--prefix", default="strava-private")
    parser.add_argument("--database", default="(default)")
    parser.add_argument("--phase", choices=("bootstrap", "deployed"), default="bootstrap")
    parser.add_argument("--expect-active", action="store_true", help="Post-activation check; owner has already verified OAuth and first sync.")
    parser.add_argument("--owner-email", default="", help="Exact Google owner email; required for deployed checks.")
    parser.add_argument("--ancestor-sinks-reviewed", action="store_true", help="Owner attests org/folder sinks cannot retain request URLs; required if project has a parent.")
    args = parser.parse_args()
    if not all(re.fullmatch(r"[a-z][a-z0-9-]{1,62}", value) for value in (args.project, args.region, args.prefix)) or not (args.database == "(default)" or re.fullmatch(r"[a-z][a-z0-9-]{1,62}", args.database)) or not shutil.which("gcloud") or (args.phase == "deployed" and not re.fullmatch(r"[^ @]+@[^ @]+\.[^ @]+", args.owner_email)):
        print("FAIL preflight_configuration")
        return 1
    try:
        results = check(args)
    except (ValueError, KeyError, subprocess.SubprocessError, OSError):
        print("FAIL metadata_unavailable")
        return 1
    for name, passed in results:
        print(("PASS " if passed else "FAIL ") + name)
    return 0 if all(passed for _, passed in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
