#!/usr/bin/env python3
"""Refresh pins/hashes using only public PyPI JSON metadata; installs nothing.

Run deliberately during dependency maintenance with a Python environment that
provides packaging (or pip's vendored packaging). Review and build the resulting
lock for Linux CPython 3.14 before deploying an image.
"""
import json
from pathlib import Path
import urllib.request

try:
    from packaging.markers import default_environment
    from packaging.requirements import Requirement
    from packaging.utils import canonicalize_name
    from packaging.version import Version
except ImportError:
    from pip._vendor.packaging.markers import default_environment
    from pip._vendor.packaging.requirements import Requirement
    from pip._vendor.packaging.utils import canonicalize_name
    from pip._vendor.packaging.version import Version

ROOT = Path(__file__).resolve().parent


def refresh():
    environment = dict(default_environment(), python_version="3.14", python_full_version="3.14.0", sys_platform="linux", platform_system="Linux", platform_machine="x86_64", implementation_name="cpython", platform_python_implementation="CPython")
    requirements = [Requirement(line) for line in (ROOT / "requirements.in").read_text().splitlines() if line.strip() and not line.startswith("#")]
    constraints, extras, selected, metadata = {}, {}, {}, {}
    pending = list(requirements)
    while pending:
        req = pending.pop(0)
        name = canonicalize_name(req.name)
        constraints.setdefault(name, set()).add(str(req.specifier))
        previous_extras = extras.get(name, set()).copy()
        extras.setdefault(name, set()).update(req.extras)
        if name not in metadata:
            with urllib.request.urlopen("https://pypi.org/pypi/" + name + "/json", timeout=30) as response:
                metadata[name] = json.load(response)
        if name in selected and all(Version(selected[name][0]) in Requirement(name + constraint).specifier for constraint in constraints[name]) and previous_extras == extras[name]:
            continue
        available = sorted((Version(v) for v in metadata[name]["releases"] if not Version(v).is_prerelease and not Version(v).is_devrelease), reverse=True)
        version = next(v for v in available if all(v in Requirement(name + constraint).specifier for constraint in constraints[name]) and metadata[name]["releases"][str(v)] and not all(f.get("yanked") for f in metadata[name]["releases"][str(v)]))
        with urllib.request.urlopen("https://pypi.org/pypi/" + name + "/" + str(version) + "/json", timeout=30) as response:
            release = json.load(response)
        python_constraint = release["info"].get("requires_python") or ""
        if python_constraint and Version("3.14.0") not in Requirement("python" + python_constraint).specifier:
            raise ValueError("selected_dependency_does_not_support_python314")
        selected[name] = (str(version), release)
        for dependency in release["info"].get("requires_dist") or []:
            child = Requirement(dependency)
            if child.marker is None or any(child.marker.evaluate(dict(environment, extra=extra)) for extra in extras[name] | {""}):
                pending.append(child)
        if len(selected) > 100:
            raise ValueError("unexpected_dependency_graph")
    lines = ["# Public PyPI metadata lock for Linux CPython 3.14; regenerated with update_lock.py.", "# Install with --only-binary=:all: --require-hashes. No unpinned downloads."]
    for name, (version, release) in sorted(selected.items()):
        hashes = sorted(set(item["digests"]["sha256"] for item in release["urls"] if item["packagetype"] == "bdist_wheel" and not item.get("yanked")))
        if not hashes:
            raise ValueError("dependency_has_no_wheel")
        lines.append(name + "==" + version + " \\")
        lines.extend("    --hash=sha256:" + value + (" \\" if index < len(hashes) - 1 else "") for index, value in enumerate(hashes))
    (ROOT / "requirements.lock").write_text("\n".join(lines) + "\n")
    print("public_dependency_lock_ready packages=" + str(len(selected)))


if __name__ == "__main__":
    refresh()
