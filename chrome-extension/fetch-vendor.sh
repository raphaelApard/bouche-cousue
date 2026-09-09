#!/bin/sh
# Downloads the MediaPipe runtime and models into extension/vendor/.
#
# A Firefox MV3 extension page may only run scripts it ships itself
# (script-src 'self'), so the CDN the web app loads from is not an option
# here. Everything the detector needs is fetched once and packaged.
#
# The no-SIMD WebAssembly build is deliberately skipped: it doubles the
# download and only matters to browsers older than Firefox 89.
set -eu

VISION="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14"
MODELS="https://storage.googleapis.com/mediapipe-models"
HERE=$(dirname "$0")
VENDOR="$HERE/vendor"

mkdir -p "$VENDOR/tasks-vision/wasm" "$VENDOR/models"

fetch() {
  echo "  $2"
  curl -fsSL --retry 3 -o "$2" "$1"
}

echo "MediaPipe runtime:"
fetch "$VISION/vision_bundle.mjs"                 "$VENDOR/tasks-vision/vision_bundle.mjs"
fetch "$VISION/wasm/vision_wasm_internal.js"      "$VENDOR/tasks-vision/wasm/vision_wasm_internal.js"
fetch "$VISION/wasm/vision_wasm_internal.wasm"    "$VENDOR/tasks-vision/wasm/vision_wasm_internal.wasm"

echo "Models:"
fetch "$MODELS/face_landmarker/face_landmarker/float16/1/face_landmarker.task" \
      "$VENDOR/models/face_landmarker.task"
# Optional: without it, covered-mouth detection simply stays off.
fetch "$MODELS/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" \
      "$VENDOR/models/hand_landmarker.task"

echo "Done. $(du -sh "$VENDOR" | cut -f1) in $VENDOR"
