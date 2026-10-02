#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="assets/responsive/home"
mkdir -p "$OUT_DIR"

resize_jpeg() {
  local src="$1"
  local width="$2"
  local out="$3"

  if [[ ! -f "$src" ]]; then
    echo "Missing responsive-image pilot source: $src" >&2
    exit 1
  fi

  convert "$src" \
    -auto-orient \
    -strip \
    -resize "${width}x>" \
    -quality 84 \
    "$out"

  if [[ ! -s "$out" ]]; then
    echo "Responsive-image pilot failed to create: $out" >&2
    exit 1
  fi
}

# Home hero: 1536 × 1152 source.
resize_jpeg \
  "assets/event-photos/adventures/mount-sherman/2022-09-25-mount-sherman-summit-with-olive-01.jpeg" \
  400 \
  "$OUT_DIR/mount-sherman-400.jpeg"
resize_jpeg \
  "assets/event-photos/adventures/mount-sherman/2022-09-25-mount-sherman-summit-with-olive-01.jpeg" \
  800 \
  "$OUT_DIR/mount-sherman-800.jpeg"
resize_jpeg \
  "assets/event-photos/adventures/mount-sherman/2022-09-25-mount-sherman-summit-with-olive-01.jpeg" \
  1200 \
  "$OUT_DIR/mount-sherman-1200.jpeg"

# Favorite memory: 1536 × 864 source.
for width in 400 800 1200; do
  resize_jpeg \
    "assets/event-photos/adventures/tennessee-pass-2022/2022-01-02-tennessee-pass-pink-sunrise-01.jpeg" \
    "$width" \
    "$OUT_DIR/tennessee-pass-$width.jpeg"
done

# Favorite memory: 1536 × 874 source.
resize_jpeg \
  "assets/event-photos/races/chicago-marathon-2021/2021-10-10-chicago-marathon-course-01.jpeg" \
  400 \
  "$OUT_DIR/chicago-marathon-400.jpeg"
resize_jpeg \
  "assets/event-photos/races/chicago-marathon-2021/2021-10-10-chicago-marathon-course-01.jpeg" \
  800 \
  "$OUT_DIR/chicago-marathon-800.jpeg"
resize_jpeg \
  "assets/event-photos/races/chicago-marathon-2021/2021-10-10-chicago-marathon-course-01.jpeg" \
  1200 \
  "$OUT_DIR/chicago-marathon-1200.jpeg"

# Favorite memory: 1199 × 1199 source.
resize_jpeg \
  "assets/event-photos/races/twin-cities-marathon-2015/2015-10-04-twin-cities-marathon-finish-01.jpeg" \
  400 \
  "$OUT_DIR/twin-cities-marathon-400.jpeg"
resize_jpeg \
  "assets/event-photos/races/twin-cities-marathon-2015/2015-10-04-twin-cities-marathon-finish-01.jpeg" \
  800 \
  "$OUT_DIR/twin-cities-marathon-800.jpeg"

echo "Responsive-image pilot generated in $OUT_DIR"
