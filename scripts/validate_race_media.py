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


def webp_error(path: Path) -> str | None:
    raw = path.read_bytes()
    if len(raw) < 16:
        return f"{path} is only {len(raw)} bytes"
    if raw[:4] != b"RIFF" or raw[8:12] != b"WEBP":
        return f"{path} does not have a valid WebP RIFF header"
    declared_size = int.from_bytes(raw[4:8], "little") + 8
    if declared_size > len(raw):
        return (
            f"{path} is truncated: header declares {declared_size} bytes, "
            f"file contains {len(raw)}"
        )
    return None


def validate_svg(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if len(text) < 128 or "<svg" not in text or "<image" not in text:
        fail(f"{path} does not contain a usable embedded-image SVG")
    if "data:image/" not in text:
        fail(f"{path} does not embed an image payload")


def main() -> None:
    referenced = set()

    for memory_file in MEMORY_FILES:
        if not memory_file.exists():
            fail(f"missing memory catalog {memory_file}")
        payload = json.loads(memory_file.read_text(encoding="utf-8"))
        for record_id, record in (payload.get("records") or {}).items():
            for photo in record.get("photos") or []:
                src = str(photo.get("src") or "").strip()
                if not src or src.startswith(("http://", "https://", "data:")):
                    continue
                if src.startswith("/"):
                    src = src[1:]
                referenced.add((record_id, Path(src)))

    fallback_count = 0
    for record_id, path in sorted(referenced, key=lambda item: str(item[1])):
        suffix = path.suffix.lower()
        if suffix == ".webp":
            if path.exists():
                error = webp_error(path)
                if error is None:
                    continue
            else:
                error = f"{record_id} references missing photo {path}"

            fallback = path.with_suffix(".svg")
            if fallback.exists():
                validate_svg(fallback)
                fallback_count += 1
                print(f"race-media validation: using fallback {fallback} ({error})")
                continue
            fail(error)

        if not path.exists():
            fail(f"{record_id} references missing photo {path}")
        if suffix == ".svg":
            validate_svg(path)

    print(
        f"race-media validation: {len(referenced)} referenced photos are present and intact"
        f" ({fallback_count} repaired by fallback assets)"
    )


if __name__ == "__main__":
    main()
