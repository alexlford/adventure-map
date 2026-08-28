#!/usr/bin/env python3
import json
import sys
from pathlib import Path

MEMORY_FILES = [
    Path("data/race-memories.json"),
    Path("data/race-memories-archive.json"),
]


def fail(message: str) -> None:
    print(f"race-media validation: {message}", file=sys.stderr)
    raise SystemExit(1)


def validate_webp(path: Path) -> None:
    raw = path.read_bytes()
    if len(raw) < 16:
        fail(f"{path} is only {len(raw)} bytes")
    if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        fail(f"{path} does not have a valid WebP RIFF header")
    declared_size = int.from_bytes(raw[4:8], "little") + 8
    if declared_size > len(raw):
        fail(
            f"{path} is truncated: header declares {declared_size} bytes, "
            f"file contains {len(raw)}"
        )


def main() -> None:
    referenced = set()

    for memory_file in MEMORY_FILES:
        if not memory_file.exists():
            fail(f"missing memory catalog {memory_file}")
        payload = json.loads(memory_file.read_text(encoding="utf-8"))
        for record_id, record in (payload.get("records") or {}).items():
            for photo in record.get("photos") or []:
                src = str(photo.get("src") or "").strip()
                if not src or src.startswith(("http://", "https://")):
                    continue
                if src.startswith("/"):
                    src = src[1:]
                referenced.add((record_id, Path(src)))

    for record_id, path in sorted(referenced, key=lambda item: str(item[1])):
        if not path.exists():
            fail(f"{record_id} references missing photo {path}")
        if path.suffix.lower() == ".webp":
            validate_webp(path)

    print(f"race-media validation: {len(referenced)} referenced photos are present and intact")


if __name__ == "__main__":
    main()
