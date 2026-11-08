#!/usr/bin/env python3
"""Create deterministic source-only Cloud Build input without scanning private data.

Only the named source directories/files are considered. No Git archive, recursive
repository walk, credentials, exports, caches, reports, or public data are read.
"""
import argparse
import gzip
import io
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[2]
PRIVATE_MODULES = ("__init__.py", "review.py", "storage.py", "sync.py", "transport.py")
BUILD_FILES = ("Dockerfile", "Dockerfile.dockerignore", "requirements.lock", "gunicorn.conf.py")


def source_paths(root=ROOT):
    paths = [root / "scripts/strava_private" / name for name in PRIVATE_MODULES]
    paths += [root / "cloud/strava" / name for name in BUILD_FILES]
    directory = root / "scripts/strava_cloud"
    if directory.is_symlink():
        raise ValueError("source_directory_symlink")
    paths += sorted(path for path in directory.glob("*.py") if not path.name.startswith("test_"))
    paths += [directory / "static" / name for name in ("review.css", "review.js")]
    if not any(path.name == "worker.py" for path in paths):
        raise ValueError("worker_source_missing")
    for path in paths:
        if path.is_symlink() or not path.is_file() or any(parent.is_symlink() for parent in path.parents if parent == root or root in parent.parents):
            raise ValueError("source_file_invalid")
        if path.stat().st_size > 512 * 1024:
            raise ValueError("source_file_oversized")
    return sorted(paths)


def package(destination, root=ROOT):
    paths = source_paths(root)
    if destination.exists():
        raise ValueError("destination_exists")
    with destination.open("xb") as output:
        with gzip.GzipFile(fileobj=output, mode="wb", filename="", mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as archive:
                for path in paths:
                    content = path.read_bytes()
                    entry = tarfile.TarInfo(path.relative_to(root).as_posix())
                    entry.size = len(content)
                    entry.mode = 0o644
                    entry.mtime = 0
                    entry.uid = entry.gid = 0
                    archive.addfile(entry, io.BytesIO(content))
    return len(paths)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    count = package(args.destination)
    print("source_package_ready files=" + str(count))
