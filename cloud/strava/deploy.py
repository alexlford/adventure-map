#!/usr/bin/env python3
"""Explicit source-only build or image rollout. Never installs/grants/activates.

Requires prior reviewed Terraform bootstrap and Google authentication performed
by the owner (or a protected GitHub environment through short-lived WIF).
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from package_source import ROOT, package


def run(arguments, impersonate=None):
    command = ["gcloud", *arguments, "--quiet"]
    if impersonate:
        command.append("--impersonate-service-account=" + impersonate)
    result = subprocess.run(command, check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise ValueError("deployment_command_failed")
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("build", "rollout"))
    parser.add_argument("--project", required=True)
    parser.add_argument("--region", default="us-central1")
    parser.add_argument("--prefix", default="strava-private")
    parser.add_argument("--release", help="Unique immutable image tag, e.g. reviewed Git commit SHA.")
    parser.add_argument("--image", help="Exact digest from a successful source-only build.")
    parser.add_argument("--impersonate", help="Optional pre-authorized deploy service account email.")
    args = parser.parse_args()
    for value in (args.project, args.region, args.prefix):
        if not re.fullmatch(r"[a-z][a-z0-9-]{1,62}", value):
            parser.error("invalid resource identifier")
    if not shutil.which("gcloud"):
        parser.error("gcloud is required; install/authenticate outside this script")
    if args.impersonate and not re.fullmatch(r"[a-z][a-z0-9-]+@[a-z][a-z0-9-]+\.iam\.gserviceaccount\.com", args.impersonate):
        parser.error("invalid service account")
    repository = args.region + "-docker.pkg.dev/" + args.project + "/" + args.prefix + "/runtime"
    try:
        if args.action == "build":
            if not args.release or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{6,126}", args.release):
                parser.error("build requires a unique reviewed --release tag")
            image = repository + ":" + args.release
            with tempfile.TemporaryDirectory(prefix="strava-source-build-") as directory:
                source = Path(directory) / "source.tar.gz"
                package(source)
                result = json.loads(run([
                    "builds", "submit", str(source), "--project=" + args.project, "--region=" + args.region,
                    "--config=" + str(ROOT / "cloud/strava/cloudbuild.yaml"),
                    "--service-account=projects/" + args.project + "/serviceAccounts/" + args.prefix + "-build@" + args.project + ".iam.gserviceaccount.com",
                    "--gcs-source-staging-dir=gs://" + args.project + "-" + args.prefix + "-build-source/submissions",
                    "--substitutions=_IMAGE=" + image, "--suppress-logs", "--format=json(status,results.images)"
                ], args.impersonate))
            digest = next((item.get("digest", "") for item in result.get("results", {}).get("images", []) if item.get("name") == image), "")
            if result.get("status") != "SUCCESS" or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
                raise ValueError("image_digest_unavailable")
            print("source_build_completed")
            print(repository + "@" + digest)
        else:
            if not args.image or not re.fullmatch(re.escape(repository) + r"@sha256:[0-9a-f]{64}", args.image):
                parser.error("rollout requires an immutable image from the dedicated repository")
            for mode in ("weekly", "recovery", "cleanup"):
                run(["run", "jobs", "update", args.prefix + "-" + mode, "--project=" + args.project, "--region=" + args.region, "--image=" + args.image, "--format=none"], args.impersonate)
            run(["run", "services", "update", args.prefix + "-review", "--project=" + args.project, "--region=" + args.region, "--image=" + args.image, "--format=none"], args.impersonate)
            print("image_rollout_completed")
    except (ValueError, KeyError, OSError, subprocess.SubprocessError):
        print("deployment_failed")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
